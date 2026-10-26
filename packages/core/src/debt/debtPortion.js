'use strict';

/**
 * @param {string} message
 * @returns {Error}
 */
function portionError(message) {
  const error = new Error(message);
  error.code = 'EDEBT_VALIDATION';
  return error;
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
function hasText(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

/**
 * Amount, percent, and `all` are mutually exclusive.
 * Percent uses floor(remainder × p / 100). 100% is the whole remainder.
 * @param {{
 *   remainder: bigint,
 *   amount?: unknown,
 *   percent?: unknown,
 *   all?: boolean,
 * }} params
 * @returns {bigint}
 */
function resolveDebtPortion(params) {
  const remainder = params.remainder;
  const amountSet = hasText(params.amount);
  const percentSet = hasText(params.percent);
  const allSet = params.all === true;
  const chosen = [amountSet, percentSet, allSet].filter(Boolean).length;
  if (chosen !== 1) {
    throw portionError('amount, percent, and all are mutually exclusive');
  }
  if (remainder < 0n) {
    throw portionError('remainder is negative');
  }
  if (allSet) {
    if (remainder === 0n) {
      throw portionError('amount is zero');
    }
    return remainder;
  }
  if (percentSet) {
    const text = String(params.percent).trim();
    if (!/^[0-9]+$/.test(text)) {
      throw portionError('percent must be an integer from 1 to 100');
    }
    const percent = BigInt(text);
    if (percent <= 0n || percent > 100n) {
      throw portionError('percent must be an integer from 1 to 100');
    }
    const portion = (remainder * percent) / 100n;
    if (portion <= 0n) {
      throw portionError('percent rounds to zero');
    }
    return portion;
  }
  const text = String(params.amount).trim();
  if (!/^[0-9]+$/.test(text) || BigInt(text) <= 0n) {
    throw portionError('amount must be a positive integer');
  }
  const amount = BigInt(text);
  if (amount > remainder) {
    throw portionError(`amount ${amount} exceeds remainder ${remainder}`);
  }
  return amount;
}

module.exports = {
  resolveDebtPortion,
  portionError,
};
