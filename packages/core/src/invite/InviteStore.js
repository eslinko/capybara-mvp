'use strict';

const { normalizeAddress, requireId } = require('../membership/normalize');
const { assertRole } = require('../membership/roles');
const { inviteError } = require('./errors');

/**
 * In-memory Invite store (no invent DDL / no persistence).
 * Fields locked: from, to, role (frozen), familyId; optional displayName / fromMembershipId.
 * Status: open | accepted (accepted used by INV-02; INV-01 creates open only).
 */
class InviteStore {
  constructor() {
    /** @type {Map<string, {
     *   id: string,
     *   from: string,
     *   to: string,
     *   role: 'parent' | 'child',
     *   familyId: string,
     *   status: 'open' | 'accepted',
     *   displayName?: string,
     *   fromMembershipId?: string
     * }>} */
    this._invites = new Map();
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
   * @returns {object}
   */
  addInvite(input) {
    const id = requireId(input?.id, 'inviteId');
    if (this._invites.has(id)) {
      throw inviteError('EINVITE_EXISTS', `Invite already exists: ${id}`);
    }

    const familyId = requireId(input?.familyId, 'familyId');
    const role = assertRole(input?.role);
    const from = normalizeAddress(input?.from);

    if (typeof input?.to !== 'string' || !input.to.trim()) {
      throw inviteError('EINVITE_EMPTY_TO', 'Invite `to` address is required');
    }
    const to = normalizeAddress(input.to);

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
    const row = {
      id,
      from,
      to,
      role,
      familyId,
      status: 'open',
    };

    if (typeof input.displayName === 'string' && input.displayName.trim()) {
      row.displayName = input.displayName.trim();
    }
    if (typeof input.fromMembershipId === 'string' && input.fromMembershipId.trim()) {
      row.fromMembershipId = input.fromMembershipId.trim();
    }

    this._invites.set(id, row);
    return { ...row };
  }

  /**
   * @param {string} inviteId
   * @returns {object | null}
   */
  getInvite(inviteId) {
    const row = this._invites.get(requireId(inviteId, 'inviteId'));
    return row ? { ...row } : null;
  }

  /**
   * @param {string} toAddress
   * @returns {object[]}
   */
  listByTo(toAddress) {
    const to = normalizeAddress(toAddress);
    return [...this._invites.values()]
      .filter((r) => r.to === to)
      .map((r) => ({ ...r }));
  }

  /**
   * @param {string} familyId
   * @param {'open'|'accepted'=} status
   * @returns {object[]}
   */
  listByFamily(familyId, status) {
    const fid = requireId(familyId, 'familyId');
    return [...this._invites.values()]
      .filter((r) => r.familyId === fid && (status ? r.status === status : true))
      .map((r) => ({ ...r }));
  }

  /**
   * Open invites for `to` in family (conflict helper).
   *
   * @param {string} familyId
   * @param {string} toAddress
   * @returns {object[]}
   */
  listOpenByToInFamily(familyId, toAddress) {
    const fid = requireId(familyId, 'familyId');
    const to = normalizeAddress(toAddress);
    return [...this._invites.values()]
      .filter((r) => r.familyId === fid && r.to === to && r.status === 'open')
      .map((r) => ({ ...r }));
  }

  /**
   * Mark accepted (INV-02 prep). Role stays frozen.
   *
   * @param {string} inviteId
   * @returns {object}
   */
  markAccepted(inviteId) {
    const id = requireId(inviteId, 'inviteId');
    const row = this._invites.get(id);
    if (!row) {
      throw inviteError('EINVITE_UNKNOWN', `Unknown inviteId: ${id}`);
    }
    row.status = 'accepted';
    this._invites.set(id, row);
    return { ...row };
  }

  /**
   * Intentional absence of role mutation (AC-M07).
   * @returns {never}
   */
  changeRole() {
    throw inviteError(
      'EINVITE_ROLE_IMMUTABLE',
      'Invite role is frozen at create (AC-M07); no mutation API',
    );
  }

  /**
   * @returns {never}
   */
  setRole() {
    return this.changeRole();
  }
}

module.exports = InviteStore;
