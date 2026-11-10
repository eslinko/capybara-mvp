'use strict';

const { projectAdvanceRemainder } = require('./advanceProjection');

/**
 * Latest settle-intent or settle-pending whose operation_id is not yet settled or failed.
 * @param {Array<Record<string, unknown>>} events
 * @param {string} advanceId
 * @returns {Record<string, unknown>|null}
 */
function findOpenSettleOperation(events, advanceId) {
  /** @type {Record<string, unknown>|null} */
  let open = null;
  const closed = new Set();
  for (const event of events) {
    if (event?.advance_id !== advanceId) {
      continue;
    }
    const operationId = typeof event.operation_id === 'string' ? event.operation_id : '';
    if (event.type === 'settle-settled' || event.type === 'settle-failed') {
      if (operationId) {
        closed.add(operationId);
      }
      if (open && open.operation_id === operationId) {
        open = null;
      }
      continue;
    }
    if (
      (event.type === 'settle-intent' || event.type === 'settle-pending')
      && operationId
      && !closed.has(operationId)
    ) {
      open = event;
    }
  }
  return open;
}

/**
 * Full open remainder for one advance. Does not write.
 * @param {Array<Record<string, unknown>>} events
 * @param {string} advanceId
 * @returns {bigint}
 */
function requireOpenAdvance(events, advanceId) {
  if (!events.some((event) => event.advance_id === advanceId)) {
    const missing = new Error(`advance_id not found: ${advanceId}`);
    missing.code = 'EADVANCE_VALIDATION';
    throw missing;
  }
  const remainder = projectAdvanceRemainder(events, advanceId);
  if (remainder === 0n) {
    const closed = new Error(`advance is already closed: ${advanceId}`);
    closed.code = 'EADVANCE_VALIDATION';
    throw closed;
  }
  return remainder;
}

module.exports = {
  findOpenSettleOperation,
  requireOpenAdvance,
};
