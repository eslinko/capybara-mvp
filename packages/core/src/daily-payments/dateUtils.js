'use strict';

/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD (UTC)
 */
function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * @returns {string} YYYY-MM-DD (UTC)
 */
function utcToday() {
  return formatUtcDate(new Date());
}

/**
 * @param {string} dateStr YYYY-MM-DD
 * @returns {boolean}
 */
function isValidDateStr(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * @param {string} dateStr YYYY-MM-DD
 * @param {number} days
 * @returns {string}
 */
function addUtcDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

/**
 * @param {string} fromStr YYYY-MM-DD inclusive
 * @param {string} toStr YYYY-MM-DD inclusive
 * @returns {string[]}
 */
function enumerateUtcDays(fromStr, toStr) {
  const days = [];
  let cursor = fromStr;
  while (cursor <= toStr) {
    days.push(cursor);
    cursor = addUtcDays(cursor, 1);
  }
  return days;
}

/**
 * @param {number} unixSeconds
 * @returns {string}
 */
function utcDateFromUnixSeconds(unixSeconds) {
  return formatUtcDate(new Date(unixSeconds * 1000));
}

const DEFAULT_SEC_PER_BLOCK = 2;

/** Lower bound sec/block for reconcile fromBlock — must not exceed true blocksBack on fast chains. */
const CONSERVATIVE_SEC_PER_BLOCK = 1;

/** Extra blocks before estimated start so early in-period transfers are not skipped. */
const BLOCK_ESTIMATE_CUSHION = 12;

/**
 * Estimate block number at or before start of UTC calendar day (v1: conservative avg block time).
 * Uses divisor below typical fast-chain block time plus fixed cushion — never narrows range vs true start.
 * @param {import('ethers').Provider} provider
 * @param {string} periodStartDateStr YYYY-MM-DD
 * @returns {Promise<number>}
 */
async function estimateFromBlockForUtcDate(provider, periodStartDateStr) {
  const latest = await provider.getBlock('latest');
  if (latest == null) {
    throw new Error('RPC returned null for latest block — cannot estimate reconcile fromBlock');
  }

  const [y, m, d] = periodStartDateStr.split('-').map(Number);
  const periodStartSec = Math.floor(Date.UTC(y, m - 1, d) / 1000);
  const secDiff = latest.timestamp - periodStartSec;
  if (secDiff <= 0) {
    return 0;
  }

  const blocksBack =
    Math.floor(secDiff / CONSERVATIVE_SEC_PER_BLOCK) + BLOCK_ESTIMATE_CUSHION;
  return Math.max(0, Number(latest.number) - blocksBack);
}

/**
 * Estimate block number at or after end of UTC calendar day (upper bound for log queries).
 * @param {import('ethers').Provider} provider
 * @param {string} periodEndDateStr YYYY-MM-DD
 * @returns {Promise<number>}
 */
async function estimateToBlockForUtcDate(provider, periodEndDateStr) {
  const latest = await provider.getBlock('latest');
  if (latest == null) {
    throw new Error('RPC returned null for latest block — cannot estimate reconcile toBlock');
  }

  const [y, m, d] = periodEndDateStr.split('-').map(Number);
  const dayAfterSec = Math.floor(Date.UTC(y, m - 1, d + 1) / 1000);

  if (latest.timestamp < dayAfterSec) {
    return Number(latest.number);
  }

  const secDiff = latest.timestamp - dayAfterSec;
  const blocksBack =
    Math.floor(secDiff / CONSERVATIVE_SEC_PER_BLOCK) + BLOCK_ESTIMATE_CUSHION;
  return Math.max(0, Number(latest.number) - blocksBack);
}

module.exports = {
  formatUtcDate,
  utcToday,
  isValidDateStr,
  addUtcDays,
  enumerateUtcDays,
  utcDateFromUnixSeconds,
  DEFAULT_SEC_PER_BLOCK,
  CONSERVATIVE_SEC_PER_BLOCK,
  BLOCK_ESTIMATE_CUSHION,
  estimateFromBlockForUtcDate,
  estimateToBlockForUtcDate,
};
