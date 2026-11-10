'use strict';

const fs = require('fs/promises');
const path = require('path');
const { CAPYBARA_ROOT } = require('../env-path');

const WORKING_LIMITS_PATH = path.join(CAPYBARA_ROOT, 'config', 'advance-limits.json');
const EXAMPLE_LIMITS_PATH = path.join(CAPYBARA_ROOT, 'config', 'advance-limits.example.json');

/** Non-empty env wins over the file. Values are not defaulted in source. */
const ADVANCE_LIMIT_ENV = {
  maxOutstanding: 'CAPY_ADVANCE_MAX_OUTSTANDING',
  maxOpenAdvances: 'CAPY_ADVANCE_MAX_OPEN',
};

/**
 * @param {string} message
 * @returns {Error}
 */
function limitsError(message) {
  const error = new Error(message);
  error.code = 'EADVANCE_LIMITS';
  return error;
}

/**
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} env
 * @param {string} key
 * @returns {string}
 */
function readEnv(env, key) {
  const raw = env?.[key];
  if (raw === undefined || raw === null) {
    return '';
  }
  return String(raw).trim();
}

/**
 * @param {unknown} raw
 * @param {string} field
 * @returns {bigint}
 */
function integerValue(raw, field) {
  if (typeof raw === 'bigint') {
    if (raw < 0n) {
      throw limitsError(`${field} must be a non-negative integer`);
    }
    return raw;
  }
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw) || raw < 0) {
      throw limitsError(`${field} must be a non-negative integer`);
    }
    return BigInt(raw);
  }
  if (typeof raw === 'string' && /^[0-9]+$/.test(raw)) {
    return BigInt(raw);
  }
  throw limitsError(`${field} must be a non-negative integer`);
}

/**
 * Explicit amount or explicit disable. Omission is an error when required.
 * @param {unknown} raw
 * @param {string} field
 * @param {boolean} required
 * @returns {{ kind: 'amount', amount: bigint }|{ kind: 'disabled' }|null}
 */
function parseCap(raw, field, required) {
  if (raw === undefined || raw === null) {
    if (required) {
      throw limitsError(`${field} needs an explicit amount or an explicit disable`);
    }
    return null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const disabled = raw.disabled === true;
    const hasAmount = raw.amount !== undefined && raw.amount !== null;
    if (disabled && hasAmount) {
      throw limitsError(`${field} cannot be both an amount and disabled`);
    }
    if (disabled) {
      return { kind: 'disabled' };
    }
    if (!hasAmount) {
      throw limitsError(`${field} needs an explicit amount or an explicit disable`);
    }
    return { kind: 'amount', amount: integerValue(raw.amount, field) };
  }
  return { kind: 'amount', amount: integerValue(raw, field) };
}

/**
 * @param {Record<string, unknown>} source
 * @param {boolean} isChild
 * @returns {Record<string, unknown>}
 */
function parseLimitBlock(source, isChild) {
  const block = {};
  if (Object.prototype.hasOwnProperty.call(source, 'max_advance_outstanding')) {
    block.maxOutstanding = parseCap(source.max_advance_outstanding, 'max_advance_outstanding', true);
  } else if (!isChild) {
    throw limitsError('max_advance_outstanding needs an explicit amount or an explicit disable');
  }
  if (Object.prototype.hasOwnProperty.call(source, 'max_open_advances')) {
    block.maxOpenAdvances = parseCap(source.max_open_advances, 'max_open_advances', true);
  } else if (!isChild) {
    throw limitsError('max_open_advances needs an explicit amount or an explicit disable');
  }
  return block;
}

/**
 * @param {string} [filePath]
 * @returns {Promise<{ limits: Record<string, unknown>, children: Record<string, Record<string, unknown>> }>}
 */
