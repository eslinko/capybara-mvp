'use strict';

const { getChildDebtPath } = require('./debtPath');
const { projectDebtRemainder, readDebtEvents } = require('./debtProjection');
const { isDebtOverdue, projectDue } = require('./debtOverdue');
const { appendDebtEvent } = require('./debtWriter');

/**
 * @param {string} message
 * @returns {Error}
 */
function availabilityError(message) {
  const error = new Error(message);
  error.code = 'EDEBT_AVAILABILITY';
  return error;
}

/**
 * @param {unknown} raw
 * @returns {bigint}
 */
function newDebtAmount(raw) {
  if (typeof raw === 'bigint') {
    if (raw <= 0n) {
      throw availabilityError('new debt amount must be a positive integer');
    }
    return raw;
  }
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw) || BigInt(raw) <= 0n) {
    throw availabilityError('new debt amount must be a positive integer');
  }
  return BigInt(raw);
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @returns {string[]}
 */
function debtIds(events) {
  /** @type {string[]} */
  const ids = [];
  const seen = new Set();
  for (const event of events) {
    if (typeof event?.debt_id !== 'string' || seen.has(event.debt_id)) {
      continue;
    }
    seen.add(event.debt_id);
    ids.push(event.debt_id);
  }
  return ids;
}

/**
 * Product-limit check for one new debt. Override bypasses only those limits.
 * @param {{
 *   child: unknown,
 *   scope: { mode?: unknown, chainId?: unknown, token?: unknown, pool?: unknown },
 *   debtRoot?: string,
 *   mode?: string,
 *   limits: {
 *     maxOutstanding: { kind: 'amount', amount: bigint }|{ kind: 'disabled' },
 *     maxOpenDebts: { kind: 'amount', amount: bigint }|{ kind: 'disabled' },
 *     blockOnOverdue: boolean,
 *   },
 *   newDebtId: string,
 *   newAmount: string|bigint,
 *   now: Date,
 *   manualBlock?: boolean,
 *   override?: { reason?: string }|null,
 * }} params
 * @returns {Promise<{
 *   allowed: boolean,
 *   reasons: Array<{ code: string, message: string }>,
 *   headroom: bigint|null,
 *   overrideApplied: boolean,
 *   event?: Record<string, unknown>,
 * }>}
 */
async function checkNewDebt(params) {
  const amount = newDebtAmount(params.newAmount);
  const newDebtId = String(params.newDebtId ?? '').trim();
  if (!newDebtId) {
    throw availabilityError('new debt_id is required');
  }
  const filePath = getChildDebtPath({
    child: params.child,
    scope: params.scope,
    debtRoot: params.debtRoot,
    mode: params.mode,
  });
  const events = await readDebtEvents(filePath);
  if (debtIds(events).includes(newDebtId)) {
    throw availabilityError(`debt_id already exists: ${newDebtId}`);
  }

  let outstanding = 0n;
  let openCount = 0n;
  let overdue = false;
  for (const debtId of debtIds(events)) {
    const remainder = projectDebtRemainder(events, debtId);
    outstanding += remainder;
    if (remainder > 0n) {
      openCount += 1n;
      const due = projectDue(events, debtId).due;
      if (isDebtOverdue({ due, now: params.now, remainder })) {
        overdue = true;
      }
    }
  }

  const cap = params.limits.maxOutstanding;
  const headroom = cap.kind === 'amount' ? cap.amount - outstanding : null;
  /** @type {Array<{ code: string, message: string }>} */
  const reasons = [];
  if (cap.kind === 'amount' && outstanding + amount > cap.amount) {
    reasons.push({
      code: 'outstanding',
      message: `outstanding ${outstanding} plus ${amount} exceeds ${cap.amount}`,
    });
  }
  const openCap = params.limits.maxOpenDebts;
  if (openCap.kind === 'amount' && openCount + 1n > openCap.amount) {
    reasons.push({
      code: 'open_debts',
      message: `open debts ${openCount} plus 1 exceeds ${openCap.amount}`,
    });
  }
  if (params.limits.blockOnOverdue && overdue) {
    reasons.push({
      code: 'overdue',
      message: 'an open debt is overdue',
    });
  }
  if (params.manualBlock === true) {
    reasons.push({
      code: 'manual_block',
      message: 'a manual block forbids a new debt',
    });
  }

  const overrideReason = String(params.override?.reason ?? '').trim();
  if (params.override && !overrideReason) {
    throw availabilityError('override reason is required');
  }
  if (reasons.length === 0 || !overrideReason) {
    return {
      allowed: reasons.length === 0,
      reasons,
      headroom,
      overrideApplied: false,
    };
  }

  const written = await appendDebtEvent({
    child: params.child,
    scope: params.scope,
    debtRoot: params.debtRoot,
    mode: params.mode,
    debtId: newDebtId,
    type: 'create',
    amount: amount.toString(),
    override: true,
    overrideReason,
    violatedRules: reasons.map((reason) => reason.code),
    comment: overrideReason,
  });
  return {
    allowed: true,
    reasons,
    headroom,
    overrideApplied: true,
    event: written.event,
  };
}

module.exports = {
  checkNewDebt,
  availabilityError,
};
