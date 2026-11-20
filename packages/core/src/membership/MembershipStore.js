'use strict';

const { assertRole, ROLES } = require('./roles');
const { normalizeAddress, requireId } = require('./normalize');

/**
 * In-memory Family + Membership store (no Supabase / no persistence).
 * Persistence format Unknown → REQ-04.
 *
 * Invariants (REQ / AC-R01, R02, R06, R07, R08):
 * - role ∈ {parent, child}
 * - address → one role globally
 * - role immutable (no change-role API)
 * - multi-family memberships for same userId
 * - ≥2 parent + ≥2 child without hardcoded display names in the model
 */
class MembershipStore {
  constructor() {
    /** @type {Map<string, {
     *   id: string,
     *   label?: string,
     *   poolAddress?: string,
     *   bootstrapped?: boolean
     * }>} */
    this._families = new Map();
    /** @type {Map<string, {
     *   id: string,
     *   familyId: string,
     *   role: 'parent' | 'child',
     *   address: string,
     *   userId?: string
     * }>} */
    this._memberships = new Map();
    /** @type {Map<string, 'parent' | 'child'>} */
    this._addressRole = new Map();
  }

  /**
   * @param {{ id: string, label?: string }} input
   * @returns {{ id: string, label?: string }}
   */
  createFamily(input) {
    const id = requireId(input?.id, 'familyId');
    if (this._families.has(id)) {
      const err = new Error(`Family already exists: ${id}`);
      err.code = 'EMEMBERSHIP_FAMILY_EXISTS';
      throw err;
    }
    const family = { id };
    if (typeof input.label === 'string' && input.label.trim()) {
      family.label = input.label.trim();
    }
    this._families.set(id, family);
    return { ...family };
  }

  /**
   * @param {string} familyId
   * @returns {{
   *   id: string,
   *   label?: string,
   *   poolAddress?: string,
   *   bootstrapped?: boolean
   * } | null}
   */
  getFamily(familyId) {
    const family = this._families.get(requireId(familyId, 'familyId'));
    return family ? { ...family } : null;
  }

  /**
   * @returns {{
   *   id: string,
   *   label?: string,
   *   poolAddress?: string,
   *   bootstrapped?: boolean
   * }[]}
   */
  listFamilies() {
    return [...this._families.values()].map((f) => ({ ...f }));
  }

  /**
   * Logical pool identity on family (AUTH-04) — in-memory only; no invent DDL.
   *
   * @param {string} familyId
   * @param {string} poolAddress
   * @returns {object}
   */
  setPoolIdentity(familyId, poolAddress) {
    const id = requireId(familyId, 'familyId');
    const family = this._families.get(id);
    if (!family) {
      const err = new Error(`Unknown familyId: ${id}`);
      err.code = 'EMEMBERSHIP_UNKNOWN_FAMILY';
      throw err;
    }
    family.poolAddress = normalizeAddress(poolAddress);
    this._families.set(id, family);
    return { ...family };
  }

  /**
   * @param {string} familyId
   * @returns {boolean}
   */
  isBootstrapped(familyId) {
    const family = this._families.get(requireId(familyId, 'familyId'));
    return Boolean(family && family.bootstrapped);
  }

  /**
   * Mark family as live-bootstrapped (second bootstrap must reject).
   *
   * @param {string} familyId
   * @returns {object}
   */
  markBootstrapped(familyId) {
    const id = requireId(familyId, 'familyId');
    const family = this._families.get(id);
    if (!family) {
      const err = new Error(`Unknown familyId: ${id}`);
      err.code = 'EMEMBERSHIP_UNKNOWN_FAMILY';
      throw err;
    }
    family.bootstrapped = true;
    this._families.set(id, family);
    return { ...family };
  }

