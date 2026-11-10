'use strict';

process.env.CAPYBARA_LAZY_CONFIG = '1';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const ActivityPayoutAction = require('../../packages/core/src/actions/ActivityPayoutAction');
const { AdvanceLedgerAction } = require('../../packages/core/src/actions/AdvanceLedgerAction');
const { getChildAdvancePath } = require('../../packages/core/src/advance/advancePath');
const { projectAdvanceRemainder, readAdvanceEvents } = require('../../packages/core/src/advance/advanceProjection');
const { getChildDebtPath } = require('../../packages/core/src/debt/debtPath');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

const SCOPE = {
  mode: 'mock',
  chainId: '31337',
  token: '0x1111111111111111111111111111111111111111',
  pool: '0x2222222222222222222222222222222222222222',
};

const DECIMALS = 8;
const RAW_400 = 400n * (10n ** BigInt(DECIMALS));

const baseEnv = {
  CAPY_RPC_URL: 'http://127.0.0.1:8545',
  CAPY_CHAIN_ID: '31337',
  CAPY_MODE: 'mock',
  CAPY_TOKEN_ADDRESS: SCOPE.token,
  PARENT_ADDRESS: SCOPE.pool,
  PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
  CAPY_DAILY_TRISTAN: '5',
  CAPY_DAILY_BASTIAN: '5',
  TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
  TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
  BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
  BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
};

describe('advance debt and action 4 regression', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    delete process.env.CAPYBARA_ADVANCE_ID;
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-adv06-debt-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function advanceRoot() {
    return path.join(tempRoot, 'advance');
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

  function ledger(env, limits) {
    return new AdvanceLedgerAction({
      config: {
        mode: SCOPE.mode,
        chainId: SCOPE.chainId,
        token: { address: SCOPE.token },
        parent: { address: SCOPE.pool },
      },
    }, {
      advanceRoot: advanceRoot(),
      limitsPath: limits,
      decimals: DECIMALS,
      env,
      balanceFn: () => RAW_400,
    });
  }

  it('leaves the debt journal alone when action 4 has no id and when advance ops run', async () => {
    const debtFile = getChildDebtPath({
      child: 'tristan',
      scope: SCOPE,
      debtRoot: path.join(tempRoot, 'debt'),
      mode: 'mock',
    });
    await fs.mkdir(path.dirname(debtFile), { recursive: true });
    const debtBytes = Buffer.from('{"type":"create","debt_id":"debt-1"}\n');
    await fs.writeFile(debtFile, debtBytes);
    const limits = await limitsPath();

    const issued = await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'seed',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }, limits).execute();
    expect(issued.journalPath.startsWith(advanceRoot())).to.equal(true);
    expect(issued.journalPath).to.not.include(`${path.sep}debt${path.sep}`);

    const config = buildConfigFromEnv(baseEnv);
    const router = {
      config,
      walletRegistry: new WalletRegistry(config, logger),
      capyToken: {
        setProvider() {},
        getDecimals: async () => DECIMALS,
        getSymbol: async () => 'CAPY',
        getBalance: async () => 0n,
      },
      provider: null,
      rpcManager: null,
      logger,
    };
    const paid = await new ActivityPayoutAction(router, {
      walletName: 'tristan',
      system: 'cidead',
      level: 'primaria-3',
      period: 'T1',
      subject: 'matematicas',
      activityType: 'control',
      subtype: 'controlnaya',
      metricValue: '8.5',
      amountRaw: '500',
      logDir: path.join(tempRoot, 'logs'),
      advanceRoot: advanceRoot(),
      balanceFn: () => 0n,
      transferFn: async () => ({ txHash: '0xpay', mock: true }),
    }).execute();
    expect(paid.advanceSettled).to.equal(false);

    const advanceFile = getChildAdvancePath({
      child: 'tristan',
      scope: SCOPE,
      advanceRoot: advanceRoot(),
      mode: 'mock',
    });
    let events = await readAdvanceEvents(advanceFile);
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
    expect(events.some((event) => String(event.type).startsWith('settle'))).to.equal(false);

    await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'settle',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }, limits).execute();
    await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '1',
      CAPYBARA_ADVANCE_REASON: 'second',
      CAPYBARA_ADVANCE_ID: 'adv-forgive',
    }, limits).execute();
    await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'forgive',
      CAPYBARA_ADVANCE_ID: 'adv-forgive',
      CAPYBARA_ADVANCE_REASON: 'waived',
    }, limits).execute();

    events = await readAdvanceEvents(advanceFile);
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(0n);
    expect(projectAdvanceRemainder(events, 'adv-forgive')).to.equal(0n);
    expect(Buffer.compare(await fs.readFile(debtFile), debtBytes)).to.equal(0);
  });
});
