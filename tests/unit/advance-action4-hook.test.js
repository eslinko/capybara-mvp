'use strict';

process.env.CAPYBARA_LAZY_CONFIG = '1';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const { ethers } = require('ethers');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const ActivityPayoutAction = require('../../packages/core/src/actions/ActivityPayoutAction');
const { AdvanceLedgerAction } = require('../../packages/core/src/actions/AdvanceLedgerAction');
const { readAdvanceEvents, projectAdvanceRemainder } = require('../../packages/core/src/advance/advanceProjection');
const { getChildAdvancePath } = require('../../packages/core/src/advance/advancePath');
const { appendAdvanceEvent } = require('../../packages/core/src/advance/advanceWriter');
const {
  getWalletLogPath,
  resolveLogDirForMode,
} = require('../../packages/core/src/daily-payments/ndjsonLogReader');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

const DECIMALS = 8;
const RAW_400 = 400n * (10n ** BigInt(DECIMALS));

const baseEnv = {
  CAPY_RPC_URL: 'http://127.0.0.1:8545',
  CAPY_CHAIN_ID: '31337',
  CAPY_MODE: 'mock',
  CAPY_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
  PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
  PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
  CAPY_DAILY_TRISTAN: '5',
  CAPY_DAILY_BASTIAN: '5',
  TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
  TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
  BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
  BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
};

const payoutOpts = {
  walletName: 'tristan',
  system: 'cidead',
  level: 'primaria-3',
  period: 'T1',
  subject: 'matematicas',
  activityType: 'control',
  subtype: 'controlnaya',
  metricValue: '8.5',
};

