'use strict';

/**
 * EIP-1193 `personal_sign` data encoding (arch-01 C1–C2).
 * UTF-8 bytes of exact challenge.message → 0x-hex. No keccak on page.
 */

const { ethers } = require('ethers');

/**
 * @param {string} message exact challenge.message (byte-identical; no trim)
 * @returns {string} 0x-hex for personal_sign params[0]
 */
function encodePersonalSignData(message) {
  if (typeof message !== 'string') {
    throw new TypeError('personal_sign message must be a string');
  }
  return ethers.hexlify(ethers.toUtf8Bytes(message));
}

/**
 * @param {string} message
 * @param {string} fromAddress connected account
 * @returns {[string, string]} params [data, address]
 */
function buildPersonalSignParams(message, fromAddress) {
  const data = encodePersonalSignData(message);
  const address = String(fromAddress || '').trim();
  if (!address) {
    throw new Error('personal_sign requires fromAddress');
  }
  return [data, address];
}

module.exports = {
  encodePersonalSignData,
  buildPersonalSignParams,
};
