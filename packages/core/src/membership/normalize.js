'use strict';

/**
 * @param {unknown} address
 * @returns {string}
 */
function normalizeAddress(address) {
  if (typeof address !== 'string' || !address.trim()) {
    const err = new Error('Membership address must be a non-empty string');
    err.code = 'EMEMBERSHIP_INVALID_ADDRESS';
    throw err;
  }
  return address.trim().toLowerCase();
}

/**
 * @param {unknown} id
 * @param {string} label
 * @returns {string}
 */
function requireId(id, label) {
  if (typeof id !== 'string' || !id.trim()) {
    const err = new Error(`${label} must be a non-empty string`);
    err.code = 'EMEMBERSHIP_INVALID_ID';
    throw err;
  }
  return id.trim();
}

module.exports = {
  normalizeAddress,
  requireId,
};
