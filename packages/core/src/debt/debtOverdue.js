'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const { getChildDebtPath } = require('./debtPath');
const { withDebtFileLock } = require('./debtLock');
const { projectDebtRemainder, readDebtEvents } = require('./debtProjection');
const { DEBT_SCHEMA_VERSION } = require('./debtWriter');

const TALLINN_TIME_ZONE = 'Europe/Tallinn';
const DUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} message
 * @returns {Error}
 */
function dueError(message) {
  const error = new Error(message);
  error.code = 'EDEBT_DUE';
  return error;
}

/**
 * Calendar date in Europe/Tallinn. DST comes from the time zone, not a fixed offset.
 * @param {Date} now
 * @returns {string}
 */
function tallinnCalendarDate(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TALLINN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const bag = {};
  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      bag[part.type] = part.value;
    }
  }
  return `${bag.year}-${bag.month}-${bag.day}`;
}

/**
 * @param {unknown} due
 * @returns {string|null}
 */
function normalizeDue(due) {
  if (due === null || due === undefined || due === '') {
    return null;
  }
  if (typeof due !== 'string' || !DUE_PATTERN.test(due)) {
    throw dueError('due must be YYYY-MM-DD or empty');
  }
  return due;
}

/**
 * Overdue starts the next Tallinn day. The due day itself is not overdue.
 * No due, or a zero remainder, is not overdue.
 * @param {{ due: unknown, now: Date, remainder: bigint|string }} params
 * @returns {boolean}
 */
function isDebtOverdue(params) {
  const due = normalizeDue(params.due);
  if (due === null) {
    return false;
  }
  const remainder = typeof params.remainder === 'bigint'
    ? params.remainder
    : BigInt(String(params.remainder));
  if (remainder <= 0n) {
    return false;
  }
  return tallinnCalendarDate(params.now) > due;
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {string} debtId
 * @returns {{ due: string|null, history: Array<Record<string, unknown>> }}
 */
function projectDue(events, debtId) {
  let due = null;
  /** @type {Array<Record<string, unknown>>} */
  const history = [];
  for (const event of events) {
    if (event?.debt_id !== debtId || event.type !== 'set-due') {
      continue;
    }
    const nextDue = normalizeDue(event.due);
    history.push({
      previous_due: event.previous_due === undefined ? due : normalizeDue(event.previous_due),
      due: nextDue,
      reason: typeof event.comment === 'string' ? event.comment : null,
      recorded_at: event.timestamps?.recorded_at ?? null,
    });
    due = nextDue;
  }
  return { due, history };
}

/**
 * Append a set-due line. Remainder does not change.
 * @param {{
 *   child: unknown,
 *   scope: { mode?: unknown, chainId?: unknown, token?: unknown, pool?: unknown },
 *   debtId: string,
 *   due: string|null,
 *   reason: string,
 *   debtRoot?: string,
 *   mode?: string,
 *   eventId?: string,
 *   recordedAt?: string,
 * }} params
 * @returns {Promise<{ filePath: string, event: Record<string, unknown>, overdue: boolean, history: Array<Record<string, unknown>> }>}
 */
async function appendDueChange(params) {
  const reason = String(params.reason ?? '').trim();
  if (!reason) {
    throw dueError('due change reason is required');
  }
  const nextDue = normalizeDue(params.due);
  const scopeMode = String(params?.scope?.mode ?? '').trim().toLowerCase();
  const mode = params?.mode ?? scopeMode;
  if (mode !== scopeMode) {
    throw new Error('debt scope.mode must match the journal mode');
  }
  const filePath = getChildDebtPath({
    child: params.child,
    scope: params.scope,
    debtRoot: params.debtRoot,
    mode,
  });

  return withDebtFileLock(filePath, async () => {
    const events = await readDebtEvents(filePath);
    const remainder = projectDebtRemainder(events, params.debtId);
    const previous = projectDue(events, params.debtId);
    const event = {
      schema_version: DEBT_SCHEMA_VERSION,
      event_id: params.eventId ?? crypto.randomUUID(),
      debt_id: params.debtId,
      child: String(params.child).trim().toLowerCase(),
      scope: {
        mode: scopeMode,
        chainId: String(params.scope.chainId).trim().toLowerCase(),
        token: String(params.scope.token).trim().toLowerCase(),
        pool: String(params.scope.pool).trim().toLowerCase(),
      },
      timestamps: {
        recorded_at: params.recordedAt ?? new Date().toISOString(),
      },
      type: 'set-due',
      due: nextDue,
      previous_due: previous.due,
      comment: reason,
      remainder_before: remainder.toString(),
      remainder_after: remainder.toString(),
    };
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
    const history = projectDue([...events, event], params.debtId);
    return {
      filePath,
      event,
      history: history.history,
      overdue: isDebtOverdue({
        due: history.due,
        now: params.now ?? new Date(),
        remainder,
      }),
    };
  });
}

module.exports = {
  TALLINN_TIME_ZONE,
  tallinnCalendarDate,
  isDebtOverdue,
  projectDue,
  appendDueChange,
};
