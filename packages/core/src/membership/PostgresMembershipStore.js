'use strict';

const { assertRole, ROLES } = require('./roles');
const { normalizeAddress, requireId } = require('./normalize');

/**
 * Postgres-backed Membership store — same method surface as MembershipStore.
 * Tables: public.families · public.memberships (PGDUR-01).
 * Soft≠Live: adapter Present ≠ invent REQ-12 Done / Live Pass.
 *
 * Methods are async (supabase-js); callers must `await Promise.resolve(...)`.
 */

/**
 * @param {object | null | undefined} row
 * @returns {object | null}
 */
function mapFamily(row) {
  if (!row) return null;
  /** @type {{ id: string, label?: string, poolAddress?: string, bootstrapped?: boolean }} */
  const out = { id: row.id };
  if (typeof row.label === 'string' && row.label) out.label = row.label;
  if (typeof row.pool_address === 'string' && row.pool_address) {
    out.poolAddress = row.pool_address;
  }
  out.bootstrapped = Boolean(row.bootstrapped);
  return out;
}

/**
 * @param {object | null | undefined} row
 * @returns {object | null}
 */
function mapMembership(row) {
  if (!row) return null;
  /** @type {{
   *   id: string,
   *   familyId: string,
   *   role: 'parent' | 'child',
   *   address: string,
   *   userId?: string
   * }} */
  const out = {
    id: row.id,
    familyId: row.family_id,
    role: row.role,
    address: row.address,
  };
  if (typeof row.user_id === 'string' && row.user_id) out.userId = row.user_id;
  return out;
}

/**
 * @param {{ message?: string, code?: string, details?: string } | null} error
 * @param {string} fallbackCode
 * @param {string} fallbackMsg
 * @returns {never}
 */
function throwFromSupabase(error, fallbackCode, fallbackMsg) {
  const msg = (error && error.message) || fallbackMsg;
  const err = new Error(msg);
  const raw = String((error && (error.code || error.details)) || '');
  if (raw.includes('23505') || /duplicate|unique/i.test(msg)) {
    err.code = fallbackCode;
  } else {
    err.code = fallbackCode;
  }
  throw err;
}

class PostgresMembershipStore {
  /**
   * @param {{ client: { from: Function } }} opts
   */
  constructor(opts) {
    if (!opts || typeof opts.client?.from !== 'function') {
      const err = new Error('PostgresMembershipStore requires supabase-js client');
      err.code = 'EMEMBERSHIP_CLIENT_REQUIRED';
      throw err;
    }
    this._client = opts.client;
    /** @type {'postgres-membership'} */
    this.kind = 'postgres-membership';
  }

  /**
   * @param {{ id: string, label?: string }} input
   */
  async createFamily(input) {
    const id = requireId(input?.id, 'familyId');
    const existing = await this.getFamily(id);
    if (existing) {
      const err = new Error(`Family already exists: ${id}`);
      err.code = 'EMEMBERSHIP_FAMILY_EXISTS';
      throw err;
    }
    /** @type {Record<string, unknown>} */
    const row = { id, bootstrapped: false };
    if (typeof input.label === 'string' && input.label.trim()) {
      row.label = input.label.trim();
    }
    const { data, error } = await this._client
      .from('families')
      .insert(row)
      .select('*')
      .single();
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_FAMILY_EXISTS', error.message);
    return mapFamily(data);
  }

  /**
   * @param {string} familyId
   */
  async getFamily(familyId) {
    const id = requireId(familyId, 'familyId');
    const { data, error } = await this._client
      .from('families')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_LOOKUP', error.message);
    return mapFamily(data);
  }

  async listFamilies() {
    const { data, error } = await this._client.from('families').select('*');
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_LOOKUP', error.message);
    return (data || []).map(mapFamily);
  }

  /**
   * @param {string} familyId
   * @param {string} poolAddress
   */
  async setPoolIdentity(familyId, poolAddress) {
    const id = requireId(familyId, 'familyId');
    const family = await this.getFamily(id);
    if (!family) {
      const err = new Error(`Unknown familyId: ${id}`);
      err.code = 'EMEMBERSHIP_UNKNOWN_FAMILY';
      throw err;
    }
    const pool = normalizeAddress(poolAddress);
    const { data, error } = await this._client
      .from('families')
      .update({ pool_address: pool })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_UPDATE', error.message);
    return mapFamily(data);
  }

  /**
   * @param {string} familyId
   */
  async isBootstrapped(familyId) {
    const family = await this.getFamily(familyId);
    return Boolean(family && family.bootstrapped);
  }

  /**
   * @param {string} familyId
   */
  async markBootstrapped(familyId) {
    const id = requireId(familyId, 'familyId');
    const family = await this.getFamily(id);
    if (!family) {
      const err = new Error(`Unknown familyId: ${id}`);
      err.code = 'EMEMBERSHIP_UNKNOWN_FAMILY';
      throw err;
    }
    const { data, error } = await this._client
      .from('families')
      .update({ bootstrapped: true })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_UPDATE', error.message);
    return mapFamily(data);
  }

