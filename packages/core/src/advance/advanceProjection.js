'use strict';

const fs = require('fs/promises');

const ZERO_DELTA_TYPES = new Set(['settle-intent', 'settle-pending']);
const CLOSING_TYPES = new Set(['settle-settled', 'forgive']);
const KNOWN_TYPES = new Set(['issue', ...ZERO_DELTA_TYPES, ...CLOSING_TYPES]);

/**
 * @param {string} message
 * @param {number} lineNumber
 * @param {unknown} [cause]
 * @returns {Error}
 */
function corruptLineError(message, lineNumber, cause) {
  const error = new Error(`${message} (line ${lineNumber})`);
  error.code = 'EADVANCE_CORRUPT';
  error.lineNumber = lineNumber;
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

/**
 * @param {unknown} raw
 * @param {number} lineNumber
 * @returns {bigint}
 */
function readIntegerAmount(raw, lineNumber) {
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) {
    throw corruptLineError('advance amount must be an integer string', lineNumber);
  }
  const amount = BigInt(raw);
  if (amount <= 0n) {
    throw corruptLineError('advance amount must be positive', lineNumber);
  }
  return amount;
}

/**
 * Open remainder equals the issue amount until settle-settled or forgive, which close it.
 * settle-intent and settle-pending do not close.
 * @param {Array<Record<string, unknown>>} events
 * @param {string} advanceId
 * @returns {bigint}
 */
function projectAdvanceRemainder(events, advanceId) {
  let open = 0n;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event?.advance_id !== advanceId) {
      continue;
    }
    const type = event.type;
    const lineNumber = index + 1;
    if (typeof type !== 'string' || !KNOWN_TYPES.has(type)) {
      throw corruptLineError(`unknown advance event type: ${String(type)}`, lineNumber);
    }
    if (event.amount_unit != null && event.amount_unit !== 'token_raw') {
      throw corruptLineError('advance amount_unit must be token_raw', lineNumber);
    }
    if (ZERO_DELTA_TYPES.has(type)) {
      continue;
    }
    if (CLOSING_TYPES.has(type)) {
      open = 0n;
      continue;
    }
    open += readIntegerAmount(event.amounts?.amount, lineNumber);
  }
  return open;
}

/**
 * @param {string} filePath
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function readAdvanceEvents(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    const lineNumber = index + 1;
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw corruptLineError('corrupt advance journal line', lineNumber, error);
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw corruptLineError('corrupt advance journal line', lineNumber);
    }
    events.push(row);
  }
  return events;
}

module.exports = {
  ZERO_DELTA_TYPES,
  CLOSING_TYPES,
  projectAdvanceRemainder,
  readAdvanceEvents,
};