async function loadAdvanceLimitsFile(filePath = WORKING_LIMITS_PATH) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw limitsError(`advance limits file is missing: ${filePath}`);
    }
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw limitsError(`advance limits file is not valid JSON: ${filePath}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw limitsError('advance limits file must be an object');
  }
  const limits = parseLimitBlock(parsed, false);
  /** @type {Record<string, Record<string, unknown>>} */
  const children = {};
  if (parsed.children !== undefined) {
    if (!parsed.children || typeof parsed.children !== 'object' || Array.isArray(parsed.children)) {
      throw limitsError('children must be an object');
    }
    for (const [name, value] of Object.entries(parsed.children)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw limitsError(`child limits for ${name} must be an object`);
      }
      children[name.trim().toLowerCase()] = parseLimitBlock(value, true);
    }
  }
  return { limits, children };
}

/**
 * @param {Record<string, unknown>} limits
 * @param {Record<string, string|undefined>} env
 * @returns {Record<string, unknown>}
 */
function applyEnvOverrides(limits, env) {
  const next = { ...limits };
  const outstanding = readEnv(env, ADVANCE_LIMIT_ENV.maxOutstanding);
  if (outstanding) {
    next.maxOutstanding = outstanding.toLowerCase() === 'disabled'
      ? { kind: 'disabled' }
      : { kind: 'amount', amount: integerValue(outstanding, ADVANCE_LIMIT_ENV.maxOutstanding) };
  }
  const openAdvances = readEnv(env, ADVANCE_LIMIT_ENV.maxOpenAdvances);
  if (openAdvances) {
    next.maxOpenAdvances = openAdvances.toLowerCase() === 'disabled'
      ? { kind: 'disabled' }
      : { kind: 'amount', amount: integerValue(openAdvances, ADVANCE_LIMIT_ENV.maxOpenAdvances) };
  }
  return next;
}

/**
 * @param {{ limits: Record<string, unknown>, children: Record<string, Record<string, unknown>> }} loaded
 * @param {string} child
 * @param {Record<string, string|undefined>} [env]
 * @returns {{
 *   maxOutstanding: { kind: 'amount', amount: bigint }|{ kind: 'disabled' },
 *   maxOpenAdvances: { kind: 'amount', amount: bigint }|{ kind: 'disabled' },
 * }}
 */
function resolveChildAdvanceLimits(loaded, child, env = {}) {
  const name = String(child ?? '').trim().toLowerCase();
  const overlay = loaded.children?.[name] ?? {};
  const merged = applyEnvOverrides({
    maxOutstanding: overlay.maxOutstanding ?? loaded.limits.maxOutstanding,
    maxOpenAdvances: overlay.maxOpenAdvances ?? loaded.limits.maxOpenAdvances,
  }, env);
  if (!merged.maxOutstanding) {
    throw limitsError('max_advance_outstanding needs an explicit amount or an explicit disable');
  }
  if (!merged.maxOpenAdvances) {
    throw limitsError('max_open_advances needs an explicit amount or an explicit disable');
  }
  return merged;
}

/**
 * An amount cap is human whole CAPY. Compare it as token raw.
 * `disabled` and `maxOpenAdvances` stay as resolved.
 * @param {{
 *   maxOutstanding: { kind: string, amount?: bigint },
 *   maxOpenAdvances: { kind: string, amount?: bigint },
 * }} limits
 * @param {number} decimals
 * @returns {object}
 */
function scaleAdvanceOutstandingToRaw(limits, decimals) {
  const cap = limits.maxOutstanding;
  if (!cap || cap.kind !== 'amount' || cap.amount == null) {
    return limits;
  }
  const factor = 10n ** BigInt(decimals);
  return {
    ...limits,
    maxOutstanding: { kind: 'amount', amount: cap.amount * factor },
  };
}

module.exports = {
  WORKING_LIMITS_PATH,
  EXAMPLE_LIMITS_PATH,
  ADVANCE_LIMIT_ENV,
  loadAdvanceLimitsFile,
  resolveChildAdvanceLimits,
  scaleAdvanceOutstandingToRaw,
  limitsError,
};
