'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const { getChildDebtPath } = require('./debtPath');
const { withDebtFileLock } = require('./debtLock');
const { projectDebtRemainder, readDebtEvents } = require('./debtProjection');

const DEBT_SCHEMA_VERSION = 1;

/**
 * @param {unknown} amount
 * @returns {string}
 */
function amountToIntegerString(amount) {
  if (typeof amount === 'bigint') {
    if (amount <= 0n) {
      throw new Error('debt amount must be positive');
    }
    return amount.toString();
  }
  if (typeof amount !== 'string' || !/^[0-9]+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error('debt amount must be a positive integer string');
  }
  return amount.replace(/^0+(?=\d)/, '');
}

/**
 * Append one Debt event under the child-file mkdir lock.
 * Does not open or write payment `logs/capybara/{wallet}.ndjson`.
 * @param {{
 *   child: unknown,
 *   scope: { mode?: unknown, chainId?: unknown, token?: unknown, pool?: unknown },
 *   debtId: string,
 *   type: string,
 *   amount: string|bigint,
 *   debtRoot?: string,
 *   mode?: string,
 *   eventId?: string,
 *   recordedAt?: string,
 *   comment?: string,
 *   operationId?: string,
 *   override?: boolean,
 *   overrideReason?: string,
 *   violatedRules?: string[],
 * }} params
 * @returns {Promise<{ filePath: string, event: Record<string, unknown> }>}
 */
async function appendDebtEvent(params) {
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
    const remainderBefore = projectDebtRemainder(events, params.debtId);
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
      type: params.type,
      amounts: {
        amount: amountToIntegerString(params.amount),
      },
      remainder_before: remainderBefore.toString(),
      remainder_after: remainderBefore.toString(),
    };
    if (params.comment != null) {
      event.comment = params.comment;
    }
    if (params.operationId != null) {
      event.operation_id = params.operationId;
    }
    if (params.override === true) {
      const reason = String(params.overrideReason ?? '').trim();
      if (!reason) {
        throw new Error('debt override reason is required');
      }
      event.override = true;
      event.override_reason = reason;
      event.violated_rules = [...(params.violatedRules ?? [])];
    }

    const remainderAfter = projectDebtRemainder([...events, event], params.debtId);
    event.remainder_after = remainderAfter.toString();
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
    return { filePath, event };
  });
}

module.exports = {
  DEBT_SCHEMA_VERSION,
  appendDebtEvent,
};
