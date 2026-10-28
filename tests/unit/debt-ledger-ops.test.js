'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { CapybaraActionsManager } = require('../../packages/core/src/actions/index');
const {
  DebtLedgerAction,
  EXIT_CANCEL,
  EXIT_VALIDATION,
  exitCodeForDebtError,
} = require('../../packages/core/src/actions/DebtLedgerAction');
const { resolveDebtPortion } = require('../../packages/core/src/debt/debtPortion');
const { EXAMPLE_LIMITS_PATH } = require('../../packages/core/src/debt/debtLimits');
const { appendDebtEvent } = require('../../packages/core/src/debt/debtWriter');
const { readDebtEvents } = require('../../packages/core/src/debt/debtProjection');

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

const NOW = new Date('2026-10-26T22:00:00.000Z');

function yes() {
  return Promise.resolve('да');
}

describe('debt ledger action 6', () => {
  /** @type {string} */
  let tempRoot;
  /** @type {{ capy: bigint }} */
  let balance;
  /** @type {{ transfer: () => never }} */
  let capyToken;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-debt-ledger-'));
    balance = { capy: 20n };
    capyToken = {
      transfer() {
        throw new Error('on-chain transfer is out of scope');
      },
    };
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function router() {
    return { config, capyToken };
  }

  function debtRoot() {
    return path.join(tempRoot, 'debt');
  }

  /**
   * @param {NodeJS.ProcessEnv} env
   * @param {{ confirmFn?: () => Promise<string>, isTty?: boolean, limitsPath?: string }} [options]
   */
  function action(env, options = {}) {
    return new DebtLedgerAction(router(), {
      debtRoot: debtRoot(),
      limitsPath: options.limitsPath ?? EXAMPLE_LIMITS_PATH,
      confirmFn: options.confirmFn ?? yes,
      isTty: options.isTty ?? true,
      now: NOW,
      decimals: 0,
      env,
    });
  }

  function scope() {
    return {
      mode: 'mock',
      chainId: '31337',
      token: '0x1111111111111111111111111111111111111111',
      pool: '0x2222222222222222222222222222222222222222',
    };
  }

  it('routes action 6 and rejects an unknown sub-op', async () => {
    const manager = new CapybaraActionsManager(router());
    expect(manager.getAvailableActions()).to.include(6);
    const previous = process.env.CAPYBARA_DEBT_OP;
    process.env.CAPYBARA_DEBT_OP = 'device-lock';
    try {
      await manager.executeAction(6);
      expect.fail('should throw');
    } catch (error) {
      expect(error.code).to.equal('EDEBT_VALIDATION');
      expect(error.message).to.match(/unknown CAPYBARA_DEBT_OP/);
      expect(exitCodeForDebtError(error)).to.equal(EXIT_VALIDATION);
    } finally {
      if (previous === undefined) {
        delete process.env.CAPYBARA_DEBT_OP;
      } else {
        process.env.CAPYBARA_DEBT_OP = previous;
      }
    }
    try {
      await manager.executeAction(5);
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/use 51 or 52/);
    }
  });

  it('AC-01 create 80 leaves the on-chain balance at 20', async () => {
    const result = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: 'debt-ac01',
      CAPYBARA_DEBT_AMOUNT: '80',
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
    expect(result.remainder).to.equal('80');
    expect(result.onChainBalanceChanged).to.equal(false);
    expect(balance.capy).to.equal(20n);
    const events = await readDebtEvents(
      path.join(
        debtRoot(),
        'mock',
        'mock--31337--0x1111111111111111111111111111111111111111--0x2222222222222222222222222222222222222222',
        'tristan.ndjson'
      )
    );
    expect(events[0].debt_id).to.equal('debt-ac01');
    expect(events[0].comment).to.equal('loan');
  });

  it('AC-05 forgives 25 percent of 80 down to 60', async () => {
    await action({
      CAPYBARA_WALLET: 'bastian',
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: 'debt-ac05',
      CAPYBARA_DEBT_AMOUNT: '80',
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
    const result = await action({
      CAPYBARA_WALLET: 'bastian',
      CAPYBARA_DEBT_OP: 'forgive',
      CAPYBARA_DEBT_ID: 'debt-ac05',
      CAPYBARA_DEBT_PERCENT: '25',
      CAPYBARA_DEBT_REASON: 'part',
    }).execute();
    expect(result.forgiven).to.equal('20');
    expect(result.remainder).to.equal('60');
    expect(balance.capy).to.equal(20n);
  });

  it('AC-06 full forgive keeps a prior settled payment in the journal', async () => {
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: 'debt-ac06',
      CAPYBARA_DEBT_AMOUNT: '80',
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
    await appendDebtEvent({
      child: 'tristan',
      scope: scope(),
      debtRoot: debtRoot(),
      debtId: 'debt-ac06',
      type: 'repay-settled',
      amount: '30',
      comment: 'paid',
    });
    const result = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'forgive',
      CAPYBARA_DEBT_ID: 'debt-ac06',
      CAPYBARA_DEBT_ALL: 'true',
      CAPYBARA_DEBT_REASON: 'close',
    }).execute();
    expect(result.remainder).to.equal('0');
    const shown = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'show',
      CAPYBARA_DEBT_ID: 'debt-ac06',
    }).execute();
    expect(shown.card.original).to.equal('80');
    expect(shown.card.fines).to.equal('0');
    expect(shown.card.settled).to.equal('30');
    expect(shown.card.forgiven).to.equal('50');
    expect(shown.card.remainder).to.equal('0');
    const events = await readDebtEvents(
      path.join(
        debtRoot(),
        'mock',
        'mock--31337--0x1111111111111111111111111111111111111111--0x2222222222222222222222222222222222222222',
        'tristan.ndjson'
      )
    );
    expect(events.some((event) => event.type === 'repay-settled' && event.amounts.amount === '30')).to.equal(true);
    expect(events.some((event) => event.type === 'forgive')).to.equal(true);
  });

  it('AC-07 fine 10 makes remainder 90 and 50 percent of that is 45', async () => {
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: 'debt-ac07',
      CAPYBARA_DEBT_AMOUNT: '80',
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
    const fined = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'fine',
      CAPYBARA_DEBT_ID: 'debt-ac07',
      CAPYBARA_DEBT_AMOUNT: '10',
      CAPYBARA_DEBT_REASON: 'late',
    }).execute();
    expect(fined.remainder).to.equal('90');
    expect(resolveDebtPortion({ remainder: 90n, percent: '50' }).toString()).to.equal('45');
    expect(balance.capy).to.equal(20n);
  });

  it('AC-09 moving and clearing due recomputes overdue and keeps reasons', async () => {
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: 'debt-ac09',
      CAPYBARA_DEBT_AMOUNT: '80',
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
    const first = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'set-due',
      CAPYBARA_DEBT_ID: 'debt-ac09',
      CAPYBARA_DEBT_DUE: '2026-10-26',
      CAPYBARA_DEBT_REASON: 'first',
    }).execute();
    expect(first.overdue).to.equal(true);
    const moved = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'set-due',
      CAPYBARA_DEBT_ID: 'debt-ac09',
      CAPYBARA_DEBT_DUE: '2026-10-27',
      CAPYBARA_DEBT_REASON: 'moved',
    }).execute();
    expect(moved.overdue).to.equal(false);
    const cleared = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'set-due',
      CAPYBARA_DEBT_ID: 'debt-ac09',
      CAPYBARA_DEBT_DUE_CLEAR: 'true',
      CAPYBARA_DEBT_REASON: 'cleared',
    }).execute();
    expect(cleared.due).to.equal(null);
    expect(cleared.overdue).to.equal(false);
    expect(cleared.history.map((row) => row.reason)).to.deep.equal(['first', 'moved', 'cleared']);
    const shown = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'show',
      CAPYBARA_DEBT_ID: 'debt-ac09',
    }).execute();
    expect(shown.confirmed).to.equal(false);
    expect(shown.card.dueHistory).to.have.length(3);
    expect(shown.card.original).to.equal('80');
  });

  it('AC-19 rejects zero, negative, overflow, percent over 100, conflicts, and a zero floor', () => {
    expect(() => resolveDebtPortion({ remainder: 80n, amount: '0' })).to.throw(/positive integer/);
    expect(() => resolveDebtPortion({ remainder: 80n, amount: '-5' })).to.throw(/positive integer/);
    expect(() => resolveDebtPortion({ remainder: 80n, amount: '81' })).to.throw(/exceeds remainder/);
    expect(() => resolveDebtPortion({ remainder: 80n, percent: '101' })).to.throw(/1 to 100/);
    expect(() => resolveDebtPortion({ remainder: 80n, amount: '10', percent: '10' })).to.throw(/mutually exclusive/);
    expect(() => resolveDebtPortion({ remainder: 1n, percent: '1' })).to.throw(/rounds to zero/);
  });

  it('AC-26 cancels a fine only before a later forgive and does not go negative', async () => {
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: 'debt-ac26',
      CAPYBARA_DEBT_AMOUNT: '80',
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'fine',
      CAPYBARA_DEBT_ID: 'debt-ac26',
      CAPYBARA_DEBT_AMOUNT: '10',
      CAPYBARA_DEBT_REASON: 'late',
    }).execute();
    const events = await readDebtEvents(
      path.join(
        debtRoot(),
        'mock',
        'mock--31337--0x1111111111111111111111111111111111111111--0x2222222222222222222222222222222222222222',
        'tristan.ndjson'
      )
    );
    const fineId = events.find((event) => event.type === 'fine').event_id;
    const cancelled = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'cancel-fine',
      CAPYBARA_DEBT_ID: 'debt-ac26',
      CAPYBARA_DEBT_FINE_ID: fineId,
      CAPYBARA_DEBT_REASON: 'mistake',
    }).execute();
    expect(cancelled.remainder).to.equal('80');

    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'fine',
      CAPYBARA_DEBT_ID: 'debt-ac26',
      CAPYBARA_DEBT_AMOUNT: '10',
      CAPYBARA_DEBT_REASON: 'again',
    }).execute();
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'forgive',
      CAPYBARA_DEBT_ID: 'debt-ac26',
      CAPYBARA_DEBT_AMOUNT: '1',
      CAPYBARA_DEBT_REASON: 'bit',
    }).execute();
    const after = await readDebtEvents(
      path.join(
        debtRoot(),
        'mock',
        'mock--31337--0x1111111111111111111111111111111111111111--0x2222222222222222222222222222222222222222',
        'tristan.ndjson'
      )
    );
    const secondFine = after.filter((event) => event.type === 'fine')[1].event_id;
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'cancel-fine',
        CAPYBARA_DEBT_ID: 'debt-ac26',
        CAPYBARA_DEBT_FINE_ID: secondFine,
        CAPYBARA_DEBT_REASON: 'too late',
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/only before a later repay or forgive/);
    }
    const remain = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'show',
      CAPYBARA_DEBT_ID: 'debt-ac26',
    }).execute();
    expect(BigInt(remain.card.remainder) >= 0n).to.equal(true);
  });

  it('cancel writes nothing and summary does not confirm', async () => {
    let asked = false;
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'create',
        CAPYBARA_DEBT_ID: 'debt-cancel',
        CAPYBARA_DEBT_AMOUNT: '80',
        CAPYBARA_DEBT_REASON: 'loan',
      }, {
        confirmFn: () => {
          asked = true;
          return Promise.resolve('нет');
        },
      }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.code).to.equal('ECANCEL');
      expect(exitCodeForDebtError(error)).to.equal(EXIT_CANCEL);
    }
    expect(asked).to.equal(true);
    const summary = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'summary',
    }, {
      confirmFn: () => {
        throw new Error('summary must not confirm');
      },
    }).execute();
    expect(summary.confirmed).to.equal(false);
    expect(summary.debts).to.deep.equal([]);
  });

  it('override records the violated rule and the next create is checked again', async () => {
    const limitsPath = path.join(tempRoot, 'limits.json');
    await fs.writeFile(limitsPath, JSON.stringify({
      max_outstanding: 10,
      max_open_debts: 2,
      block_on_overdue: true,
      gadget_minutes: 60,
      children: {},
    }));
    const created = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: 'debt-over',
      CAPYBARA_DEBT_AMOUNT: '80',
      CAPYBARA_DEBT_REASON: 'exception',
      CAPYBARA_DEBT_OVERRIDE_REASON: 'operator',
    }, { limitsPath }).execute();
    expect(created.remainder).to.equal('80');
    const events = await readDebtEvents(
      path.join(
        debtRoot(),
        'mock',
        'mock--31337--0x1111111111111111111111111111111111111111--0x2222222222222222222222222222222222222222',
        'tristan.ndjson'
      )
    );
    expect(events[0].override).to.equal(true);
    expect(events[0].violated_rules).to.deep.equal(['outstanding']);
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'create',
        CAPYBARA_DEBT_ID: 'debt-next',
        CAPYBARA_DEBT_AMOUNT: '1',
        CAPYBARA_DEBT_REASON: 'again',
      }, { limitsPath }).execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/outstanding/);
    }
  });
});
