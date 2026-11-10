'use strict';

const path = require('path');
const { CAPYBARA_ROOT } = require('../env-path');

const ADVANCE_LOG_ROOT = path.join(CAPYBARA_ROOT, 'logs', 'capybara', 'advance');
const MOCK_LOG_SUBDIR = 'mock';
const SCOPE_PART_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;

/**
 * @param {string} [advanceRoot]
 * @returns {string}
 */
function getProdAdvanceDir(advanceRoot = ADVANCE_LOG_ROOT) {
  return advanceRoot;
}

/**
 * @param {string} [advanceRoot]
 * @returns {string}
 */
function getMockAdvanceDir(advanceRoot = ADVANCE_LOG_ROOT) {
  return path.join(getProdAdvanceDir(advanceRoot), MOCK_LOG_SUBDIR);
}

/**
 * Prod only for gfl_reality. Every other mode stays under mock/.
 * @param {string} [advanceRoot]
 * @param {string} mode
 * @returns {string}
 */
function resolveAdvanceDirForMode(advanceRoot, mode) {
  return mode === 'gfl_reality' ? getProdAdvanceDir(advanceRoot) : getMockAdvanceDir(advanceRoot);
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {string}
 */
function stableScopePart(value, name) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!SCOPE_PART_PATTERN.test(text) || text.includes('--') || text.includes('..')) {
    throw new Error(`advance scope ${name} is not a stable path key`);
  }
  return text;
}

/**
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
    throw new Error('advance child is not a stable file name');
  }
  return text;
}

/**
 * @param {{
 *   child: unknown,
 *   scope: { mode?: unknown, chainId?: unknown, token?: unknown, pool?: unknown },
 *   advanceRoot?: string,
 *   mode?: string,
 * }} params
 * @returns {string}
 */
function getChildAdvancePath(params) {
  const scope = params?.scope ?? {};
  const mode = params?.mode ?? String(scope.mode ?? '').trim().toLowerCase();
  const directory = resolveAdvanceDirForMode(params?.advanceRoot ?? ADVANCE_LOG_ROOT, mode);
  return path.join(directory, scopeKey(scope), `${childFileStem(params?.child)}.ndjson`);
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function getAdvanceLockPath(filePath) {
  return `${filePath}.lock`;
}

module.exports = {
  ADVANCE_LOG_ROOT,
  MOCK_LOG_SUBDIR,
  getProdAdvanceDir,
  getMockAdvanceDir,
  resolveAdvanceDirForMode,
  scopeKey,
  childFileStem,
  getChildAdvancePath,
  getAdvanceLockPath,
};