describe('action 4 advance hook', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-adv05-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function buildRouter(mode = 'mock') {
    const config = buildConfigFromEnv({ ...baseEnv, CAPY_MODE: mode });
    const capyToken = {
      provider: { id: 'mock-provider' },
      setProvider() {},
      getDecimals: async () => DECIMALS,
      getSymbol: async () => 'CAPY',
      getBalance: async (addr) => (
        addr === config.parent.address
          ? ethers.parseUnits('1000000', DECIMALS)
          : 0n
      ),
      transfer: async () => ({
        hash: '0xact4mocktx',
        wait: async () => ({ blockNumber: 77 }),
      }),
    };
    return {
      config,
      walletRegistry: new WalletRegistry(config, logger),
      capyToken,
      provider: { id: 'mock-provider' },
      rpcManager: null,
      logger,
    };
  }

  async function limitsPath() {
    const filePath = path.join(tempRoot, 'advance-limits.json');
    await fs.writeFile(filePath, `${JSON.stringify({
      max_open_advances: { disabled: true },
      max_advance_outstanding: { disabled: true },
      children: {},
    })}\n`);
    return filePath;
  }

  async function issueOpen(router, child = 'tristan') {
    const limits = await limitsPath();
    await new AdvanceLedgerAction(router, {
      advanceRoot: path.join(tempRoot, 'advance'),
      limitsPath: limits,
      decimals: DECIMALS,
      balanceFn: () => RAW_400,
      env: {
        CAPYBARA_WALLET: child,
        CAPYBARA_ADVANCE_OP: 'issue',
        CAPYBARA_ADVANCE_AMOUNT: '400',
        CAPYBARA_ADVANCE_ID: 'adv-400',
        CAPYBARA_ADVANCE_REASON: 'seed',
      },
    }).execute();
  }

  function advanceFile(router, child = 'tristan') {
    return getChildAdvancePath({
      child,
      advanceRoot: path.join(tempRoot, 'advance'),
      scope: {
        mode: router.config.mode,
        chainId: router.config.chainId,
        token: router.config.token.address,
        pool: router.config.parent.address,
      },
    });
  }

  async function activityRows(wallet, mode) {
    const filePath = getWalletLogPath(wallet, resolveLogDirForMode(path.join(tempRoot, 'logs'), mode));
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  it('leaves the advance open when CAPYBARA_ADVANCE_ID is absent', async () => {
    const router = buildRouter();
    await issueOpen(router);
    let confirmed = false;
    const result = await new ActivityPayoutAction(router, {
      ...payoutOpts,
      amountRaw: '500',
      logDir: path.join(tempRoot, 'logs'),
      advanceRoot: path.join(tempRoot, 'advance'),
      balanceFn: () => 0n,
      confirmFn: async () => {
        confirmed = true;
        return 'да';
      },
      transferFn: async () => ({ txHash: '0xpay', mock: true }),
    }).execute();
    expect(result.ok).to.equal(true);
    expect(result.advanceSettled).to.equal(false);
    expect(confirmed).to.equal(false);
    const events = await readAdvanceEvents(advanceFile(router));
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
    expect(events.some((event) => event.type === 'settle-settled')).to.equal(false);
    const rows = await activityRows('tristan', 'mock');
    expect(rows.some((row) => row.type === 'payout' && row.amount === '500')).to.equal(true);
  });

  it('rejects preflight before payout and settle', async () => {
    const router = buildRouter();
    await issueOpen(router);
    const debtFile = path.join(tempRoot, 'debt.ndjson');
    await fs.writeFile(debtFile, '{"debt":"untouched"}\n');
    const debtBefore = await fs.readFile(debtFile);
    try {
      await new ActivityPayoutAction(router, {
        ...payoutOpts,
        amountRaw: '100',
        advanceId: 'adv-400',
        logDir: path.join(tempRoot, 'logs'),
        advanceRoot: path.join(tempRoot, 'advance'),
        balanceFn: () => 0n,
        transferFn: async () => ({ txHash: '0xpay', mock: true }),
      }).execute();
      expect.fail('preflight should stop the payout');
    } catch (error) {
      expect(error.message).to.equal('child balance plus payout is below the advance remainder');
    }
    expect(await activityRows('tristan', 'mock')).to.have.length(0);
    const events = await readAdvanceEvents(advanceFile(router));
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
    expect(events.some((event) => event.type.startsWith('settle'))).to.equal(false);
    expect(await fs.readFile(debtFile)).to.deep.equal(debtBefore);
  });

  it('pays the full amount and then settles without a second confirm', async () => {
    const router = buildRouter();
    await issueOpen(router);
    const debtFile = path.join(tempRoot, 'debt.ndjson');
    await fs.writeFile(debtFile, '{"debt":"untouched"}\n');
    const debtBefore = await fs.readFile(debtFile);
    let payouts = 0;
    let confirmed = false;
    const result = await new ActivityPayoutAction(router, {
      ...payoutOpts,
      amountRaw: '500',
      advanceId: 'adv-400',
      logDir: path.join(tempRoot, 'logs'),
      advanceRoot: path.join(tempRoot, 'advance'),
      balanceFn: () => 0n,
      confirmFn: async () => {
        confirmed = true;
        return 'да';
      },
      transferFn: async () => {
        payouts += 1;
        return { txHash: '0xpay', mock: true };
      },
    }).execute();
    expect(result.advanceSettled).to.equal(true);
    expect(confirmed).to.equal(false);
    expect(payouts).to.equal(1);
    const rows = await activityRows('tristan', 'mock');
    expect(rows.filter((row) => row.type === 'payout').map((row) => row.amount)).to.deep.equal(['500']);
    const events = await readAdvanceEvents(advanceFile(router));
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(0n);
    expect(events.filter((event) => event.type === 'settle-settled')).to.have.length(1);
    expect(events.find((event) => event.type === 'settle-settled').tx_hash).to.equal('mock:adv-400');
    expect(await fs.readFile(debtFile)).to.deep.equal(debtBefore);
  });

  it('shows payout and clawback in one confirm and writes nothing on cancel', async () => {
    const router = buildRouter('gfl_reality');
    await appendAdvanceEvent({
      child: 'tristan',
      scope: {
        mode: router.config.mode,
        chainId: router.config.chainId,
        token: router.config.token.address,
        pool: router.config.parent.address,
      },
      advanceRoot: path.join(tempRoot, 'advance'),
      advanceId: 'adv-400',
      type: 'issue',
      amount: RAW_400,
    });
    /** @type {string} */
    let question = '';
    const result = await new ActivityPayoutAction(router, {
      ...payoutOpts,
      amountRaw: '500',
      advanceId: 'adv-400',
      logDir: path.join(tempRoot, 'logs'),
      advanceRoot: path.join(tempRoot, 'advance'),
      balanceFn: () => 0n,
      isTty: true,
      confirmFn: async (text) => {
        question = text;
        return 'нет';
      },
      transferFn: async () => ({ txHash: '0xpay', mock: true }),
    }).execute();
    expect(result.cancelled).to.equal(true);
    expect(question).to.include('выплату 500 CAPY');
    expect(question).to.include('возврат 400 CAPY');
    expect(await activityRows('tristan', 'gfl_reality')).to.have.length(0);
    const events = await readAdvanceEvents(advanceFile(router));
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
    expect(events.some((event) => event.type.startsWith('settle'))).to.equal(false);
  });

  it('does not settle a metrics-only payout when an advance id is set', async () => {
    const router = buildRouter();
    await issueOpen(router);
    const result = await new ActivityPayoutAction(router, {
      ...payoutOpts,
      metricValue: '0',
      advanceId: 'adv-400',
      logDir: path.join(tempRoot, 'logs'),
      advanceRoot: path.join(tempRoot, 'advance'),
      balanceFn: () => 0n,
    }).execute();
    expect(result.ok).to.equal(true);
    expect(result.advanceSettled).to.equal(false);
    const events = await readAdvanceEvents(advanceFile(router));
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
  });

  it('refuses an already open settle before the payout journal', async () => {
    const router = buildRouter();
    await issueOpen(router);
    await appendAdvanceEvent({
      child: 'tristan',
      scope: {
        mode: router.config.mode,
        chainId: router.config.chainId,
        token: router.config.token.address,
        pool: router.config.parent.address,
      },
      advanceRoot: path.join(tempRoot, 'advance'),
      advanceId: 'adv-400',
      type: 'settle-pending',
      amount: RAW_400,
      operationId: 'op-open',
      txHash: '0xpend',
    });
    let payouts = 0;
    try {
      await new ActivityPayoutAction(router, {
        ...payoutOpts,
        amountRaw: '500',
        advanceId: 'adv-400',
        logDir: path.join(tempRoot, 'logs'),
        advanceRoot: path.join(tempRoot, 'advance'),
        balanceFn: () => 0n,
        transferFn: async () => {
          payouts += 1;
          return { txHash: '0xpay', mock: true };
        },
      }).execute();
      expect.fail('an open settle should stop the payout');
    } catch (error) {
      expect(error.message).to.equal('advance settle is already open');
    }
    expect(payouts).to.equal(0);
    expect(await activityRows('tristan', 'mock')).to.have.length(0);
    const events = await readAdvanceEvents(advanceFile(router));
    expect(events.filter((event) => event.type === 'settle-pending')).to.have.length(1);
    expect(events.filter((event) => event.type === 'settle-settled')).to.have.length(0);
  });
});
