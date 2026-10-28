'use strict';

const fs = require('fs/promises');
const path = require('path');
const { CAPYBARA_ROOT } = require('../env-path');

const WORKING_LIMITS_PATH = path.join(CAPYBARA_ROOT, 'config', 'debt-limits.json');
const EXAMPLE_LIMITS_PATH = path.join(CAPYBARA_ROOT, 'config', 'debt-limits.example.json');

/** Non-empty env wins over the file after the per-child overlay. */
const DEBT_LIMIT_ENV = {
  maxOutstanding: 'CAPY_DEBT_MAX_OUTSTANDING',
  maxOpenDebts: 'CAPY_DEBT_MAX_OPEN_DEBTS',
  blockOnOverdue: 'CAPY_DEBT_BLOCK_ON_OVERDUE',
  gadgetMinutes: 'CAPY_DEBT_GADGET_MINUTES',
};

const START_MAX_OPEN_DEBTS = 2n;
const START_BLOCK_ON_OVERDUE = true;
const START_GADGET_MINUTES = 60n;

/**
 * @param {string} message
 * @returns {Error}
 */
function limitsError(message) {
  const error = new Error(message);
  error.code = 'EDEBT_LIMITS';
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
 * Explicit amount or explicit disable. Omission is an error. Zero stays an amount.
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
    if (!hasAmount || raw.disabled === false) {
      if (!hasAmount) {
        throw limitsError(`${field} needs an explicit amount or an explicit disable`);
      }
    }
    if (hasAmount) {
      return { kind: 'amount', amount: integerValue(raw.amount, field) };
    }
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
  if (Object.prototype.hasOwnProperty.call(source, 'max_outstanding')) {
    block.maxOutstanding = parseCap(source.max_outstanding, 'max_outstanding', true);
  } else if (!isChild) {
    throw limitsError('max_outstanding needs an explicit amount or an explicit disable');
  }
  if (Object.prototype.hasOwnProperty.call(source, 'max_open_debts')) {
    block.maxOpenDebts = parseCap(source.max_open_debts, 'max_open_debts', true);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'block_on_overdue')) {
    if (typeof source.block_on_overdue !== 'boolean') {
      throw limitsError('block_on_overdue must be true or false');
    }
    block.blockOnOverdue = source.block_on_overdue;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'gadget_minutes')) {
    const minutes = integerValue(source.gadget_minutes, 'gadget_minutes');
    if (minutes <= 0n) {
      throw limitsError('gadget_minutes must be a positive integer');
    }
    block.gadgetMinutes = minutes;
  }
  return block;
}

/**
 * @param {string} filePath
 * @returns {Promise<{ limits: Record<string, unknown>, children: Record<string, Record<string, unknown>> }>}
 */
async function loadDebtLimitsFile(filePath = WORKING_LIMITS_PATH) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw limitsError(`debt limits file is missing: ${filePath}`);
    }
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw limitsError(`debt limits file is not valid JSON: ${filePath}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw limitsError('debt limits file must be an object');
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
  const outstanding = readEnv(env, DEBT_LIMIT_ENV.maxOutstanding);
  if (outstanding) {
    next.maxOutstanding = outstanding.toLowerCase() === 'disabled'
      ? { kind: 'disabled' }
      : { kind: 'amount', amount: integerValue(outstanding, DEBT_LIMIT_ENV.maxOutstanding) };
  }
  const openDebts = readEnv(env, DEBT_LIMIT_ENV.maxOpenDebts);
  if (openDebts) {
    next.maxOpenDebts = openDebts.toLowerCase() === 'disabled'
      ? { kind: 'disabled' }
      : { kind: 'amount', amount: integerValue(openDebts, DEBT_LIMIT_ENV.maxOpenDebts) };
  }
  const overdue = readEnv(env, DEBT_LIMIT_ENV.blockOnOverdue);
  if (overdue) {
    if (overdue !== 'true' && overdue !== 'false') {
      throw limitsError(`${DEBT_LIMIT_ENV.blockOnOverdue} must be true or false`);
    }
    next.blockOnOverdue = overdue === 'true';
  }
  const minutes = readEnv(env, DEBT_LIMIT_ENV.gadgetMinutes);
  if (minutes) {
    const value = integerValue(minutes, DEBT_LIMIT_ENV.gadgetMinutes);
    if (value <= 0n) {
      throw limitsError(`${DEBT_LIMIT_ENV.gadgetMinutes} must be a positive integer`);
    }
    next.gadgetMinutes = value;
  }
  return next;
}

/**
 * @param {{ limits: Record<string, unknown>, children: Record<string, Record<string, unknown>> }} loaded
 * @param {string} child
 * @param {Record<string, string|undefined>} [env]
 * @returns {{
 *   maxOutstanding: { kind: 'amount', amount: bigint }|{ kind: 'disabled' },
 *   maxOpenDebts: { kind: 'amount', amount: bigint }|{ kind: 'disabled' },
 *   blockOnOverdue: boolean,
 *   gadgetMinutes: bigint,
 * }}
 */
function resolveChildLimits(loaded, child, env = {}) {
  const name = String(child ?? '').trim().toLowerCase();
  const overlay = loaded.children?.[name] ?? {};
  const merged = applyEnvOverrides({
    maxOutstanding: overlay.maxOutstanding ?? loaded.limits.maxOutstanding,
    maxOpenDebts: overlay.maxOpenDebts ?? loaded.limits.maxOpenDebts ?? { kind: 'amount', amount: START_MAX_OPEN_DEBTS },
    blockOnOverdue: overlay.blockOnOverdue ?? loaded.limits.blockOnOverdue ?? START_BLOCK_ON_OVERDUE,
    gadgetMinutes: overlay.gadgetMinutes ?? loaded.limits.gadgetMinutes ?? START_GADGET_MINUTES,
  }, env);
  if (!merged.maxOutstanding) {
    throw limitsError('max_outstanding needs an explicit amount or an explicit disable');
  }
  return merged;
}

/**
 * JSON and env caps are human whole CAPY. Compare them as token raw.
 * @param {{ maxOutstanding?: { kind: string, amount?: bigint } }} limits
 * @param {number} decimals
 * @returns {object}
 */
function scaleOutstandingToRaw(limits, decimals) {
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
  DEBT_LIMIT_ENV,
  loadDebtLimitsFile,
  resolveChildLimits,
  scaleOutstandingToRaw,
  limitsError,
};
