'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { DebtLedgerAction, exitCodeForDebtError } = require('../../packages/core/src/actions/DebtLedgerAction');
const ChargeToPoolAction = require('../../packages/core/src/actions/ChargeToPoolAction');
const { EXAMPLE_LIMITS_PATH } = require('../../packages/core/src/debt/debtLimits');
const { readDebtEvents } = require('../../packages/core/src/debt/debtProjection');
const { getChildDebtPath } = require('../../packages/core/src/debt/debtPath');
const { acquireDebtFileLock, releaseDebtFileLock } = require('../../packages/core/src/debt/debtLock');

const config = buildConfigFromEnv({
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
});

const SCOPE = {
  mode: 'mock',
  chainId: '31337',
  token: '0x1111111111111111111111111111111111111111',
  pool: '0x2222222222222222222222222222222222222222',
};

function yes() {
  return Promise.resolve('да');
}

describe('debt repay and reconcile', () => {
  /** @type {string} */
  let tempRoot;
  /** @type {bigint} */
  let balance;
  /** @type {number} */
  let transfers;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-debt-repay-'));
    balance = 40n;
    transfers = 0;
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function debtRoot() {
    return path.join(tempRoot, 'debt');
  }

  function childFile() {
    return getChildDebtPath({
      child: 'tristan',
      scope: SCOPE,
      debtRoot: debtRoot(),
      mode: 'mock',
    });
  }

  /**
   * @param {NodeJS.ProcessEnv} env
   * @param {{ afterPending?: () => Promise<void>, transferFn?: Function, receiptFn?: Function }} [options]
   */
  function action(env, options = {}) {
    return new DebtLedgerAction({ config }, {
      debtRoot: debtRoot(),
      limitsPath: EXAMPLE_LIMITS_PATH,
      confirmFn: yes,
      isTty: true,
      now: new Date('2026-10-26T22:00:00.000Z'),
      decimals: 0,
      env,
      balanceFn: async () => balance,
      transferFn: options.transferFn ?? (async (_child, pool, amount) => {
        expect(pool).to.equal(SCOPE.pool);
        transfers += 1;
        balance -= amount;
        return {
          hash: '0xrepay',
          wait: async () => ({ status: 1, transactionHash: '0xrepay' }),
        };
      }),
      receiptFn: options.receiptFn ?? (async () => ({ status: 1, transactionHash: '0xrepay' })),
      afterPending: options.afterPending,
    });
  }

  async function createDebt(debtId, amount) {
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: debtId,
      CAPYBARA_DEBT_AMOUNT: amount,
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
  }

  it('AC-02 repays 50 percent of 60 and moves 30 into the pool balance', async () => {
    await createDebt('debt-ac02', '60');
    const result = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_DEBT_ID: 'debt-ac02',
      CAPYBARA_DEBT_PERCENT: '50',
    }).execute();
    expect(result.repaid).to.equal('30');
    expect(result.remainder).to.equal('30');
    expect(balance).to.equal(10n);
    expect(transfers).to.equal(1);
    const events = await readDebtEvents(childFile());
    expect(events.some((event) => event.type === 'repay-intent' && event.operation_id === result.operationId)).to.equal(true);
    expect(events.filter((event) => event.type === 'repay-settled')).to.have.length(1);
  });

  it('AC-03 refuses 30 against balance 20 and writes nothing', async () => {
    balance = 20n;
    await createDebt('debt-ac03', '60');
    const before = await fs.readFile(childFile(), 'utf8');
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'repay',
        CAPYBARA_DEBT_ID: 'debt-ac03',
        CAPYBARA_DEBT_AMOUNT: '30',
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/required 30/);
      expect(error.message).to.match(/available 20/);
      expect(error.message).to.match(/shortfall 10/);
    }
    expect(await fs.readFile(childFile(), 'utf8')).to.equal(before);
    expect(balance).to.equal(20n);
    expect(transfers).to.equal(0);
  });

  it('AC-04 full repay stores the payment time and flags closure handoff', async () => {
    balance = 60n;
    await createDebt('debt-ac04', '60');
    const result = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_DEBT_ID: 'debt-ac04',
      CAPYBARA_DEBT_ALL: 'true',
    }).execute();
    expect(result.remainder).to.equal('0');
    expect(result.closureHandoff).to.equal(true);
    const events = await readDebtEvents(childFile());
    const settled = events.find((event) => event.type === 'repay-settled');
    expect(settled.timestamps.recorded_at).to.match(/^\d{4}-\d{2}-\d{2}T/);
    expect(settled.tx_hash).to.equal('0xrepay');
    const summary = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'summary',
    }).execute();
    expect(summary.debts[0].closureHandoff).to.equal(true);
    expect(summary.debts[0].pending).to.equal(false);
  });

  it('AC-20 and AC-21 reconcile one hash and do not transfer again', async () => {
    await createDebt('debt-ac20', '60');
    let operationId;
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'repay',
        CAPYBARA_DEBT_ID: 'debt-ac20',
        CAPYBARA_DEBT_AMOUNT: '30',
      }, {
        afterPending: async () => {
          throw new Error('journal write failed after send');
        },
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/journal write failed/);
    }
    expect(transfers).to.equal(1);
    expect(balance).to.equal(10n);
    const pendingEvents = await readDebtEvents(childFile());
    operationId = pendingEvents.find((event) => event.type === 'repay-pending').operation_id;
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'repay',
        CAPYBARA_DEBT_ID: 'debt-ac20',
        CAPYBARA_DEBT_AMOUNT: '10',
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/until reconcile/);
    }
    expect(transfers).to.equal(1);
    const reconciled = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'reconcile',
      CAPYBARA_DEBT_ID: 'debt-ac20',
      CAPYBARA_DEBT_OPERATION_ID: operationId,
    }).execute();
    expect(reconciled.transferred).to.equal(false);
    expect(reconciled.remainder).to.equal('30');
    expect(transfers).to.equal(1);
    const again = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'reconcile',
      CAPYBARA_DEBT_ID: 'debt-ac20',
      CAPYBARA_DEBT_OPERATION_ID: operationId,
    }).execute();
    expect(again.idempotent).to.equal(true);
    expect(transfers).to.equal(1);
    const events = await readDebtEvents(childFile());
    expect(events.filter((event) => event.type === 'repay-settled' && event.tx_hash === '0xrepay')).to.have.length(1);
  });

  it('GAP-H1 reconcile of a reverted receipt writes repay-failed and keeps the remainder', async () => {
    await createDebt('debt-h1', '60');
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'repay',
        CAPYBARA_DEBT_ID: 'debt-h1',
        CAPYBARA_DEBT_AMOUNT: '30',
      }, {
        afterPending: async () => {
          throw new Error('journal write failed after send');
        },
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/journal write failed/);
    }
    const pendingEvents = await readDebtEvents(childFile());
    const operationId = pendingEvents.find((event) => event.type === 'repay-pending').operation_id;
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'reconcile',
        CAPYBARA_DEBT_ID: 'debt-h1',
        CAPYBARA_DEBT_OPERATION_ID: operationId,
      }, {
        receiptFn: async () => ({ status: 0, transactionHash: '0xrepay' }),
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.code).to.equal('EDEBT_VALIDATION');
      expect(error.message).to.match(/not confirmed/);
    }
    expect(transfers).to.equal(1);
    const events = await readDebtEvents(childFile());
    expect(events.some((event) => event.type === 'repay-failed' && event.tx_hash === '0xrepay')).to.equal(true);
    expect(events.some((event) => event.type === 'repay-settled')).to.equal(false);
    const summary = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'summary',
    }).execute();
    expect(summary.debts[0].remainder).to.equal('60');
  });

  it('GAP-M1 a broadcast without a hash closes as repay-failed', async () => {
    await createDebt('debt-m1', '60');
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'repay',
        CAPYBARA_DEBT_ID: 'debt-m1',
        CAPYBARA_DEBT_AMOUNT: '30',
      }, {
        transferFn: async () => {
          transfers += 1;
          throw new Error('broadcast failed');
        },
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.code).to.equal('EDEBT_VALIDATION');
      expect(error.message).to.match(/tx hash/);
    }
    expect(transfers).to.equal(1);
    const events = await readDebtEvents(childFile());
    expect(events.some((event) => event.type === 'repay-failed')).to.equal(true);
    expect(events.some((event) => event.type === 'repay-pending')).to.equal(false);
    const again = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_DEBT_ID: 'debt-m1',
      CAPYBARA_DEBT_AMOUNT: '10',
    }).execute();
    expect(again.remainder).to.equal('50');
    expect(transfers).to.equal(2);
  });

  it('GAP-L1 pending reconcile uses an exit distinct from cancel and confirmed failure', async () => {
    await createDebt('debt-l1', '60');
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'repay',
        CAPYBARA_DEBT_ID: 'debt-l1',
        CAPYBARA_DEBT_AMOUNT: '30',
      }, {
        transferFn: async () => {
          transfers += 1;
          return {
            hash: '0xpending',
            wait: async () => {
              throw new Error('timeout');
            },
          };
        },
        receiptFn: async () => null,
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.code).to.equal('EDEBT_PENDING');
      expect(exitCodeForDebtError(error)).to.equal(3);
    }
    const pendingEvents = await readDebtEvents(childFile());
    expect(pendingEvents.some((event) => event.type === 'repay-pending' && event.tx_hash === '0xpending')).to.equal(true);
    await createDebt('debt-l1b', '60');
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'repay',
        CAPYBARA_DEBT_ID: 'debt-l1b',
        CAPYBARA_DEBT_AMOUNT: '10',
      }, {
        transferFn: async () => ({
          hash: '0xfail',
          wait: async () => ({ status: 0 }),
        }),
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.code).to.equal('EDEBT_VALIDATION');
      expect(exitCodeForDebtError(error)).to.equal(1);
    }
    expect(exitCodeForDebtError({ code: 'ECANCEL' })).to.equal(2);
  });

  it('AC-22 a held debt-file lock rejects a second acquire', async () => {
    const filePath = childFile();
    await acquireDebtFileLock(filePath);
    try {
      await acquireDebtFileLock(filePath);
      expect.fail('should throw');
    } catch (error) {
      expect(error.code).to.equal('ELOCKED');
    } finally {
      await releaseDebtFileLock(filePath);
    }
  });

  it('AC-24 leaves the payment journal and action 3 untouched', async () => {
    const paymentFile = path.join(tempRoot, 'tristan.ndjson');
    const sentinel = '{"type":"charge","sentinel":true}\n';
    await fs.writeFile(paymentFile, sentinel);
    await createDebt('debt-ac24', '60');
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_DEBT_ID: 'debt-ac24',
      CAPYBARA_DEBT_AMOUNT: '10',
    }).execute();
    expect(await fs.readFile(paymentFile, 'utf8')).to.equal(sentinel);
    expect(typeof ChargeToPoolAction.prototype._transferChildToParent).to.equal('function');
    expect(typeof ChargeToPoolAction.prototype._writeChargeJournal).to.equal('function');
    const debtEvents = await readDebtEvents(childFile());
    expect(debtEvents.some((event) => event.type === 'charge')).to.equal(false);
    expect(debtEvents.some((event) => event.type === 'repay-settled')).to.equal(true);
  });
});
