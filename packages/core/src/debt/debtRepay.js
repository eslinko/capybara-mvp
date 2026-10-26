'use strict';

const OPEN_REPAY_TYPES = new Set(['repay-intent', 'repay-pending']);
const CLOSED_REPAY_TYPES = new Set(['repay-settled', 'repay-failed']);

/**
 * Intent or pending lines that do not yet have a settled or failed close.
 * @param {Array<Record<string, unknown>>} events
 * @param {string} debtId
 * @returns {Array<Record<string, unknown>>}
 */
function openRepayOperations(events, debtId) {
  /** @type {Map<string, Record<string, unknown>>} */
  const open = new Map();
  for (const event of events) {
    if (event?.debt_id !== debtId || typeof event.operation_id !== 'string') {
      continue;
    }
    if (OPEN_REPAY_TYPES.has(event.type)) {
      open.set(event.operation_id, event);
    } else if (CLOSED_REPAY_TYPES.has(event.type)) {
      open.delete(event.operation_id);
    }
  }
  return [...open.values()];
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {string} operationId
 * @param {string} type
 * @returns {Record<string, unknown>|null}
 */
function findRepayEvent(events, operationId, type) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.operation_id === operationId && event.type === type) {
      return event;
    }
  }
  return null;
}

module.exports = {
  openRepayOperations,
  findRepayEvent,
};
