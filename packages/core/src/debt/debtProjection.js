'use strict';

const fs = require('fs/promises');

const ZERO_DELTA_TYPES = new Set([
  'set-due',
  'repay-intent',
  'repay-pending',
  'repay-failed',
  'sanction-add',
  'sanction-cancel',
  'closure-resolve',
]);

/**
 * @param {string} message
 * @param {number} lineNumber
 * @param {unknown} [cause]
 * @returns {Error}
 */
function corruptLineError(message, lineNumber, cause) {
  const error = new Error(`${message} (line ${lineNumber})`);
  error.code = 'EDEBT_CORRUPT';
  error.lineNumber = lineNumber;
  if (cause !== undefined) {
    error.cause = cause;
  }
  return error;
}

/**
 * Integer token amount. Numbers and decimals are rejected so float never enters the sum.
 * @param {unknown} raw
 * @param {number} lineNumber
 * @returns {bigint}
 */
function readIntegerAmount(raw, lineNumber) {
  if (typeof raw !== 'string' || !/^[0-9]+$/.test(raw)) {
    throw corruptLineError('debt amount must be an integer string', lineNumber);
  }
  const amount = BigInt(raw);
  if (amount <= 0n) {
    throw corruptLineError('debt amount must be positive', lineNumber);
  }
  return amount;
}

/**
 * REQ §3: исходная + действующие штрафы − подтверждённые погашения − прощённые суммы.
 * Bare intent/pending and other zero-delta kinds do not change the remainder.
 * @param {Array<Record<string, unknown>>} events
 * @param {string} debtId
 * @returns {bigint}
 */
function projectDebtRemainder(events, debtId) {
  let original = 0n;
  let fines = 0n;
  let settled = 0n;
  let forgiven = 0n;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event?.debt_id !== debtId) {
      continue;
    }
    const type = event.type;
    const lineNumber = index + 1;
    if (typeof type !== 'string') {
      throw corruptLineError('debt event type is missing', lineNumber);
    }
    if (ZERO_DELTA_TYPES.has(type)) {
      if (event.amounts != null && event.amounts.amount != null) {
        readIntegerAmount(event.amounts.amount, lineNumber);
      }
      continue;
    }
    const amount = readIntegerAmount(event.amounts?.amount, lineNumber);
    if (type === 'create') {
      original += amount;
    } else if (type === 'fine') {
      fines += amount;
    } else if (type === 'cancel-fine') {
      fines -= amount;
    } else if (type === 'repay-settled') {
      settled += amount;
    } else if (type === 'forgive') {
      forgiven += amount;
    } else {
      throw corruptLineError(`unknown debt event type: ${type}`, lineNumber);
    }
    if (fines < 0n || original + fines - settled - forgiven < 0n) {
      throw corruptLineError('debt remainder would be negative', lineNumber);
    }
  }

  return original + fines - settled - forgiven;
}

/**
 * @param {string} filePath
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function readDebtEvents(filePath) {
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
      throw corruptLineError('corrupt debt journal line', lineNumber, error);
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw corruptLineError('corrupt debt journal line', lineNumber);
    }
    events.push(row);
  }
  return events;
}

/**
 * @param {string} filePath
 * @param {string} debtId
 * @returns {Promise<bigint>}
 */
async function projectDebtRemainderFromFile(filePath, debtId) {
  const events = await readDebtEvents(filePath);
  return projectDebtRemainder(events, debtId);
}

module.exports = {
  ZERO_DELTA_TYPES,
  projectDebtRemainder,
  readDebtEvents,
  projectDebtRemainderFromFile,
};
