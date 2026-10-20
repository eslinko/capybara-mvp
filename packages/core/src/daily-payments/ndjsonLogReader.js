'use strict';

const fs = require('fs/promises');
const path = require('path');
const { CAPYBARA_ROOT } = require('../env-path');

const DEFAULT_LOG_DIR = path.join(CAPYBARA_ROOT, 'logs', 'capybara');
const MOCK_LOG_SUBDIR = 'mock';

/**
 * @param {string} [logDir]
 * @returns {string}
 */
function getProdLogDir(logDir = DEFAULT_LOG_DIR) {
  return logDir;
}

/**
 * @param {string} [logDir]
 * @returns {string}
 */
function getMockLogDir(logDir = DEFAULT_LOG_DIR) {
  return path.join(getProdLogDir(logDir), MOCK_LOG_SUBDIR);
}

/**
 * @param {string} [logDir]
 * @param {'mock'|'gfl_reality'} mode
 * @returns {string}
 */
function resolveLogDirForMode(logDir, mode) {
  return mode === 'gfl_reality' ? getProdLogDir(logDir) : getMockLogDir(logDir);
}

/**
 * @param {string} wallet
 * @param {string} [logDir]
 * @returns {string}
 */
function getWalletLogPath(wallet, logDir = DEFAULT_LOG_DIR) {
  const key = String(wallet).toLowerCase().trim();
  return path.join(logDir, `${key}.ndjson`);
}

/**
 * @param {string} wallet
 * @param {string} [logDir]
 * @returns {Promise<string|null>} latest YYYY-MM-DD from day rows (prod journal only)
 */
async function readLastLogDate(wallet, logDir = DEFAULT_LOG_DIR) {
  const filePath = getWalletLogPath(wallet, getProdLogDir(logDir));
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  let lastDate = null;
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type === 'day' && row.date && (!lastDate || row.date > lastDate)) {
      lastDate = row.date;
    }
  }
  return lastDate;
}

/**
 * @param {string} wallet
 * @param {string} [logDir]
 * @returns {Promise<Set<string>>}
 */
async function readExistingDayDates(wallet, logDir = DEFAULT_LOG_DIR) {
  const filePath = getWalletLogPath(wallet, logDir);
  const dates = new Set();
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return dates;
    }
    throw error;
  }

  for (const line of content.split('\n').map((l) => l.trim()).filter(Boolean)) {
    try {
      const row = JSON.parse(line);
      if (row.type === 'day' && row.date) {
        dates.add(row.date);
      }
    } catch {
      continue;
    }
  }
  return dates;
}

/**
 * Sum prod-journal amounts for period dates (Q5=A).
 * day.actual on day.date, plus payment.paid_total on payment.date.
 * paid_total is not split across payment.days. Missing date stays 0.
 * @param {string} wallet
 * @param {string[]} periodDays
 * @param {string} [logDir]
 * @returns {Promise<Record<string, bigint>>}
 */
async function actualByDayFromJournal(wallet, periodDays, logDir = DEFAULT_LOG_DIR) {
  const periodSet = new Set(periodDays);
  /** @type {Record<string, bigint>} */
  const actualByDay = {};
  for (const day of periodDays) {
    actualByDay[day] = 0n;
  }

  const filePath = getWalletLogPath(wallet, getProdLogDir(logDir));
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return actualByDay;
    }
    throw error;
  }

  for (const line of content.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type === 'day') {
      addJournalAmount(actualByDay, periodSet, row.date, row.actual);
    } else if (row.type === 'payment') {
      addJournalAmount(actualByDay, periodSet, row.date, row.paid_total);
    }
  }

  return actualByDay;
}

/**
 * @param {Record<string, bigint>} actualByDay
 * @param {Set<string>} periodSet
 * @param {unknown} date
 * @param {unknown} raw
 */
function addJournalAmount(actualByDay, periodSet, date, raw) {
  if (typeof date !== 'string' || !periodSet.has(date)) {
    return;
  }
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return;
  }
  let value;
  try {
    value = BigInt(String(raw).trim());
  } catch {
    return;
  }
  actualByDay[date] += value;
}

module.exports = {
  DEFAULT_LOG_DIR,
  MOCK_LOG_SUBDIR,
  getProdLogDir,
  getMockLogDir,
  resolveLogDirForMode,
  getWalletLogPath,
  readLastLogDate,
  readExistingDayDates,
  actualByDayFromJournal,
};
