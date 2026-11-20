'use strict';

const { ethers } = require('ethers');
const { normalizeAddress } = require('../membership/normalize');
const { authError } = require('./errors');

/**
 * @typedef {{
 *   address: string,
 *   challengeId: string,
 *   verifiedAt: string,
 *   verifiedAtMs: number
 * }} AddressProof
 */

/**
 * Verify SIWE-class signature over issued challenge → AddressProof.
 * Fail-closed on wrong signer / expired / replay / unknown id / bad signature.
 *
 * @param {import('./ChallengeStore').ChallengeStore} store
 * @param {string} challengeId
 * @param {string} signature
 * @param {{ nowMs?: number }} [opts]
 * @returns {AddressProof}
 */
function verifyAddressProof(store, challengeId, signature, opts = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.consume !== 'function') {
    throw authError('EAUTH_BAD_PAYLOAD', 'ChallengeStore required');
  }
  if (typeof challengeId !== 'string' || !challengeId.trim()) {
    throw authError('EAUTH_BAD_PAYLOAD', 'challengeId must be a non-empty string');
  }
  if (typeof signature !== 'string' || !signature.trim()) {
    throw authError('EAUTH_BAD_PAYLOAD', 'signature must be a non-empty string');
  }

  const challenge = store.get(challengeId);
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();

  if (nowMs > challenge.expiresAtMs) {
    throw authError('EAUTH_CHALLENGE_EXPIRED', `Challenge expired: ${challengeId}`);
  }

  let recovered;
  try {
    recovered = ethers.verifyMessage(challenge.message, signature.trim());
  } catch {
    throw authError('EAUTH_INVALID_SIGNATURE', 'Signature recovery failed');
  }

  let recoveredNorm;
  try {
    recoveredNorm = normalizeAddress(recovered);
  } catch {
    throw authError('EAUTH_INVALID_SIGNATURE', 'Recovered address invalid');
  }

  if (recoveredNorm !== challenge.address) {
    throw authError(
      'EAUTH_WRONG_SIGNER',
      `Wrong signer: expected ${challenge.address}, got ${recoveredNorm}`,
    );
  }

  store.consume(challengeId);

  return {
    address: challenge.address,
    challengeId,
    verifiedAt: new Date(nowMs).toISOString(),
    verifiedAtMs: nowMs,
  };
}

module.exports = {
  verifyAddressProof,
};
