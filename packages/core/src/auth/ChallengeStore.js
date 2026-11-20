'use strict';

const { authError } = require('./errors');

/**
 * In-memory AuthChallenge store: nonce + address + expiry; single-use consume.
 * Host-agnostic — no HTTP / Supabase / Railway.
 *
 * @typedef {{
 *   id: string,
 *   address: string,
 *   nonce: string,
 *   message: string,
 *   issuedAt: string,
 *   expiresAt: string,
 *   expiresAtMs: number
 * }} AuthChallengeRecord
 */
class ChallengeStore {
  constructor() {
    /** @type {Map<string, AuthChallengeRecord>} */
    this._pending = new Map();
    /** @type {Set<string>} */
    this._consumed = new Set();
  }

  /**
   * @param {AuthChallengeRecord} challenge
   * @returns {AuthChallengeRecord}
   */
  put(challenge) {
    if (!challenge || typeof challenge.id !== 'string' || !challenge.id) {
      throw authError('EAUTH_BAD_PAYLOAD', 'Challenge id required');
    }
    this._pending.set(challenge.id, { ...challenge });
    this._consumed.delete(challenge.id);
    return { ...challenge };
  }

  /**
   * Peek pending challenge without consuming.
   * @param {string} id
   * @returns {AuthChallengeRecord}
   */
  get(id) {
    if (this._consumed.has(id)) {
      throw authError('EAUTH_CHALLENGE_REPLAY', `Challenge already consumed: ${id}`);
    }
    const row = this._pending.get(id);
    if (!row) {
      throw authError('EAUTH_UNKNOWN_CHALLENGE', `Unknown challenge id: ${id}`);
    }
    return { ...row };
  }

  /**
   * Single-use consume — removes from pending, marks consumed.
   * @param {string} id
   * @returns {AuthChallengeRecord}
   */
  consume(id) {
    if (this._consumed.has(id)) {
      throw authError('EAUTH_CHALLENGE_REPLAY', `Challenge already consumed: ${id}`);
    }
    const row = this._pending.get(id);
    if (!row) {
      throw authError('EAUTH_UNKNOWN_CHALLENGE', `Unknown challenge id: ${id}`);
    }
    this._pending.delete(id);
    this._consumed.add(id);
    return { ...row };
  }

  /** @returns {number} */
  pendingCount() {
    return this._pending.size;
  }
}

module.exports = {
  ChallengeStore,
};
