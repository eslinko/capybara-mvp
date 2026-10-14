'use strict';

const REQUIRED_KEYS = [
  'TRISTAN_PRIVATE_KEY',
  'TRISTAN_ADDRESS',
  'BASTIAN_PRIVATE_KEY',
  'BASTIAN_ADDRESS',
  'CAPY_TOKEN_ADDRESS',
  'PARENT_ADDRESS',
  'PARENT_PRIVATE_KEY',
  'CAPY_DAILY_TRISTAN',
  'CAPY_DAILY_BASTIAN',
  'CAPY_RPC_URL',
  'CAPY_CHAIN_ID',
];

const DAILY_RATE_KEYS = ['CAPY_DAILY_TRISTAN', 'CAPY_DAILY_BASTIAN'];

const ALLOWED_CAPY_MODES = new Set(['mock', 'gfl_reality']);

const DEFAULT_POLYGONSCAN_API_BASE = 'https://api.etherscan.io/v2/api';
const DEFAULT_POLYGONSCAN_CHAIN_ID = 137;

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function resolvePolygonscanApiBase(env) {
  const raw = env.POLYGONSCAN_API_BASE;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_POLYGONSCAN_API_BASE;
  }
  return String(raw).trim();
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {number}
 */
function resolvePolygonscanChainId(env) {
  const raw = env.POLYGONSCAN_CHAIN_ID;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_POLYGONSCAN_CHAIN_ID;
  }
  const chainId = Number(String(raw).trim());
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : DEFAULT_POLYGONSCAN_CHAIN_ID;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null}
 */
function resolvePolygonscanApiKey(env) {
  const raw = env.POLYGONSCAN_API_KEY;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  return String(raw).trim();
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function isValidPolygonscanApiKeyShape(key) {
  return key.length >= 10 && /^[A-Za-z0-9]+$/.test(key);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {'mock'|'gfl_reality'}
 */
function resolveCapyMode(env) {
  const raw = env.CAPY_MODE;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return 'mock';
  }
  return /** @type {'mock'|'gfl_reality'} */ (String(raw).trim());
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {number|null}
 */
function resolveConfiguredAction(env) {
  const raw = env?.CAPYBARA_ACTION;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const action = Number.parseInt(String(raw).trim(), 10);
  return Number.isNaN(action) ? null : action;
}

/**
 * Action 51 (deploy) has no token yet. Actions 0–4 and 52 still require CAPY_TOKEN_ADDRESS.
 * Deployer keys are required only for 51 and 52.
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function keysRequiredForEnv(env) {
  const action = resolveConfiguredAction(env);
  const keys = REQUIRED_KEYS.filter((key) => !(key === 'CAPY_TOKEN_ADDRESS' && action === 51));
  if (action === 51 || action === 52) {
    keys.push('DEPLOYER_ADDRESS', 'DEPLOYER_PRIVATE_KEY');
  }
  return keys;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} key
 * @returns {string}
 */
function readEnvString(env, key) {
  const raw = env?.[key];
  if (raw === undefined || raw === null) {
    return '';
  }
  return String(raw).trim();
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function validateCapybaraEnv(env) {
  const errors = [];
  for (const key of keysRequiredForEnv(env)) {
    const value = env[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`${key} is required`);
    }
  }

  const chainRaw = env.CAPY_CHAIN_ID;
  if (chainRaw !== undefined && chainRaw !== null && String(chainRaw).trim() !== '') {
    const trimmed = String(chainRaw).trim();
    if (!/^\d+$/.test(trimmed)) {
      errors.push('CAPY_CHAIN_ID must be a positive integer');
    } else {
      const chainId = Number(trimmed);
      if (!Number.isSafeInteger(chainId) || chainId <= 0) {
        errors.push('CAPY_CHAIN_ID must be a positive integer');
      }
    }
  }

  const modeRaw = env.CAPY_MODE;
  if (modeRaw !== undefined && modeRaw !== null && String(modeRaw).trim() !== '') {
    const mode = String(modeRaw).trim();
    if (!ALLOWED_CAPY_MODES.has(mode)) {
      errors.push('CAPY_MODE must be one of: mock, gfl_reality');
    }
  }

  for (const key of DAILY_RATE_KEYS) {
    const raw = env[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      continue;
    }
    const trimmed = String(raw).trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      errors.push(`${key} must be a positive number`);
    } else if (Number(trimmed) <= 0) {
      errors.push(`${key} must be greater than 0`);
    }
  }

  const rpcRaw = env.CAPY_RPC_URL;
  if (rpcRaw !== undefined && rpcRaw !== null && String(rpcRaw).trim() !== '') {
    const rpcError = validateRpcUrlShape(normalizeRpcUrl(rpcRaw));
    if (rpcError) {
      errors.push(rpcError);
    }
  }

  const polygonscanRaw = env.POLYGONSCAN_API_KEY;
  if (polygonscanRaw !== undefined && polygonscanRaw !== null && String(polygonscanRaw).trim() !== '') {
    const polygonscanKey = resolvePolygonscanApiKey(env);
    if (!polygonscanKey || !isValidPolygonscanApiKeyShape(polygonscanKey)) {
      errors.push('POLYGONSCAN_API_KEY has invalid format (expected alphanumeric API key, min 10 chars)');
    }
  }

  const networkScanner = resolveNetworkScanner(env);
  if (networkScanner) {
    const scannerError = validateNetworkScannerShape(networkScanner);
    if (scannerError) {
      errors.push(`${networkScannerSourceKey(env)} ${scannerError}`);
    }
  }

  return errors;
}

/**
 * @param {string} key
 * @returns {string}
 */
function normalizePrivateKey(key) {
  const trimmed = String(key).trim();
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

/**
 * Ensure CAPY_RPC_URL is a valid http(s) URL for ethers.JsonRpcProvider.
 * Host-only values (e.g. polygon-rpc.com) get https:// prepended.
 * @param {string} raw
 * @returns {string}
 */
function normalizeRpcUrl(raw) {
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return trimmed;
  }
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  return hasScheme ? trimmed : `https://${trimmed}`;
}

/**
 * @param {string} url
 * @returns {string|null} error message or null if ok
 */
function validateRpcUrlShape(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `CAPY_RPC_URL must use http:// or https:// (got ${parsed.protocol})`;
    }
    return null;
  } catch {
    return 'CAPY_RPC_URL must be a valid URL (e.g. https://polygon-rpc.com)';
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} key
 * @returns {string}
 */
