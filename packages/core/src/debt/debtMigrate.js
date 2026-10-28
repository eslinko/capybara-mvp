'use strict';

const fs = require('fs/promises');
const { readDebtEvents } = require('./debtProjection');
const { withDebtFileLock } = require('./debtLock');
const { AMOUNT_UNIT_RAW, rawScale } = require('./debtAmount');

/**
 * @param {Record<string, unknown>} event
 * @returns {boolean}
 */
function alreadyRaw(event) {
  return event.amount_unit === AMOUNT_UNIT_RAW
    || (event.amounts != null && event.amounts.amount_unit === AMOUNT_UNIT_RAW);
}

/**
 * @param {unknown} value
 * @param {bigint} factor
 * @returns {unknown}
 */
function scaleInteger(value, factor) {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
    return value;
  }
  return (BigInt(value) * factor).toString();
}

/**
 * @param {Record<string, unknown>} event
 * @param {bigint} factor
 * @returns {Record<string, unknown>}
 */
function scaleEvent(event, factor) {
  if (alreadyRaw(event)) {
    return event;
  }
  const next = { ...event, amount_unit: AMOUNT_UNIT_RAW };
  if (event.amounts != null && typeof event.amounts === 'object') {
    const amounts = { ...event.amounts, amount_unit: AMOUNT_UNIT_RAW };
    if (amounts.amount != null) {
      amounts.amount = scaleInteger(amounts.amount, factor);
    }
    next.amounts = amounts;
  }
  if (event.remainder_before != null) {
    next.remainder_before = scaleInteger(event.remainder_before, factor);
  }
  if (event.remainder_after != null) {
    next.remainder_after = scaleInteger(event.remainder_after, factor);
  }
  return next;
}

/**
 * Pre-DEBT-07 rows are human-whole CAPY. Scale them once and mark token_raw.
 * decimals 0 is already raw-sized, so the file is left untouched.
 * @param {string} filePath
 * @param {number} decimals
 * @returns {Promise<{ migrated: boolean }>}
 */
async function migrateHumanWholeJournal(filePath, decimals) {
  if (decimals === 0) {
    return { migrated: false };
  }
  const first = await readDebtEvents(filePath);
  if (first.length === 0 || !first.some((event) => !alreadyRaw(event))) {
    return { migrated: false };
  }
  const factor = rawScale(decimals);
  await withDebtFileLock(filePath, async () => {
    const events = await readDebtEvents(filePath);
    if (!events.some((event) => !alreadyRaw(event))) {
      return;
    }
    const scaled = events.map((event) => scaleEvent(event, factor));
    await fs.writeFile(filePath, `${scaled.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
  });
  return { migrated: true };
}

module.exports = {
  alreadyRaw,
  migrateHumanWholeJournal,
};
