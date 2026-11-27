'use strict';

const crypto = require('crypto');

/**
 * In-memory verified AddressProof store (unit inject Soft≠Live).
 * Same method surface as PostgresVerifiedAddressProofStore.
 * Soft≠Live: memory ≠ invent Live Pass / REQ-12 Done.
 */
class VerifiedAddressProofStore {
  constructor() {
    /** @type {Map<string, object>} */
    this._byId = new Map();
    /** @type {'memory-verified-proof'} */
    this.kind = 'memory-verified-proof';
  }

  /**
   * @param {{
   *   id?: string,
   *   address: string,
   *   challengeId: string,
   *   verifiedAt: string,
   *   verifiedAtMs: number,
   *   familyId?: string | null
   * }} input
   * @returns {object}
   */
  addVerifiedProof(input) {
    if (!input || typeof input.address !== 'string' || !input.address.trim()) {
      const err = new Error('address required');
      err.code = 'EPROOF_BAD_PAYLOAD';
      throw err;
    }
    if (typeof input.challengeId !== 'string' || !input.challengeId.trim()) {
      const err = new Error('challengeId required');
      err.code = 'EPROOF_BAD_PAYLOAD';
      throw err;
    }
    if (typeof input.verifiedAt !== 'string' || !input.verifiedAt.trim()) {
      const err = new Error('verifiedAt required');
      err.code = 'EPROOF_BAD_PAYLOAD';
      throw err;
    }
    if (!Number.isFinite(input.verifiedAtMs)) {
      const err = new Error('verifiedAtMs required');
      err.code = 'EPROOF_BAD_PAYLOAD';
      throw err;
    }

    const id =
      typeof input.id === 'string' && input.id.trim()
        ? input.id.trim()
        : `vap-${crypto.randomBytes(8).toString('hex')}`;

    /** @type {{
     *   id: string,
     *   address: string,
     *   challengeId: string,
     *   verifiedAt: string,
     *   verifiedAtMs: number,
     *   familyId?: string
     * }} */
    const row = {
      id,
      address: input.address.trim(),
      challengeId: input.challengeId.trim(),
      verifiedAt: input.verifiedAt.trim(),
      verifiedAtMs: input.verifiedAtMs,
    };
    if (typeof input.familyId === 'string' && input.familyId.trim()) {
      row.familyId = input.familyId.trim();
    }
    // familyId null/undefined/empty → omit (optional; pre-membership)

    this._byId.set(id, row);
    return { ...row };
  }

  /**
   * @param {string} id
   * @returns {object | null}
   */
  getById(id) {
    const row = this._byId.get(id);
    return row ? { ...row } : null;
  }

  /**
   * @param {string} challengeId
   * @returns {object[]}
   */
  listByChallengeId(challengeId) {
    return [...this._byId.values()]
      .filter((r) => r.challengeId === challengeId)
      .map((r) => ({ ...r }));
  }

  /**
   * @returns {object[]}
   */
  listAll() {
    return [...this._byId.values()].map((r) => ({ ...r }));
  }
}

module.exports = {
  VerifiedAddressProofStore,
};
