'use strict';

const { ethers } = require('ethers');
const { parseAmountHuman } = require('../charge-pool/splitAllocation');
const { formatAmountHuman } = require('../actions/SweepToParentAction');

const AMOUNT_UNIT_RAW = 'token_raw';

/**
 * @param {string} message
 * @returns {Error}
 */
function debtAmountError(message) {
  const error = new Error(message);
  error.code = 'EDEBT_VALIDATION';
  return error;
}

/**
 * Human decimal string to token raw. Rejects extra fractional digits before parse.
 * Money compare stays bigint. `parseAmountHuman` performs the units parse.
 * @param {unknown} amountHuman
 * @param {number} decimals
 * @returns {bigint}
 */
function parseHumanToRaw(amountHuman, decimals) {
  const text = String(amountHuman ?? '').trim();
  const places = text.includes('.') ? text.split('.')[1].length : 0;
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw debtAmountError('CAPYBARA_DEBT_AMOUNT must be a positive decimal string');
  }
  if (places > decimals) {
    throw debtAmountError(
      `CAPYBARA_DEBT_AMOUNT has ${places} fractional digits; token decimals are ${decimals}`
    );
  }
  let raw;
  try {
    raw = parseAmountHuman(text, decimals);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CAPYBARA_DEBT_AMOUNT is invalid';
    throw debtAmountError(message.replaceAll('CAPYBARA_AMOUNT', 'CAPYBARA_DEBT_AMOUNT'));
  }
  if (raw <= 0n) {
    throw debtAmountError('CAPYBARA_DEBT_AMOUNT must be greater than 0');
  }
  return raw;
}

/**
 * @param {bigint} raw
 * @param {number} decimals
 * @returns {string}
 */
function formatRawAmount(raw, decimals) {
  return formatAmountHuman(raw, decimals, 'CAPY');
}

/**
 * @param {number} decimals
 * @returns {bigint}
 */
function rawScale(decimals) {
  return 10n ** BigInt(decimals);
}

module.exports = {
  AMOUNT_UNIT_RAW,
  debtAmountError,
  parseHumanToRaw,
  formatRawAmount,
  rawScale,
};
