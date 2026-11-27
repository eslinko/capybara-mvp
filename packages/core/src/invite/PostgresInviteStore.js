'use strict';

const { normalizeAddress, requireId } = require('../membership/normalize');
const { assertRole } = require('../membership/roles');
const { inviteError } = require('./errors');

/**
 * Postgres-backed Invite store — same method surface as InviteStore.
 * Table: public.invites (PGDUR-01). Soft≠Live ≠ invent REQ-12 Done.
 * Methods async (supabase-js); callers `await Promise.resolve(...)`.
 */

/**
 * @param {object | null | undefined} row
 * @returns {object | null}
 */
function mapInvite(row) {
  if (!row) return null;
  /** @type {{
   *   id: string,
   *   from: string,
   *   to: string,
   *   role: 'parent' | 'child',
   *   familyId: string,
   *   status: 'open' | 'accepted',
   *   displayName?: string,
   *   fromMembershipId?: string
   * }} */
  const out = {
    id: row.id,
    from: row.from,
    to: row.to,
    role: row.role,
    familyId: row.family_id,
    status: row.status,
  };
  if (typeof row.display_name === 'string' && row.display_name) {
    out.displayName = row.display_name;
  }
  if (typeof row.from_membership_id === 'string' && row.from_membership_id) {
    out.fromMembershipId = row.from_membership_id;
  }
  return out;
}

class PostgresInviteStore {
  /**
   * @param {{ client: { from: Function } }} opts
   */
  constructor(opts) {
    if (!opts || typeof opts.client?.from !== 'function') {
      throw inviteError(
        'EINVITE_BAD_PAYLOAD',
        'PostgresInviteStore requires supabase-js client',
      );
    }
    this._client = opts.client;
    /** @type {'postgres-invite'} */
    this.kind = 'postgres-invite';
  }

  /**
   * @param {{
   *   id: string,
   *   from: string,
   *   to: string,
   *   role: string,
   *   familyId: string,
   *   displayName?: string,
   *   fromMembershipId?: string
   * }} input
   */
  async addInvite(input) {
    const id = requireId(input?.id, 'inviteId');
    const existing = await this.getInvite(id);
    if (existing) {
      throw inviteError('EINVITE_EXISTS', `Invite already exists: ${id}`);
    }

    const familyId = requireId(input?.familyId, 'familyId');
    const role = assertRole(input?.role);
    const from = normalizeAddress(input?.from);

    if (typeof input?.to !== 'string' || !input.to.trim()) {
      throw inviteError('EINVITE_EMPTY_TO', 'Invite `to` address is required');
    }
    const to = normalizeAddress(input.to);

    /** @type {Record<string, unknown>} */
    const row = {
      id,
      from,
      to,
      role,
      family_id: familyId,
      status: 'open',
    };
    if (typeof input.displayName === 'string' && input.displayName.trim()) {
      row.display_name = input.displayName.trim();
    }
    if (typeof input.fromMembershipId === 'string' && input.fromMembershipId.trim()) {
      row.from_membership_id = input.fromMembershipId.trim();
    }

    const { data, error } = await this._client
      .from('invites')
      .insert(row)
      .select('*')
      .single();
    if (error) {
      throw inviteError('EINVITE_EXISTS', error.message || `Invite insert failed: ${id}`);
    }
    return mapInvite(data);
  }

  /**
   * @param {string} inviteId
   */
  async getInvite(inviteId) {
    const id = requireId(inviteId, 'inviteId');
    const { data, error } = await this._client
      .from('invites')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw inviteError('EINVITE_BAD_PAYLOAD', error.message || 'Invite lookup failed');
    }
    return mapInvite(data);
  }

  /**
   * @param {string} toAddress
   */
  async listByTo(toAddress) {
    const to = normalizeAddress(toAddress);
    const { data, error } = await this._client.from('invites').select('*').eq('to', to);
    if (error) {
      throw inviteError('EINVITE_BAD_PAYLOAD', error.message || 'Invite listByTo failed');
    }
    return (data || []).map(mapInvite);
  }

  /**
   * @param {string} familyId
   * @param {'open'|'accepted'=} status
   */
  async listByFamily(familyId, status) {
    const fid = requireId(familyId, 'familyId');
    let q = this._client.from('invites').select('*').eq('family_id', fid);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) {
      throw inviteError('EINVITE_BAD_PAYLOAD', error.message || 'Invite listByFamily failed');
    }
    return (data || []).map(mapInvite);
  }

  /**
   * @param {string} familyId
   * @param {string} toAddress
   */
  async listOpenByToInFamily(familyId, toAddress) {
    const fid = requireId(familyId, 'familyId');
    const to = normalizeAddress(toAddress);
    const { data, error } = await this._client
      .from('invites')
      .select('*')
      .eq('family_id', fid)
      .eq('to', to)
      .eq('status', 'open');
    if (error) {
      throw inviteError(
        'EINVITE_BAD_PAYLOAD',
        error.message || 'Invite listOpenByToInFamily failed',
      );
    }
    return (data || []).map(mapInvite);
  }

  /**
   * @param {string} inviteId
   */
  async markAccepted(inviteId) {
    const id = requireId(inviteId, 'inviteId');
    const row = await this.getInvite(id);
    if (!row) {
      throw inviteError('EINVITE_UNKNOWN', `Unknown inviteId: ${id}`);
    }
    const { data, error } = await this._client
      .from('invites')
      .update({ status: 'accepted' })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      throw inviteError('EINVITE_BAD_PAYLOAD', error.message || 'Invite markAccepted failed');
    }
    return mapInvite(data);
  }

  changeRole() {
    throw inviteError(
      'EINVITE_ROLE_IMMUTABLE',
      'Invite role is frozen at create (AC-M07); no mutation API',
    );
  }

  setRole() {
    return this.changeRole();
  }
}

module.exports = PostgresInviteStore;
