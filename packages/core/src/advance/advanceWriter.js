'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const { getChildAdvancePath } = require('./advancePath');
const { withAdvanceFileLock } = require('./advanceLock');
const { projectAdvanceRemainder, readAdvanceEvents } = require('./advanceProjection');

const ADVANCE_SCHEMA_VERSION = 1;
const EVENT_TYPES = new Set([
  'issue',
  'settle-intent',
  'settle-pending',
  'settle-settled',
  'settle-failed',
  'forgive',
]);

/**
 * @param {unknown} amount
 * @returns {string}
 */
function amountToIntegerString(amount) {
  if (typeof amount === 'bigint') {
    if (amount <= 0n) {
      throw new Error('advance amount must be positive');
    }
    return amount.toString();
  }
  if (typeof amount !== 'string' || !/^[0-9]+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error('advance amount must be a positive integer string');
  }
  return amount.replace(/^0+(?=\d)/, '');
}

/**
 * Append one Advance event. Does not open Debt or payment journals.
 * @param {{
 *   child: unknown,
 *   scope: { mode?: unknown, chainId?: unknown, token?: unknown, pool?: unknown },
 *   advanceId: string,
 *   type: string,
 *   amount?: string|bigint,
 *   advanceRoot?: string,
 *   mode?: string,
 *   eventId?: string,
 *   recordedAt?: string,
 *   comment?: string,
 *   operationId?: string,
 *   txHash?: string,
 *   system?: string,
 *   subject?: string,
 *   violations?: Array<{ code: string, message: string }>,
 * }} params
 * @returns {Promise<{ filePath: string, event: Record<string, unknown> }>}
 */
async function appendAdvanceEvent(params) {
  const type = String(params?.type ?? '');
  if (!EVENT_TYPES.has(type)) {
    throw new Error(`unknown advance event type: ${type || '(empty)'}`);
  }
  const scopeMode = String(params?.scope?.mode ?? '').trim().toLowerCase();
  const mode = params?.mode ?? scopeMode;
  if (mode !== scopeMode) {
    throw new Error('advance scope.mode must match the journal mode');
  }
  const advanceId = String(params?.advanceId ?? '').trim();
  if (!advanceId) {
    throw new Error('advance_id is required');
  }

  const filePath = getChildAdvancePath({
    child: params.child,
    scope: params.scope,
    advanceRoot: params.advanceRoot,
    mode,
  });

  return withAdvanceFileLock(filePath, async () => {
    const events = await readAdvanceEvents(filePath);
    const remainderBefore = projectAdvanceRemainder(events, advanceId);
    const event = {
      schema_version: ADVANCE_SCHEMA_VERSION,
      event_id: params.eventId ?? crypto.randomUUID(),
      advance_id: advanceId,
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
      type,
      amount_unit: 'token_raw',
      remainder_before: remainderBefore.toString(),
      remainder_after: remainderBefore.toString(),
    };
    if (type === 'issue' && params.amount == null) {
      throw new Error('issue amount is required');
    }
    if (params.amount != null) {
      event.amounts = {
        amount: amountToIntegerString(params.amount),
        amount_unit: 'token_raw',
      };
    }
    if (params.comment != null) {
      event.comment = params.comment;
    }
    if (params.operationId != null) {
      event.operation_id = params.operationId;
    }
    if (params.txHash != null) {
      event.tx_hash = String(params.txHash);
    }
    if (params.system != null) {
      event.system = params.system;
    }
    if (params.subject != null) {
      event.subject = params.subject;
    }
    if (Array.isArray(params.violations) && params.violations.length > 0) {
      event.violations = params.violations;
    }
    event.remainder_after = projectAdvanceRemainder([...events, event], advanceId).toString();
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
    return { filePath, event };
  });
}

module.exports = {
  ADVANCE_SCHEMA_VERSION,
  appendAdvanceEvent,
};
