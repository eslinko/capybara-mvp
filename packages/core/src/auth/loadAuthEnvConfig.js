'use strict';

const { authError } = require('./errors');

/**
 * Required AUTH-02 config **classes** (arch U1 — exact process.env names Unknown).
 * Host supplies resolved class values; do not treat helper key names as frozen public API.
 *
 * @typedef {{
 *   supabaseUrl: string,
 *   supabaseKey: string,
 *   bearerSecret: string
 * }} AuthEnvConfig
 */

/**
 * Fail-closed: every required class must be a non-empty string.
 *
 * @param {Partial<AuthEnvConfig> | null | undefined} classes
 * @returns {AuthEnvConfig}
 */
function requireAuthEnvClasses(classes) {
  const required = ['supabaseUrl', 'supabaseKey', 'bearerSecret'];
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of required) {
    const value = classes?.[/** @type {keyof AuthEnvConfig} */ (key)];
    if (typeof value !== 'string' || !value.trim()) {
      throw authError(
        'EAUTH_ENV_MISSING',
        `Missing required auth env class: ${key}`,
      );
    }
    out[key] = value.trim();
  }
  return /** @type {AuthEnvConfig} */ (out);
}

/**
 * Resolve classes from an env-like bag via injectable key map (names not frozen).
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{
 *   supabaseUrl: string,
 *   supabaseKey: string,
 *   bearerSecret: string
 * }} keyMap — host-chosen env key names for each class
 * @returns {AuthEnvConfig}
 */
function loadAuthEnvConfig(env, keyMap) {
  if (!keyMap || typeof keyMap !== 'object') {
    throw authError('EAUTH_ENV_MISSING', 'Auth env keyMap required (exact names Unknown)');
  }
  const classes = {
    supabaseUrl: env?.[keyMap.supabaseUrl],
    supabaseKey: env?.[keyMap.supabaseKey],
    bearerSecret: env?.[keyMap.bearerSecret],
  };
  return requireAuthEnvClasses(classes);
}

module.exports = {
  requireAuthEnvClasses,
  loadAuthEnvConfig,
};
