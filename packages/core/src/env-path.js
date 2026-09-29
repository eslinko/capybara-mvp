'use strict';

/**
 * Canonical paths for Capybara package root (env + logs).
 * Transition: if capybara/.env missing, fall back to scripts/capybara.env.
 */
const fs = require('fs');
const path = require('path');

// packages/core/src → packages/core → packages → capybara/
const CAPYBARA_ROOT = path.join(__dirname, '..', '..', '..');

const defaultEnvPath = path.join(CAPYBARA_ROOT, '.env');
const legacyEnvPath = path.join(CAPYBARA_ROOT, '..', 'scripts', 'capybara.env');

function resolveDotenvPath() {
  if (process.env.CAPYBARA_ENV_PATH && String(process.env.CAPYBARA_ENV_PATH).trim()) {
    return path.resolve(String(process.env.CAPYBARA_ENV_PATH).trim());
  }
  if (fs.existsSync(defaultEnvPath)) {
    return defaultEnvPath;
  }
  if (fs.existsSync(legacyEnvPath)) {
    return legacyEnvPath;
  }
  return defaultEnvPath;
}

const CAPYBARA_DOTENV_PATH = resolveDotenvPath();

module.exports = { CAPYBARA_ROOT, CAPYBARA_DOTENV_PATH };
