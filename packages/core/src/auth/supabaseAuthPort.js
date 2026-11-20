'use strict';

const crypto = require('crypto');
const { normalizeAddress } = require('../membership/normalize');
const { authError } = require('./errors');

/**
 * Supabase Auth port — create/link user after AddressProof.
 * Uses Supabase **Auth** semantics (not a custom users-table-as-Auth).
 *
 * @typedef {{
 *   address: string,
 *   challengeId: string,
 *   verifiedAt: string,
 *   verifiedAtMs: number
 * }} AddressProof
 *
 * @typedef {{
 *   userId: string,
 *   address: string,
 *   created: boolean
 * }} AuthUserLinkResult
 *
 * @typedef {{
 *   kind: string,
 *   residual: boolean,
 *   createOrLinkUser: (proof: AddressProof) => Promise<AuthUserLinkResult> | AuthUserLinkResult
 * }} SupabaseAuthPort
 */

/**
 * In-memory / sinon-friendly Auth double for unit tests (not live Supabase).
 * Live `@supabase/supabase-js` client = residual (see createLiveSupabaseAuthPortResidual).
 *
 * @param {{ userIdForAddress?: (address: string) => string }} [opts]
 * @returns {SupabaseAuthPort & { _users: Map<string, string>, _calls: AddressProof[] }}
 */
function createMemorySupabaseAuthDouble(opts = {}) {
  /** @type {Map<string, string>} */
  const users = new Map();
  /** @type {AddressProof[]} */
  const calls = [];

  const port = {
    kind: 'memory-double',
    /** Unit double is not a live residual substitute claim. */
    residual: false,
    /**
     * @param {AddressProof} proof
     * @returns {AuthUserLinkResult}
     */
    createOrLinkUser(proof) {
      if (!proof || typeof proof.address !== 'string') {
        throw authError('EAUTH_BAD_PAYLOAD', 'AddressProof required');
      }
      const address = normalizeAddress(proof.address);
      calls.push({ ...proof, address });
      const existing = users.get(address);
      if (existing) {
        return { userId: existing, address, created: false };
      }
      const userId =
        typeof opts.userIdForAddress === 'function'
          ? opts.userIdForAddress(address)
          : `auth-user-${crypto.randomBytes(8).toString('hex')}`;
      users.set(address, userId);
      return { userId, address, created: true };
    },
    _users: users,
    _calls: calls,
  };
  return port;
}

/**
 * Placeholder for live Supabase Auth client wiring.
 * Labeled **residual** — Phase 1–2 proof; not claimed Done by unit green.
 *
 * @returns {SupabaseAuthPort}
 */
function createLiveSupabaseAuthPortResidual() {
  return {
    kind: 'live-supabase-js',
    residual: true,
    createOrLinkUser() {
      throw authError(
        'EAUTH_BIND_FAILED',
        'Live Supabase Auth port is residual (Phase 1–2); use memory double in unit tests',
      );
    },
  };
}

module.exports = {
  createMemorySupabaseAuthDouble,
  createLiveSupabaseAuthPortResidual,
};
