'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { CAPYBARA_ROOT } = require('../../packages/core/src/env-path');
const {
  EXAMPLE_LIMITS_PATH,
  DEBT_LIMIT_ENV,
  loadDebtLimitsFile,
  resolveChildLimits,
} = require('../../packages/core/src/debt/debtLimits');
const {
  tallinnCalendarDate,
  isDebtOverdue,
  appendDueChange,
  projectDue,
} = require('../../packages/core/src/debt/debtOverdue');
const { checkNewDebt } = require('../../packages/core/src/debt/debtAvailability');
const { appendDebtEvent } = require('../../packages/core/src/debt/debtWriter');
const { readDebtEvents, projectDebtRemainder } = require('../../packages/core/src/debt/debtProjection');

const SCOPE = {
  mode: 'mock',
  chainId: '6281971',
  token: '0xabc',
  pool: '0xdef',
};

const SUMMER_DUE_DAY = new Date('2026-07-01T20:30:00.000Z');
const SUMMER_NEXT_DAY = new Date('2026-07-01T21:00:00.000Z');
const WINTER_DUE_DAY = new Date('2026-10-26T21:30:00.000Z');
const WINTER_NEXT_DAY = new Date('2026-10-26T22:00:00.000Z');

function amountLimit(value) {
  return { kind: 'amount', amount: BigInt(value) };
}

function baseLimits(overrides = {}) {
  return {
    maxOutstanding: amountLimit(100),
    maxOpenDebts: amountLimit(2),
    blockOnOverdue: true,
    gadgetMinutes: 60n,
    ...overrides,
  };
}

