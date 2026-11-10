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

describe('advance AC matrix offline', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    delete process.env.CAPYBARA_ADVANCE_ID;
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-adv06-matrix-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function advanceRoot() {
    return path.join(tempRoot, 'advance');
  }

  async function writeLimits(body) {
    const filePath = path.join(tempRoot, 'advance-limits.json');
    await fs.writeFile(filePath, `${JSON.stringify(body)}\n`);
    return filePath;
  }

  async function openLimits() {
    return writeLimits({
      max_open_advances: { disabled: true },
      max_advance_outstanding: { disabled: true },
      children: {},
    });
  }

  /**
   * @param {Record<string, string>} env
   * @param {{ child?: string, transferFn?: Function, balanceFn?: Function }} [extra]
   */
  function ledger(env, extra = {}) {
    return new AdvanceLedgerAction({
      config: {
        mode: SCOPE.mode,
        chainId: SCOPE.chainId,
        token: { address: SCOPE.token },
        parent: { address: SCOPE.pool },
      },
    }, {
      advanceRoot: advanceRoot(),
      limitsPath: extra.limitsPath,
      decimals: DECIMALS,
      env,
      balanceFn: extra.balanceFn ?? (() => RAW_400),
      transferFn: extra.transferFn,
    });
  }

  function journal(child = 'tristan', scope = SCOPE) {
    return getChildAdvancePath({
      child,
      scope,
      advanceRoot: advanceRoot(),
      mode: scope.mode,
    });
  }

  async function issue(child, id, limitsPath, amount = '400') {
    return ledger({
      CAPYBARA_WALLET: child,
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: amount,
      CAPYBARA_ADVANCE_REASON: 'matrix',
      CAPYBARA_ADVANCE_ID: id,
    }, { limitsPath }).execute();
  }

  function payoutRouter() {
    const config = buildConfigFromEnv(baseEnv);
    return {
      config,
      walletRegistry: new WalletRegistry(config, logger),
      capyToken: {
        provider: { id: 'mock-provider' },
        setProvider() {},
        getDecimals: async () => DECIMALS,
        getSymbol: async () => 'CAPY',
        getBalance: async () => 0n,
      },
      provider: { id: 'mock-provider' },
      rpcManager: null,
      logger,
    };
  }

  function payout(extra) {
    return new ActivityPayoutAction(payoutRouter(), {
      ...payoutOpts,
      amountRaw: '500',
      logDir: path.join(tempRoot, 'logs'),
      advanceRoot: advanceRoot(),
      balanceFn: () => 0n,
      transferFn: async () => ({ txHash: '0xpay', mock: true }),
      ...extra,
    }).execute();
  }

  it('AC-01 issues 400 in mock with the hash and an open remainder', async () => {
    let transfers = 0;
    const limitsPath = await openLimits();
    const issued = await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'activity float',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }, {
      limitsPath,
      transferFn: async () => {
        transfers += 1;
        return { hash: '0xlive' };
      },
    }).execute();
    expect(transfers).to.equal(0);
    expect(issued.txHash).to.equal('mock:adv-400');
    const events = await readAdvanceEvents(journal());
    expect(events[0].tx_hash).to.equal('mock:adv-400');
    expect(events[0].amounts.amount).to.equal(RAW_400.toString());
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
  });

  it('AC-02 denies a second open advance and records the override violation', async () => {
    const limitsPath = await writeLimits({
      max_open_advances: { amount: 1 },
      max_advance_outstanding: { disabled: true },
      children: {},
    });
    await issue('tristan', 'adv-1', limitsPath, '1');
    try {
      await issue('tristan', 'adv-2', limitsPath, '1');
      expect.fail('second open should be denied');
    } catch (error) {
      expect(error.message).to.include('advance issue denied');
      expect(error.message).to.include('open advances');
    }
    const overridden = await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '1',
      CAPYBARA_ADVANCE_REASON: 'family exception',
      CAPYBARA_ADVANCE_ID: 'adv-2',
      CAPYBARA_ADVANCE_OVERRIDE_REASON: 'family exception',
    }, { limitsPath }).execute();
    expect(overridden.overrideApplied).to.equal(true);
    const events = await readAdvanceEvents(journal());
    const row = events.find((event) => event.advance_id === 'adv-2');
    expect(row.violations.map((item) => item.code)).to.deep.equal(['max_open']);
  });

  it('AC-03 pays 500 without an advance id and leaves the advance open', async () => {
    const limitsPath = await openLimits();
    await issue('tristan', 'adv-400', limitsPath);
    const result = await payout({});
    expect(result.advanceSettled).to.equal(false);
    const events = await readAdvanceEvents(journal());
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
    expect(events.some((event) => String(event.type).startsWith('settle'))).to.equal(false);
  });

  it('AC-04 pays 500 and then claws back the open 400', async () => {
    const limitsPath = await openLimits();
    await issue('tristan', 'adv-400', limitsPath);
    const result = await payout({
      advanceId: 'adv-400',
      balanceFn: () => 0n,
    });
    expect(result.advanceSettled).to.equal(true);
    const events = await readAdvanceEvents(journal());
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(0n);
    expect(events.filter((event) => event.type === 'settle-settled')).to.have.length(1);
  });

  it('AC-05 refuses the payout when the child balance plus the payout is short', async () => {
    const limitsPath = await openLimits();
    await issue('tristan', 'adv-400', limitsPath);
    try {
      await payout({ advanceId: 'adv-400', amountRaw: '100', balanceFn: () => 0n });
      expect.fail('short preflight should throw');
    } catch (error) {
      expect(error.message).to.equal('child balance plus payout is below the advance remainder');
    }
    const events = await readAdvanceEvents(journal());
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
    expect(events.some((event) => String(event.type).startsWith('settle'))).to.equal(false);
  });

  it('AC-06 settles manually after a payout that had no advance id', async () => {
    const limitsPath = await openLimits();
    await issue('tristan', 'adv-400', limitsPath);
    await payout({});
    let transfers = 0;
    const settled = await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'settle',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }, {
      limitsPath,
      transferFn: async () => {
        transfers += 1;
        return { hash: '0xlive' };
      },
    }).execute();
    expect(transfers).to.equal(0);
    expect(settled.remainder).to.equal('0');
    const events = await readAdvanceEvents(journal());
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(0n);
  });

  it('AC-07 forgives an open 400 without a transfer and keeps the reason', async () => {
    const limitsPath = await openLimits();
    await issue('bastian', 'adv-forgive', limitsPath);
    let transfers = 0;
    const forgiven = await ledger({
      CAPYBARA_WALLET: 'bastian',
      CAPYBARA_ADVANCE_OP: 'forgive',
      CAPYBARA_ADVANCE_ID: 'adv-forgive',
      CAPYBARA_ADVANCE_REASON: 'waived',
    }, {
      limitsPath,
      transferFn: async () => {
        transfers += 1;
        return { hash: '0xlive' };
      },
    }).execute();
    expect(transfers).to.equal(0);
    expect(forgiven.remainder).to.equal('0');
    const events = await readAdvanceEvents(journal('bastian'));
    expect(events[1].type).to.equal('forgive');
    expect(events[1].comment).to.equal('waived');
    expect(projectAdvanceRemainder(events, 'adv-forgive')).to.equal(0n);
  });

  it('AC-08 rejects a second settle and a forgive of a closed advance', async () => {
    const limitsPath = await openLimits();
    await issue('tristan', 'adv-400', limitsPath);
    await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'settle',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }, { limitsPath }).execute();
    try {
      await ledger({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_ADVANCE_OP: 'settle',
        CAPYBARA_ADVANCE_ID: 'adv-400',
      }, { limitsPath }).execute();
      expect.fail('second settle');
    } catch (error) {
      expect(error.message).to.include('advance is already closed');
    }
    try {
      await ledger({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_ADVANCE_OP: 'forgive',
        CAPYBARA_ADVANCE_ID: 'adv-400',
        CAPYBARA_ADVANCE_REASON: 'too late',
      }, { limitsPath }).execute();
      expect.fail('forgive closed');
    } catch (error) {
      expect(error.message).to.include('advance is already closed');
    }
  });

  it('AC-09 keeps mock issue, settle, and forgive off the prod journal', async () => {
    const limitsPath = await openLimits();
    let transfers = 0;
    const transferFn = async () => {
      transfers += 1;
      return { hash: '0xlive' };
    };
    await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'mock',
      CAPYBARA_ADVANCE_ID: 'adv-mock',
    }, { limitsPath, transferFn }).execute();
    await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'settle',
      CAPYBARA_ADVANCE_ID: 'adv-mock',
    }, { limitsPath, transferFn }).execute();
    await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '1',
      CAPYBARA_ADVANCE_REASON: 'mock forgive',
      CAPYBARA_ADVANCE_ID: 'adv-forgive',
    }, { limitsPath, transferFn }).execute();
    await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'forgive',
      CAPYBARA_ADVANCE_ID: 'adv-forgive',
      CAPYBARA_ADVANCE_REASON: 'waived',
    }, { limitsPath, transferFn }).execute();
    expect(transfers).to.equal(0);
    const prod = journal('tristan', { ...SCOPE, mode: 'gfl_reality' });
    await expect(fs.access(prod)).to.be.rejected;
    expect(journal()).to.include(`${path.sep}mock${path.sep}`);
  });

  it('AC-10 lists the open advance and restores show history', async () => {
    const limitsPath = await openLimits();
    await issue('tristan', 'adv-show', limitsPath);
    const summary = await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'summary',
    }, { limitsPath }).execute();
    expect(summary.advances.map((row) => row.advanceId)).to.deep.equal(['adv-show']);
    const shown = await ledger({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'show',
      CAPYBARA_ADVANCE_ID: 'adv-show',
    }, { limitsPath }).execute();
    expect(shown.history[0].type).to.equal('issue');
    expect(shown.card.remainder).to.equal(RAW_400.toString());
  });

  it('AC-11 leaves the debt journal bytes unchanged', async () => {
    const debtFile = getChildDebtPath({
      child: 'tristan',
      scope: SCOPE,
      debtRoot: path.join(tempRoot, 'debt'),
      mode: 'mock',
    });
    await fs.mkdir(path.dirname(debtFile), { recursive: true });
    const debtBytes = Buffer.from('{"type":"create"}\n');
    await fs.writeFile(debtFile, debtBytes);
    const limitsPath = await openLimits();
    const issued = await issue('tristan', 'adv-400', limitsPath);
    expect(issued.journalPath).to.not.include(`${path.sep}debt${path.sep}`);
    expect(Buffer.compare(await fs.readFile(debtFile), debtBytes)).to.equal(0);
  });

  it('AC-12 does not close another child when one advance is settled', async () => {
    const limitsPath = await openLimits();
    await issue('tristan', 'adv-tristan', limitsPath);
    await issue('bastian', 'adv-bastian', limitsPath);
    await ledger({
      CAPYBARA_WALLET: 'bastian',
      CAPYBARA_ADVANCE_OP: 'settle',
      CAPYBARA_ADVANCE_ID: 'adv-bastian',
    }, { limitsPath }).execute();
    const tristan = await readAdvanceEvents(journal('tristan'));
    const bastian = await readAdvanceEvents(journal('bastian'));
    expect(projectAdvanceRemainder(tristan, 'adv-tristan')).to.equal(RAW_400);
    expect(projectAdvanceRemainder(bastian, 'adv-bastian')).to.equal(0n);
    expect(journal('tristan')).to.not.equal(journal('bastian'));
  });
});
