'use strict';

const { normalizeAddress } = require('../membership/normalize');
const { requireAuthEnvClasses } = require('./loadAuthEnvConfig');
const { authError } = require('./errors');

/**
 * @typedef {{
 *   userId: string,
 *   address: string,
 *   linkedAt: string,
 *   linkedAtMs: number,
 *   created: boolean
 * }} SupabaseUserLink
 */

/**
 * After valid AddressProof → create/link Supabase Auth user → SupabaseUserLink.
 * Prepares `membership.userId` value (membership write may complete in AUTH-03).
 * Does not store login private keys.
 *
 * @param {{
 *   proof: import('./supabaseAuthPort').AddressProof,
 *   authPort: import('./supabaseAuthPort').SupabaseAuthPort,
 *   config: import('./loadAuthEnvConfig').AuthEnvConfig
 * }} input
 * @param {{ nowMs?: number }} [opts]
 * @returns {Promise<SupabaseUserLink>}
 */
async function bindAddressToAuthUser(input, opts = {}) {
  requireAuthEnvClasses(input?.config);
  const proof = input?.proof;
  const authPort = input?.authPort;
  if (!proof || typeof proof.address !== 'string') {
    throw authError('EAUTH_BAD_PAYLOAD', 'AddressProof required');
  }
  if (!authPort || typeof authPort.createOrLinkUser !== 'function') {
    throw authError('EAUTH_BAD_PAYLOAD', 'SupabaseAuthPort required');
  }

  const address = normalizeAddress(proof.address);
  let result;
  try {
    result = await authPort.createOrLinkUser({ ...proof, address });
  } catch (err) {
    if (err && err.code) throw err;
    throw authError('EAUTH_BIND_FAILED', `Auth bind failed: ${err?.message || err}`);
  }

  if (!result || typeof result.userId !== 'string' || !result.userId.trim()) {
    throw authError('EAUTH_BIND_FAILED', 'Auth port returned empty userId');
  }

  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  return {
    userId: result.userId.trim(),
    address,
    linkedAt: new Date(nowMs).toISOString(),
    linkedAtMs: nowMs,
    created: Boolean(result.created),
  };
}

module.exports = {
  bindAddressToAuthUser,
};