function parseDailyRateHuman(env, key) {
  return String(env[key]).trim();
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ address: string, privateKey: string }|null}
 */
function buildDeployer(env) {
  const address = readEnvString(env, 'DEPLOYER_ADDRESS');
  const privateKeyRaw = readEnvString(env, 'DEPLOYER_PRIVATE_KEY');
  if (!address && !privateKeyRaw) {
    return null;
  }
  return {
    address,
    privateKey: privateKeyRaw ? normalizePrivateKey(privateKeyRaw) : '',
  };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} key
 * @returns {string}
 */
function readTrimmedEnv(env, key) {
  const raw = env?.[key];
  if (raw === undefined || raw === null) {
    return '';
  }
  return String(raw).trim();
}

/**
 * Human explorer base URL (Q1=A). NETWORK_SCANNER wins; empty SCANNER is not a second SSOT.
 * Does not prepend a scheme. Both empty → null.
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null}
 */
function resolveNetworkScanner(env) {
  const primary = readTrimmedEnv(env, 'NETWORK_SCANNER');
  const alias = readTrimmedEnv(env, 'SCANNER');
  const chosen = primary || alias;
  return chosen ? chosen : null;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {'NETWORK_SCANNER'|'SCANNER'|null}
 */
function networkScannerSourceKey(env) {
  if (readTrimmedEnv(env, 'NETWORK_SCANNER')) {
    return 'NETWORK_SCANNER';
  }
  if (readTrimmedEnv(env, 'SCANNER')) {
    return 'SCANNER';
  }
  return null;
}

/**
 * @param {string} url
 * @returns {string|null} error fragment or null if ok
 */
function validateNetworkScannerShape(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `must use http:// or https:// (got ${parsed.protocol})`;
    }
    return null;
  } catch {
    return 'must be a valid http(s) URL';
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {object}
 */
function buildConfigFromEnv(env) {
  return {
    mode: resolveCapyMode(env),
    polygonscanApiKey: resolvePolygonscanApiKey(env),
    polygonscanApiBase: resolvePolygonscanApiBase(env),
    polygonscanChainId: resolvePolygonscanChainId(env),
    networkScanner: resolveNetworkScanner(env),
    rpc: {
      url: normalizeRpcUrl(env.CAPY_RPC_URL),
    },
    chainId: Number(env.CAPY_CHAIN_ID),
    token: {
      address: readEnvString(env, 'CAPY_TOKEN_ADDRESS'),
    },
    deployer: buildDeployer(env),
    parent: {
      address: String(env.PARENT_ADDRESS).trim(),
      privateKey: normalizePrivateKey(env.PARENT_PRIVATE_KEY),
    },
    dailyRates: {
      tristan: parseDailyRateHuman(env, 'CAPY_DAILY_TRISTAN'),
      bastian: parseDailyRateHuman(env, 'CAPY_DAILY_BASTIAN'),
    },
    tristan: {
      address: String(env.TRISTAN_ADDRESS).trim(),
      privateKey: normalizePrivateKey(env.TRISTAN_PRIVATE_KEY),
    },
    bastian: {
      address: String(env.BASTIAN_ADDRESS).trim(),
      privateKey: normalizePrivateKey(env.BASTIAN_PRIVATE_KEY),
    },
  };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ exitOnError?: boolean }} [options]
 * @returns {object}
 */
function loadAndValidateConfig(env, options = {}) {
  const { exitOnError = true } = options;
  const errors = validateCapybaraEnv(env);
  if (errors.length > 0) {
    console.error('❌ Capybara configuration validation failed:');
    errors.forEach((error) => console.error(`  - ${error}`));
    if (exitOnError) {
      process.exit(1);
    }
    throw new Error(errors.join('; '));
  }
  return buildConfigFromEnv(env);
}

module.exports = {
  REQUIRED_KEYS,
  DAILY_RATE_KEYS,
  ALLOWED_CAPY_MODES,
  resolveCapyMode,
  resolvePolygonscanApiKey,
  resolvePolygonscanApiBase,
  resolvePolygonscanChainId,
  DEFAULT_POLYGONSCAN_API_BASE,
  DEFAULT_POLYGONSCAN_CHAIN_ID,
  isValidPolygonscanApiKeyShape,
  validateCapybaraEnv,
  resolveNetworkScanner,
  buildConfigFromEnv,
  loadAndValidateConfig,
  resolveConfiguredAction,
  keysRequiredForEnv,
  normalizePrivateKey,
  normalizeRpcUrl,
  validateRpcUrlShape,
  parseDailyRateHuman,
};
