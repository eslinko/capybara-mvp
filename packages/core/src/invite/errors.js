'use strict';

/**
 * @typedef {
 *   'EINVITE_BAD_PAYLOAD'
 * | 'EINVITE_EMPTY_TO'
 * | 'EINVITE_INVALID_ROLE'
 * | 'EINVITE_UNKNOWN_FAMILY'
 * | 'EINVITE_NOT_BOOTSTRAPPED'
 * | 'EINVITE_ROLE_IMMUTABLE'
 * | 'EINVITE_ADDRESS_ROLE_CONFLICT'
 * | 'EINVITE_OPEN_CONFLICT'
 * | 'EINVITE_EXISTS'
 * | 'EINVITE_UNKNOWN'
 * | 'EINVITE_NOT_FOUND'
 * | 'EINVITE_AMBIGUOUS'
 * | 'EINVITE_PROOF_MISMATCH'
 * | 'EINVITE_ALREADY_ACCEPTED'
 * | 'EINVITE_PRE_ACCEPT_NO_CAPS'
 * } InviteErrorCode
 */

/**
 * @param {InviteErrorCode} code
 * @param {string} message
 * @returns {Error & { code: InviteErrorCode }}
 */
function inviteError(code, message) {
  const err = new Error(message);
  err.code = code;
  return /** @type {Error & { code: InviteErrorCode }} */ (err);
}

module.exports = {
  inviteError,
};
