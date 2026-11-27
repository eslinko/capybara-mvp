'use strict';

const crypto = require('crypto');

/**
 * Postgres-backed verified AddressProof store → `verified_address_proofs`.
 * Soft≠Live: adapter Present ≠ invent REQ-12 Done / Live Pass (→ PGDUR-05).
 *
 * Methods async (supabase-js); callers must await.
 */

/**
 * @param {object | null | undefined} row
 * @returns {object | null}
 */
function mapRow(row) {
  if (!row) return null;
  /** @type {{
   *   id: string,
   *   address: string,
   *   challengeId: string,
   *   verifiedAt: string,
   *   verifiedAtMs: number,
   *   familyId?: string
   * }} */
  const out = {
    id: row.id,
    address: row.address,
    challengeId: row.challenge_id,
    verifiedAt:
      typeof row.verified_at === 'string'
        ? row.verified_at
        : new Date(row.verified_at).toISOString(),
    verifiedAtMs: Number(row.verified_at_ms),
  };
  if (typeof row.family_id === 'string' && row.family_id) {
    out.familyId = row.family_id;
  }
  return out;
}

class PostgresVerifiedAddressProofStore {
  /**
   * @param {{ client: { from: Function } }} opts
   */
  constructor(opts) {
    if (!opts || typeof opts.client?.from !== 'function') {
      const err = new Error(
        'PostgresVerifiedAddressProofStore requires supabase-js client',
      );
      err.code = 'EPROOF_CLIENT_REQUIRED';
      throw err;
    }
    this._client = opts.client;
    /** @type {'postgres-verified-proof'} */
    this.kind = 'postgres-verified-proof';
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
   * @returns {Promise<object>}
   */
  async addVerifiedProof(input) {
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

    /** @type {Record<string, unknown>} */
    const row = {
      id,
      address: input.address.trim(),
      challenge_id: input.challengeId.trim(),
      verified_at: input.verifiedAt.trim(),
      verified_at_ms: input.verifiedAtMs,
    };
    // family_id optional / null when membership unknown (AC optional familyId)
    if (typeof input.familyId === 'string' && input.familyId.trim()) {
      row.family_id = input.familyId.trim();
    } else {
      row.family_id = null;
    }

    const { data, error } = await this._client
      .from('verified_address_proofs')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      const err = new Error(error.message || 'verified_address_proofs insert failed');
      err.code = 'EPROOF_PERSIST_FAILED';
      throw err;
    }
    return mapRow(data);
  }

  /**
   * @param {string} id
   * @returns {Promise<object | null>}
   */
  async getById(id) {
    const { data, error } = await this._client
      .from('verified_address_proofs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      const err = new Error(error.message || 'verified_address_proofs get failed');
      err.code = 'EPROOF_READ_FAILED';
      throw err;
    }
    return mapRow(data);
  }

  /**
   * @param {string} challengeId
   * @returns {Promise<object[]>}
   */
  async listByChallengeId(challengeId) {
    const { data, error } = await this._client
      .from('verified_address_proofs')
      .select('*')
      .eq('challenge_id', challengeId);
    if (error) {
      const err = new Error(error.message || 'verified_address_proofs list failed');
      err.code = 'EPROOF_READ_FAILED';
      throw err;
    }
    return (data || []).map(mapRow).filter(Boolean);
  }
}

module.exports = {
  PostgresVerifiedAddressProofStore,
};
