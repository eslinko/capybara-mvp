'use strict';

const path = require('path');
const { CAPYBARA_ROOT } = require('../env-path');

const DEBT_LOG_ROOT = path.join(CAPYBARA_ROOT, 'logs', 'capybara', 'debt');
const MOCK_LOG_SUBDIR = 'mock';
const SCOPE_PART_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;

/**
 * @param {string} [debtRoot]
 * @returns {string}
 */
function getProdDebtDir(debtRoot = DEBT_LOG_ROOT) {
  return debtRoot;
}

/**
 * @param {string} [debtRoot]
 * @returns {string}
 */
function getMockDebtDir(debtRoot = DEBT_LOG_ROOT) {
  return path.join(getProdDebtDir(debtRoot), MOCK_LOG_SUBDIR);
}

/**
 * Prod only for gfl_reality. Every other mode stays under mock/.
 * @param {string} [debtRoot]
 * @param {string} mode
 * @returns {string}
 */
function resolveDebtDirForMode(debtRoot, mode) {
  return mode === 'gfl_reality' ? getProdDebtDir(debtRoot) : getMockDebtDir(debtRoot);
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {string}
 */
function stableScopePart(value, name) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!SCOPE_PART_PATTERN.test(text) || text.includes('--') || text.includes('..')) {
    throw new Error(`debt scope ${name} is not a stable path key`);
  }
  return text;
}

/**
 * Stable directory key for mode + chainId + token + pool.
 * @param {{ mode?: unknown, chainId?: unknown, token?: unknown, pool?: unknown }} scope
 * @returns {string}
 */
function scopeKey(scope) {
  const mode = stableScopePart(scope?.mode, 'mode');
  const chainId = stableScopePart(scope?.chainId, 'chainId');
  const token = stableScopePart(scope?.token, 'token');
  const pool = stableScopePart(scope?.pool, 'pool');
  return [mode, chainId, token, pool].join('--');
}

/**
 * @param {unknown} child
 * @returns {string}
 */
function childFileStem(child) {
  const text = String(child ?? '').trim().toLowerCase();
  if (!SCOPE_PART_PATTERN.test(text) || text.includes('..')) {
    throw new Error('debt child is not a stable file name');
  }
  return text;
}

/**
 * @param {{
 *   child: unknown,
 *   scope: { mode?: unknown, chainId?: unknown, token?: unknown, pool?: unknown },
 *   debtRoot?: string,
 *   mode?: string,
 * }} params
 * @returns {string}
 */
function getChildDebtPath(params) {
  const scope = params?.scope ?? {};
  const mode = params?.mode ?? String(scope.mode ?? '').trim().toLowerCase();
  const directory = resolveDebtDirForMode(params?.debtRoot ?? DEBT_LOG_ROOT, mode);
  return path.join(directory, scopeKey(scope), `${childFileStem(params?.child)}.ndjson`);
}

/**
 * Exclusive mkdir lock sits next to the child NDJSON.
 * @param {string} filePath
 * @returns {string}
 */
function getDebtLockPath(filePath) {
  return `${filePath}.lock`;
}

module.exports = {
  DEBT_LOG_ROOT,
  MOCK_LOG_SUBDIR,
  getProdDebtDir,
  getMockDebtDir,
  resolveDebtDirForMode,
  scopeKey,
  childFileStem,
  getChildDebtPath,
  getDebtLockPath,
};