  /**
   * @param {{
   *   id: string,
   *   familyId: string,
   *   role: string,
   *   address: string,
   *   userId?: string
   * }} input
   * @returns {{
   *   id: string,
   *   familyId: string,
   *   role: 'parent' | 'child',
   *   address: string,
   *   userId?: string
   * }}
   */
  addMembership(input) {
    const id = requireId(input?.id, 'membershipId');
    const familyId = requireId(input?.familyId, 'familyId');
    const role = assertRole(input?.role);
    const address = normalizeAddress(input?.address);

    if (this._memberships.has(id)) {
      const err = new Error(`Membership already exists: ${id}`);
      err.code = 'EMEMBERSHIP_EXISTS';
      throw err;
    }
    if (!this._families.has(familyId)) {
      const err = new Error(`Unknown familyId: ${familyId}`);
      err.code = 'EMEMBERSHIP_UNKNOWN_FAMILY';
      throw err;
    }

    const existingRole = this._addressRole.get(address);
    if (existingRole && existingRole !== role) {
      const err = new Error(
        `Address ${address} already bound to role "${existingRole}"; cannot assign "${role}"`
      );
      err.code = 'EMEMBERSHIP_ADDRESS_ROLE_CONFLICT';
      throw err;
    }

    /** @type {{
     *   id: string,
     *   familyId: string,
     *   role: 'parent' | 'child',
     *   address: string,
     *   userId?: string
     * }} */
    const membership = { id, familyId, role, address };
    if (typeof input.userId === 'string' && input.userId.trim()) {
      membership.userId = input.userId.trim();
    }

    this._memberships.set(id, membership);
    this._addressRole.set(address, role);
    return { ...membership };
  }

  /**
   * @param {string} membershipId
   * @returns {object | null}
   */
  getMembership(membershipId) {
    const m = this._memberships.get(requireId(membershipId, 'membershipId'));
    return m ? { ...m } : null;
  }

  /**
   * @param {string} familyId
   * @returns {object[]}
   */
  listMembershipsByFamily(familyId) {
    const fid = requireId(familyId, 'familyId');
    return [...this._memberships.values()]
      .filter((m) => m.familyId === fid)
      .map((m) => ({ ...m }));
  }

  /**
   * @param {string} userId
   * @returns {object[]}
   */
  listMembershipsByUserId(userId) {
    const uid = requireId(userId, 'userId');
    return [...this._memberships.values()]
      .filter((m) => m.userId === uid)
      .map((m) => ({ ...m }));
  }

  /**
   * @param {string} address
   * @returns {object[]}
   */
  listMembershipsByAddress(address) {
    const addr = normalizeAddress(address);
    return [...this._memberships.values()]
      .filter((m) => m.address === addr)
      .map((m) => ({ ...m }));
  }

  /**
   * Bind Supabase Auth userId onto an existing membership (AUTH-03 link path).
   * Role remains immutable; userId may be set once or confirmed identical.
   *
   * @param {string} membershipId
   * @param {string} userId
   * @returns {object}
   */
  bindUserId(membershipId, userId) {
    const id = requireId(membershipId, 'membershipId');
    const uid = requireId(userId, 'userId');
    const row = this._memberships.get(id);
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
    row.userId = uid;
    this._memberships.set(id, row);
    return { ...row };
  }

  /**
   * @param {string} address
   * @returns {'parent' | 'child' | null}
   */
  getRoleForAddress(address) {
    return this._addressRole.get(normalizeAddress(address)) ?? null;
  }

  /**
   * Intentional absence of role-change API (AC-R08).
   * Any attempt throws — capability does not exist.
   * @returns {never}
   */
  changeRole() {
    const err = new Error(
      'Role change is not supported (AC-R08). Capability absent.'
    );
    err.code = 'EMEMBERSHIP_ROLE_IMMUTABLE';
    throw err;
  }

  /**
   * Intentional absence of setRole / updateRole aliases (AC-R08).
   * @returns {never}
   */
  setRole() {
    return this.changeRole();
  }

  /**
   * @returns {typeof ROLES}
   */
  static get ROLES() {
    return ROLES;
  }
}

module.exports = MembershipStore;
