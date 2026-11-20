'use strict';

/**
 * @typedef {
 *   'EAUTH_UNKNOWN_CHALLENGE'
 * | 'EAUTH_CHALLENGE_EXPIRED'
 * | 'EAUTH_CHALLENGE_REPLAY'
 * | 'EAUTH_WRONG_SIGNER'
 * | 'EAUTH_INVALID_SIGNATURE'
 * | 'EAUTH_BAD_PAYLOAD'
 * | 'EAUTH_ENV_MISSING'
 * | 'EAUTH_SESSION_INVALID'
 * | 'EAUTH_SESSION_EXPIRED'
 * | 'EAUTH_SESSION_MISSING'
 * | 'EAUTH_BIND_FAILED'
 * } AuthErrorCode
 */

/**
 * @param {AuthErrorCode} code
 * @param {string} message
 * @returns {Error & { code: AuthErrorCode }}
 */
function authError(code, message) {
  const err = new Error(message);
  err.code = code;
  return /** @type {Error & { code: AuthErrorCode }} */ (err);
}

module.exports = {
  authError,
};
