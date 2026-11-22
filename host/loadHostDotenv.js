'use strict';

/**
 * Host entry dotenv loader (EDGE-05).
 * Reuses CLI path SSOT `CAPYBARA_DOTENV_PATH` + dotenv.
 * Never overwrites keys already set on the target env (platform / Railway win).
 * Missing file → silent continue (no throw, no secret dump).
 */

const fs = require('fs');
const dotenv = require('dotenv');
const { CAPYBARA_DOTENV_PATH } = require('../packages/core/src/env-path');

/**
 * Load package `.env` into `env` (default `process.env`) before host `main()`.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @param {{ dotenvPath?: string }} [opts]
 * @returns {{ loaded: boolean, path: string, error?: Error }}
 */
function loadHostDotenv(env = process.env, opts = {}) {
  const dotenvPath =
    opts.dotenvPath && String(opts.dotenvPath).trim()
      ? String(opts.dotenvPath).trim()
      : CAPYBARA_DOTENV_PATH;

  if (!fs.existsSync(dotenvPath)) {
    return { loaded: false, path: dotenvPath };
  }

  const result = dotenv.config({
    path: dotenvPath,
    processEnv: env,
    override: false,
  });

  if (result && result.error) {
    return { loaded: false, path: dotenvPath, error: result.error };
  }

  return { loaded: true, path: dotenvPath };
}

module.exports = {
  loadHostDotenv,
  CAPYBARA_DOTENV_PATH,
};
