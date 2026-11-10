'use strict';

const { getChildAdvancePath } = require('./advancePath');
const { projectAdvanceRemainder, readAdvanceEvents } = require('./advanceProjection');

/**
 * @param {string} message
 * @returns {Error}
 */
function availabilityError(message) {
  const error = new Error(message);
  error.code = 'EADVANCE_LIMITS';
  return error;
}

/**
 * @param {unknown} raw
 * @returns {bigint}
 */
function newAdvanceAmount(raw) {
  if (typeof raw === 'bigint') {
    if (raw <= 0n) {
      throw availabilityError('advance amount must be positive');
    }
    return raw;
  }
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw) || BigInt(raw) <= 0n) {
    throw availabilityError('advance amount must be a positive integer string');
  }
  return BigInt(raw);
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @returns {string[]}
 */
function advanceIds(events) {
  const ids = [];
  const seen = new Set();
  for (const event of events) {
    if (typeof event.advance_id === 'string' && !seen.has(event.advance_id)) {
      seen.add(event.advance_id);
      ids.push(event.advance_id);
    }
  }
  return ids;
}

/**
 * Issue gate. Forgive and settle do not call this.
 * A violation stays on the result when an override reason allows the issue.
 * @param {{
 *   child: unknown,
 *   scope: { mode?: unknown, chainId?: unknown, token?: unknown, pool?: unknown },
 *   advanceRoot?: string,
 *   mode?: string,
 *   newAdvanceId: string,
 *   newAmount: string|bigint,
 *   limits: {
 *     maxOutstanding: { kind: string, amount?: bigint },
 *     maxOpenAdvances: { kind: string, amount?: bigint },
 *   },
 *   override?: { reason?: string },
 * }} params
 * @returns {Promise<{
 *   allowed: boolean,
 *   reasons: Array<{ code: string, message: string }>,
 *   overrideApplied: boolean,
 *   violations: Array<{ code: string, message: string }>,
 * }>}
 */
async function checkNewAdvance(params) {
  const amount = newAdvanceAmount(params.newAmount);
  const newAdvanceId = String(params.newAdvanceId ?? '').trim();
  if (!newAdvanceId) {
    throw availabilityError('advance_id is required');
  }
  const filePath = getChildAdvancePath({
    child: params.child,
    scope: params.scope,
    advanceRoot: params.advanceRoot,
    mode: params.mode,
  });
  const events = await readAdvanceEvents(filePath);
  let outstanding = 0n;
  let openCount = 0n;
  let alreadyOpen = false;
  for (const advanceId of advanceIds(events)) {
    const remainder = projectAdvanceRemainder(events, advanceId);
    if (remainder > 0n) {
      outstanding += remainder;
      openCount += 1n;
      if (advanceId === newAdvanceId) {
        alreadyOpen = true;
      }
    }
  }

  /** @type {Array<{ code: string, message: string }>} */
  const reasons = [];
  const cap = params.limits.maxOutstanding;
  if (cap.kind === 'amount' && outstanding + amount > cap.amount) {
    reasons.push({
      code: 'outstanding',
      message: `outstanding ${outstanding} plus ${amount} exceeds ${cap.amount}`,
    });
  }
  const openCap = params.limits.maxOpenAdvances;
  const nextOpen = alreadyOpen ? openCount : openCount + 1n;
  if (openCap.kind === 'amount' && nextOpen > openCap.amount) {
    reasons.push({
      code: 'max_open',
      message: `open advances ${openCount} plus a new one exceeds ${openCap.amount}`,
    });
  }

  const overrideReason = String(params.override?.reason ?? '').trim();
  if (params.override && !overrideReason) {
    throw availabilityError('override reason is required');
  }
  if (reasons.length > 0 && overrideReason) {
    return {
      allowed: true,
      reasons,
      overrideApplied: true,
      violations: reasons,
    };
  }
  return {
    allowed: reasons.length === 0,
    reasons,
    overrideApplied: false,
    violations: reasons,
  };
}

module.exports = {
  checkNewAdvance,
};