describe('debt limits and Tallinn overdue', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-debt-limits-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function debtRoot() {
    return path.join(tempRoot, 'debt');
  }

  async function createDebt(child, debtId, amount) {
    return appendDebtEvent({
      child,
      scope: SCOPE,
      debtId,
      type: 'create',
      amount,
      debtRoot: debtRoot(),
    });
  }

  it('keeps the example free of a family amount and ignores the working file', async () => {
    const example = JSON.parse(await fs.readFile(EXAMPLE_LIMITS_PATH, 'utf8'));
    expect(example.max_outstanding).to.deep.equal({ disabled: true });
    expect(example.max_outstanding.amount).to.equal(undefined);
    expect(example.max_open_debts).to.equal(2);
    expect(example.block_on_overdue).to.equal(true);
    expect(example.gadget_minutes).to.equal(60);
    expect(JSON.stringify(example)).to.not.match(/PRIVATE|SECRET|BEGIN/);
    const ignore = await fs.readFile(path.join(CAPYBARA_ROOT, '.gitignore'), 'utf8');
    expect(ignore).to.match(/^config\/debt-limits\.json$/m);
    expect(EXAMPLE_LIMITS_PATH.endsWith(`${path.sep}debt-limits.example.json`)).to.equal(true);
  });

  it('lets a non-empty env override the file after the child overlay', async () => {
    const filePath = path.join(tempRoot, 'limits.json');
    await fs.writeFile(filePath, JSON.stringify({
      max_outstanding: { disabled: true },
      max_open_debts: 2,
      block_on_overdue: true,
      gadget_minutes: 60,
      children: {
        bastian: { max_outstanding: { amount: '10' } },
      },
    }), 'utf8');
    const loaded = await loadDebtLimitsFile(filePath);
    const fromFile = resolveChildLimits(loaded, 'Bastian', {});
    expect(fromFile.maxOutstanding).to.deep.equal({ kind: 'amount', amount: 10n });
    const fromEnv = resolveChildLimits(loaded, 'bastian', {
      [DEBT_LIMIT_ENV.maxOutstanding]: '100',
    });
    expect(fromEnv.maxOutstanding).to.deep.equal({ kind: 'amount', amount: 100n });
    expect(fromEnv.gadgetMinutes).to.equal(60n);
  });

  it('rejects a missing or non-explicit max_outstanding', async () => {
    const filePath = path.join(tempRoot, 'limits.json');
    await fs.writeFile(filePath, '{}\n', 'utf8');
    try {
      await loadDebtLimitsFile(filePath);
      expect.fail('missing max_outstanding must throw');
    } catch (error) {
      expect(error.code).to.equal('EDEBT_LIMITS');
      expect(error.message).to.match(/max_outstanding/);
    }
    await fs.writeFile(filePath, JSON.stringify({
      max_outstanding: { disabled: false },
    }), 'utf8');
    await expect(loadDebtLimitsFile(filePath)).to.be.rejectedWith(/explicit amount or an explicit disable/);
    await fs.writeFile(filePath, '{', 'utf8');
    await expect(loadDebtLimitsFile(filePath)).to.be.rejectedWith(/not valid JSON/);
  });

  it('treats zero as forbid and not as unlimited', async () => {
    const decision = await checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits({ maxOutstanding: amountLimit(0) }),
      newDebtId: 'debt-new',
      newAmount: '1',
      now: SUMMER_DUE_DAY,
    });
    expect(decision.allowed).to.equal(false);
    expect(decision.reasons.map((reason) => reason.code)).to.include('outstanding');
  });

  it('marks overdue only from the next Tallinn day (AC-08)', () => {
    expect(tallinnCalendarDate(SUMMER_DUE_DAY)).to.equal('2026-07-01');
    expect(tallinnCalendarDate(SUMMER_NEXT_DAY)).to.equal('2026-07-02');
    expect(tallinnCalendarDate(WINTER_DUE_DAY)).to.equal('2026-10-26');
    expect(tallinnCalendarDate(WINTER_NEXT_DAY)).to.equal('2026-10-27');
    expect(isDebtOverdue({ due: null, now: SUMMER_NEXT_DAY, remainder: 10n })).to.equal(false);
    expect(isDebtOverdue({ due: '2026-07-01', now: SUMMER_DUE_DAY, remainder: 10n })).to.equal(false);
    expect(isDebtOverdue({ due: '2026-07-01', now: SUMMER_NEXT_DAY, remainder: 10n })).to.equal(true);
    expect(isDebtOverdue({ due: '2026-07-01', now: SUMMER_NEXT_DAY, remainder: 0n })).to.equal(false);
    expect(isDebtOverdue({ due: '2026-10-26', now: WINTER_DUE_DAY, remainder: 10n })).to.equal(false);
    expect(isDebtOverdue({ due: '2026-10-26', now: WINTER_NEXT_DAY, remainder: 10n })).to.equal(true);
  });

  it('recomputes overdue when the due date moves or is cleared (AC-09)', async () => {
    await createDebt('bastian', 'debt-1', '80');
    const set = await appendDueChange({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      due: '2026-07-01',
      reason: 'first due',
      debtRoot: debtRoot(),
      now: SUMMER_NEXT_DAY,
    });
    expect(set.overdue).to.equal(true);
    const moved = await appendDueChange({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      due: '2026-07-10',
      reason: 'moved',
      debtRoot: debtRoot(),
      now: SUMMER_NEXT_DAY,
    });
    expect(moved.overdue).to.equal(false);
    const cleared = await appendDueChange({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      due: null,
      reason: 'cleared',
      debtRoot: debtRoot(),
      now: SUMMER_NEXT_DAY,
    });
    expect(cleared.overdue).to.equal(false);
    expect(cleared.history.map((row) => row.reason)).to.deep.equal(['first due', 'moved', 'cleared']);
    expect(cleared.history[1].previous_due).to.equal('2026-07-01');
    expect(cleared.history[1].due).to.equal('2026-07-10');
    const events = await readDebtEvents(set.filePath);
    expect(projectDue(events, 'debt-1').due).to.equal(null);
    expect(await projectDebtRemainder(events, 'debt-1')).to.equal(80n);
  });

  it('allows 20 and rejects 21 against outstanding 80 and limit 100 (AC-10)', async () => {
    await createDebt('bastian', 'debt-1', '80');
    const call = (newAmount) => checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits(),
      newDebtId: `extra-${newAmount}`,
      newAmount,
      now: SUMMER_DUE_DAY,
    });
    const allowed = await call('20');
    const denied = await call('21');
    expect(allowed.allowed).to.equal(true);
    expect(allowed.headroom).to.equal(20n);
    expect(denied.allowed).to.equal(false);
    expect(denied.reasons[0].message).to.match(/80/);
    expect(denied.headroom).to.equal(20n);
  });

  it('frees an open-debt slot after one debt is closed (AC-11)', async () => {
    await createDebt('bastian', 'debt-1', '10');
    await createDebt('bastian', 'debt-2', '10');
    const blocked = await checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits(),
      newDebtId: 'debt-3',
      newAmount: '1',
      now: SUMMER_DUE_DAY,
    });
    expect(blocked.allowed).to.equal(false);
    expect(blocked.reasons.map((reason) => reason.code)).to.include('open_debts');
    await appendDebtEvent({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-2',
      type: 'forgive',
      amount: '10',
      debtRoot: debtRoot(),
    });
    const freed = await checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits(),
      newDebtId: 'debt-3',
      newAmount: '1',
      now: SUMMER_DUE_DAY,
    });
    expect(freed.allowed).to.equal(true);
  });

  it('reports overdue and a manual block independently, even with headroom (AC-12)', async () => {
    await createDebt('bastian', 'debt-1', '10');
    await appendDueChange({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      due: '2026-07-01',
      reason: 'due',
      debtRoot: debtRoot(),
      now: SUMMER_DUE_DAY,
    });
    const overdue = await checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits(),
      newDebtId: 'debt-2',
      newAmount: '1',
      now: SUMMER_NEXT_DAY,
    });
    expect(overdue.allowed).to.equal(false);
    expect(overdue.headroom).to.equal(90n);
    expect(overdue.reasons.map((reason) => reason.code)).to.deep.equal(['overdue']);

    const blocked = await checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits({ blockOnOverdue: false }),
      newDebtId: 'debt-3',
      newAmount: '1',
      now: SUMMER_NEXT_DAY,
      manualBlock: true,
    });
    expect(blocked.allowed).to.equal(false);
    expect(blocked.headroom).to.equal(90n);
    expect(blocked.reasons.map((reason) => reason.code)).to.deep.equal(['manual_block']);
  });

  it('records one override and checks the next call again (AC-13)', async () => {
    await createDebt('bastian', 'debt-1', '80');
    const denied = await checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits(),
      newDebtId: 'debt-2',
      newAmount: '21',
      now: SUMMER_DUE_DAY,
    });
    expect(denied.allowed).to.equal(false);
    const once = await checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits(),
      newDebtId: 'debt-2',
      newAmount: '21',
      now: SUMMER_DUE_DAY,
      override: { reason: 'one time' },
    });
    expect(once.overrideApplied).to.equal(true);
    expect(once.event.override).to.equal(true);
    expect(once.event.override_reason).to.equal('one time');
    expect(once.event.violated_rules).to.deep.equal(['outstanding']);
    expect(once.event.remainder_after).to.equal('21');
    const again = await checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits(),
      newDebtId: 'debt-3',
      newAmount: '1',
      now: SUMMER_DUE_DAY,
    });
    expect(again.allowed).to.equal(false);
    expect(again.overrideApplied).to.equal(false);
  });

  it('does not mix another child journal or limits (AC-14)', async () => {
    await createDebt('bastian', 'debt-b', '80');
    const bastian = await checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits({ maxOutstanding: amountLimit(100) }),
      newDebtId: 'debt-new',
      newAmount: '21',
      now: SUMMER_DUE_DAY,
      manualBlock: true,
    });
    const tristan = await checkNewDebt({
      child: 'tristan',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits({ maxOutstanding: amountLimit(30), maxOpenDebts: amountLimit(2) }),
      newDebtId: 'debt-new',
      newAmount: '21',
      now: SUMMER_DUE_DAY,
    });
    expect(bastian.allowed).to.equal(false);
    expect(tristan.allowed).to.equal(true);
    expect(tristan.headroom).to.equal(30n);
  });

  it('does not let an override bypass a bad amount', async () => {
    await expect(checkNewDebt({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      limits: baseLimits(),
      newDebtId: 'debt-2',
      newAmount: '1.5',
      now: SUMMER_DUE_DAY,
      override: { reason: 'no' },
    })).to.be.rejectedWith(/positive integer/);
  });
});
