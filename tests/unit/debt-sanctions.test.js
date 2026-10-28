'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { DebtLedgerAction } = require('../../packages/core/src/actions/DebtLedgerAction');
const { EXAMPLE_LIMITS_PATH } = require('../../packages/core/src/debt/debtLimits');
const { readDebtEvents } = require('../../packages/core/src/debt/debtProjection');
const { getChildDebtPath } = require('../../packages/core/src/debt/debtPath');

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

describe('debt sanctions and closure', () => {
  /** @type {string} */
  let tempRoot;
  /** @type {bigint} */
  let balance;
  /** @type {number} */
  let transfers;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-debt-sanction-'));
    balance = 80n;
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
   * @param {{ confirmFn?: () => Promise<string>, isTty?: boolean }} [options]
   */
  function action(env, options = {}) {
    return new DebtLedgerAction({ config }, {
      debtRoot: debtRoot(),
      limitsPath: EXAMPLE_LIMITS_PATH,
      confirmFn: options.confirmFn ?? yes,
      isTty: options.isTty ?? true,
      now: new Date('2026-10-26T12:00:00.000Z'),
      decimals: 0,
      env,
      balanceFn: async () => balance,
      transferFn: async (_child, pool, amount) => {
        expect(pool).to.equal(SCOPE.pool);
        transfers += 1;
        balance -= amount;
        return {
          hash: '0xsanction',
          wait: async () => ({ status: 1 }),
        };
      },
      receiptFn: async () => ({ status: 1 }),
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

  async function addSanction(debtId, sanctionId, type, extra = {}) {
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'sanction-add',
      CAPYBARA_DEBT_ID: debtId,
      CAPYBARA_DEBT_SANCTION_ID: sanctionId,
      CAPYBARA_DEBT_SANCTION_TYPE: type,
      CAPYBARA_DEBT_REASON: extra.reason ?? sanctionId,
      CAPYBARA_DEBT_DATES: extra.dates,
    }).execute();
  }

  it('merges two gadget sanctions on the same day and does not change the remainder', async () => {
    await createDebt('debt-g', '40');
    await addSanction('debt-g', 'g1', 'gadget', { dates: '2026-11-01', reason: 'late' });
    await addSanction('debt-g', 'g2', 'gadget', { dates: '2026-11-01,2026-10-01', reason: 'noisy' });
    const events = await readDebtEvents(childFile());
    expect(events.filter((event) => event.type === 'sanction-add')).to.have.length(2);
    expect(events.find((event) => event.type === 'create').remainder_after).to.equal('40');
    expect(events.at(-1).remainder_after).to.equal('40');
    const summary = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'summary',
    }).execute();
    expect(summary.gadgets).to.have.length(1);
    expect(summary.gadgets[0].date).to.equal('2026-11-01');
    expect(summary.gadgets[0].minutes).to.equal('60');
    expect(summary.gadgets[0].reasons).to.deep.equal(['late', 'noisy']);
    expect(summary.gadgetHistory.map((row) => row.date)).to.deep.equal(['2026-10-01']);
  });

  it('keeps a manual block apart from overdue and drops only the cancelled block', async () => {
    await createDebt('debt-b', '10');
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'set-due',
      CAPYBARA_DEBT_ID: 'debt-b',
      CAPYBARA_DEBT_DUE: '2026-10-01',
      CAPYBARA_DEBT_REASON: 'shift',
    }).execute();
    try {
      await createDebt('debt-next', '10');
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/overdue/);
    }
    const before = await readDebtEvents(childFile());
    expect(before.some((event) => event.type === 'sanction-add')).to.equal(false);
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'set-due',
      CAPYBARA_DEBT_ID: 'debt-b',
      CAPYBARA_DEBT_DUE_CLEAR: 'true',
      CAPYBARA_DEBT_REASON: 'clear',
    }).execute();
    await addSanction('debt-b', 'block-1', 'block-new-debts');
    await addSanction('debt-b', 'block-2', 'block-new-debts');
    try {
      await createDebt('debt-blocked', '10');
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/manual_block/);
    }
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'sanction-cancel',
      CAPYBARA_DEBT_SANCTION_ID: 'block-1',
      CAPYBARA_DEBT_REASON: 'one down',
    }).execute();
    try {
      await createDebt('debt-still', '10');
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/manual_block/);
    }
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'sanction-cancel',
      CAPYBARA_DEBT_SANCTION_ID: 'block-2',
      CAPYBARA_DEBT_REASON: 'both down',
    }).execute();
    await createDebt('debt-free', '10');
    const events = await readDebtEvents(childFile());
    expect(events.filter((event) => event.debt_id === 'debt-free' && event.type === 'create')).to.have.length(1);
  });

  it('AC-15 and AC-17 leave one sanction, cancel the other, and keep a foreign debt', async () => {
    await createDebt('debt-a', '30');
    await createDebt('debt-b', '20');
    await addSanction('debt-a', 'san-leave', 'gadget', { dates: '2026-11-02', reason: 'keep' });
    await addSanction('debt-a', 'san-drop', 'block-new-debts', { reason: 'drop' });
    await addSanction('debt-b', 'san-foreign', 'block-new-debts', { reason: 'other' });
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'fine',
      CAPYBARA_DEBT_ID: 'debt-a',
      CAPYBARA_DEBT_AMOUNT: '10',
      CAPYBARA_DEBT_REASON: 'fixed',
    }).execute();
    const closed = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'forgive',
      CAPYBARA_DEBT_ID: 'debt-a',
      CAPYBARA_DEBT_ALL: 'true',
      CAPYBARA_DEBT_REASON: 'paid',
      CAPYBARA_DEBT_DECISIONS: 'san-leave:leave,san-drop:cancel',
      CAPYBARA_DEBT_CANCEL_REASON: 'done',
    }).execute();
    expect(closed.remainder).to.equal('0');
    expect(closed.pendingResolve).to.equal(false);
    const events = await readDebtEvents(childFile());
    expect(events.filter((event) => event.type === 'sanction-add' && event.debt_id === 'debt-a')).to.have.length(2);
    expect(events.filter((event) => event.type === 'sanction-cancel' && event.sanction_id === 'san-drop')).to.have.length(1);
    expect(events.some((event) => event.type === 'sanction-cancel' && event.sanction_id === 'san-leave')).to.equal(false);
    expect(events.some((event) => event.type === 'sanction-cancel' && event.sanction_id === 'san-foreign')).to.equal(false);
    expect(events.filter((event) => event.type === 'fine' && event.debt_id === 'debt-a')).to.have.length(1);
    const summary = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'summary',
    }).execute();
    const cardA = summary.debts.find((card) => card.debtId === 'debt-a');
    const cardB = summary.debts.find((card) => card.debtId === 'debt-b');
    expect(cardA.pendingResolve).to.equal(false);
    expect(cardA.fines).to.equal('10');
    expect(cardB.sanctions.map((item) => item.sanctionId)).to.deep.equal(['san-foreign']);
    expect(summary.unresolvedClosures).to.not.include('debt-a');
  });

  it('AC-16 keeps the payment when the sanction dialog is interrupted', async () => {
    await createDebt('debt-i', '30');
    await addSanction('debt-i', 'san-i', 'gadget', { dates: '2026-11-03' });
    let step = 0;
    const result = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_DEBT_ID: 'debt-i',
      CAPYBARA_DEBT_ALL: 'true',
    }, {
      confirmFn: async () => {
        step += 1;
        return step === 1 ? 'да' : 'нет';
      },
    }).execute();
    expect(result.remainder).to.equal('0');
    expect(result.pendingResolve).to.equal(true);
    expect(transfers).to.equal(1);
    const summary = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'summary',
    }).execute();
    expect(summary.unresolvedClosures).to.deep.equal(['debt-i']);
    expect(summary.debts.find((card) => card.debtId === 'debt-i').closureHandoff).to.equal(true);
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'resolve-closure',
      CAPYBARA_DEBT_ID: 'debt-i',
      CAPYBARA_DEBT_DECISIONS: 'san-i:cancel',
      CAPYBARA_DEBT_CANCEL_REASON: 'later',
    }).execute();
    const after = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'summary',
    }).execute();
    expect(after.unresolvedClosures).to.deep.equal([]);
    expect(transfers).to.equal(1);
  });

  it('refuses a non-TTY close before transfer when sanction decisions are missing', async () => {
    await createDebt('debt-n', '30');
    await addSanction('debt-n', 'san-n', 'block-new-debts');
    const before = await fs.readFile(childFile(), 'utf8');
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'repay',
        CAPYBARA_DEBT_ID: 'debt-n',
        CAPYBARA_DEBT_ALL: 'true',
      }, { isTty: false }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/explicit sanction decisions/);
    }
    expect(transfers).to.equal(0);
    expect(await fs.readFile(childFile(), 'utf8')).to.equal(before);
    const closed = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_DEBT_ID: 'debt-n',
      CAPYBARA_DEBT_ALL: 'true',
      CAPYBARA_DEBT_DECISIONS: 'san-n:leave',
    }, { isTty: false }).execute();
    expect(closed.remainder).to.equal('0');
    expect(transfers).to.equal(1);
  });
});