  /**
   * @param {{
   *   id: string,
   *   familyId: string,
   *   role: string,
   *   address: string,
   *   userId?: string
   * }} input
   */
  async addMembership(input) {
    const id = requireId(input?.id, 'membershipId');
    const familyId = requireId(input?.familyId, 'familyId');
    const role = assertRole(input?.role);
    const address = normalizeAddress(input?.address);

    const existing = await this.getMembership(id);
    if (existing) {
      const err = new Error(`Membership already exists: ${id}`);
      err.code = 'EMEMBERSHIP_EXISTS';
      throw err;
    }
    const family = await this.getFamily(familyId);
    if (!family) {
      const err = new Error(`Unknown familyId: ${familyId}`);
      err.code = 'EMEMBERSHIP_UNKNOWN_FAMILY';
      throw err;
    }

    const existingRole = await this.getRoleForAddress(address);
    if (existingRole && existingRole !== role) {
      const err = new Error(
        `Address ${address} already bound to role "${existingRole}"; cannot assign "${role}"`,
      );
      err.code = 'EMEMBERSHIP_ADDRESS_ROLE_CONFLICT';
      throw err;
    }

    /** @type {Record<string, unknown>} */
    const row = { id, family_id: familyId, role, address };
    if (typeof input.userId === 'string' && input.userId.trim()) {
      row.user_id = input.userId.trim();
    }

    const { data, error } = await this._client
      .from('memberships')
      .insert(row)
      .select('*')
      .single();
    if (error) {
      if (/unique|duplicate|23505/i.test(String(error.message || error.code || ''))) {
        const err = new Error(error.message || `Membership conflict for ${address}`);
        err.code = 'EMEMBERSHIP_ADDRESS_ROLE_CONFLICT';
        throw err;
      }
      throwFromSupabase(error, 'EMEMBERSHIP_EXISTS', error.message);
    }
    return mapMembership(data);
  }

  /**
   * @param {string} membershipId
   */
  async getMembership(membershipId) {
    const id = requireId(membershipId, 'membershipId');
    const { data, error } = await this._client
      .from('memberships')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_LOOKUP', error.message);
    return mapMembership(data);
  }

  /**
   * @param {string} familyId
   */
  async listMembershipsByFamily(familyId) {
    const fid = requireId(familyId, 'familyId');
    const { data, error } = await this._client
      .from('memberships')
      .select('*')
      .eq('family_id', fid);
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_LOOKUP', error.message);
    return (data || []).map(mapMembership);
  }

  /**
   * @param {string} userId
   */
  async listMembershipsByUserId(userId) {
    const uid = requireId(userId, 'userId');
    const { data, error } = await this._client
      .from('memberships')
      .select('*')
      .eq('user_id', uid);
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_LOOKUP', error.message);
    return (data || []).map(mapMembership);
  }

  /**
   * @param {string} address
   */
  async listMembershipsByAddress(address) {
    const addr = normalizeAddress(address);
    const { data, error } = await this._client
      .from('memberships')
      .select('*')
      .eq('address', addr);
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_LOOKUP', error.message);
    return (data || []).map(mapMembership);
  }

  /**
   * @param {string} membershipId
   * @param {string} userId
   */
  async bindUserId(membershipId, userId) {
    const id = requireId(membershipId, 'membershipId');
    const uid = requireId(userId, 'userId');
    const row = await this.getMembership(id);
    if (!row) {
      const err = new Error(`Unknown membershipId: ${id}`);
      err.code = 'EMEMBERSHIP_UNKNOWN';
      throw err;
    }
    if (row.userId && row.userId !== uid) {
      const err = new Error(
        `Membership ${id} already bound to userId "${row.userId}"; cannot bind "${uid}"`,
      );
      err.code = 'EMEMBERSHIP_USERID_CONFLICT';
      throw err;
    }
    const { data, error } = await this._client
      .from('memberships')
      .update({ user_id: uid })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throwFromSupabase(error, 'EMEMBERSHIP_UPDATE', error.message);
    return mapMembership(data);
  }

  /**
   * @param {string} address
   * @returns {Promise<'parent' | 'child' | null>}
   */
  async getRoleForAddress(address) {
    const list = await this.listMembershipsByAddress(address);
    if (list.length === 0) return null;
    return list[0].role;
  }

  changeRole() {
    const err = new Error(
      'Role change is not supported (AC-R08). Capability absent.',
    );
    err.code = 'EMEMBERSHIP_ROLE_IMMUTABLE';
    throw err;
  }

  setRole() {
    return this.changeRole();
  }

  static get ROLES() {
    return ROLES;
  }
}

module.exports = PostgresMembershipStore;
