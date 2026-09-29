'use strict';

const { CAPYBARA_DOTENV_PATH } = require('../env-path');
const {
  REQUIRED_KEYS,
  validateCapybaraEnv,
  buildConfigFromEnv,
  loadAndValidateConfig,
} = require('./build');

if (process.env.CAPYBARA_LAZY_CONFIG !== '1') {
  require('dotenv').config({ path: CAPYBARA_DOTENV_PATH });
}

/** @type {object|null} */
let config = null;

if (process.env.CAPYBARA_LAZY_CONFIG !== '1') {
  config = loadAndValidateConfig(process.env);
}

/**
 * @param {string} path
 * @returns {*}
 */
function get(path) {
  if (!config) {
    throw new Error('Capybara config not loaded. Set CAPYBARA_LAZY_CONFIG=1 and call reloadConfig().');
  }
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), config);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {object}
 */
function reloadConfig(env = process.env) {
  config = loadAndValidateConfig(env);
  return config;
}

module.exports = {
  get config() {
    return config;
  },
  get,
  reloadConfig,
  REQUIRED_KEYS,
  validateCapybaraEnv,
  buildConfigFromEnv,
  loadAndValidateConfig,
  CAPYBARA_DOTENV_PATH,
};
