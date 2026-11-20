'use strict';

const { normalizeAddress, requireId } = require('../membership/normalize');
const { assertRole } = require('../membership/roles');
const { CAPABILITIES } = require('../roleGate/capabilities');
const { runWithRoleGate } = require('../roleGate/runWithRoleGate');
const { dualAuthGate } = require('../auth/dualAuthGate');
const { inviteError } = require('./errors');

let _inviteSeq = 0;

/**
 * @returns {string}
 */
function nextInviteId() {
  _inviteSeq += 1;
  return `inv-${_inviteSeq}-${Date.now()}`;
}

/**
 * Assert address↔role / open-invite conflicts before write (FR-M03 / ROLE).
 *
 * @param {{
 *   membershipStore: import('../membership/MembershipStore'),
 *   inviteStore: import('./InviteStore'),
 *   familyId: string,
 *   to: string,
 *   role: 'parent' | 'child'
 * }} input
 */
function assertNoAddressRoleConflict(input) {
  const { membershipStore, inviteStore, familyId, to, role } = input;
  const existingRole = membershipStore.getRoleForAddress(to);
  if (existingRole && existingRole !== role) {
    throw inviteError(
      'EINVITE_ADDRESS_ROLE_CONFLICT',
      `Address ${to} already bound to role "${existingRole}"; cannot invite as "${role}"`,
    );
  }

  const sameFamilyMemberships = membershipStore
    .listMembershipsByAddress(to)
    .filter((m) => m.familyId === familyId);
  if (sameFamilyMemberships.length > 0) {
    throw inviteError(
      'EINVITE_ADDRESS_ROLE_CONFLICT',
      `Address ${to} already has membership in family ${familyId}`,
    );
  }

  const open = inviteStore.listOpenByToInFamily(familyId, to);
  if (open.length > 0) {
    throw inviteError(
      'EINVITE_OPEN_CONFLICT',
      `Open invite already exists for ${to} in family ${familyId}`,
    );
  }
}

/**
 * createInvite — DualAuthGate **before** RoleGate `family.members_settings` + bootstrapped family.
 * Does **not** add `family.invite_member`. Role frozen at write (AC-M07).
 *
 * Wire order matches AUTH-03: DualAuth → RoleGate → effect (no merge into capabilities.js).
 *
 * @param {{
 *   inviteStore: import('./InviteStore'),
 *   membershipStore: import('../membership/MembershipStore'),
 *   dualInput: Parameters<typeof dualAuthGate>[0],
 *   to: string,
 *   role: string,
 *   familyId: string,
 *   displayName?: string,
 *   inviteId?: string,
 *   familyMemberships?: object[]
 * }} input
 * @returns {object} Invite row (status=open)
 */
function createInvite(input) {
  if (!input?.inviteStore || typeof input.inviteStore.addInvite !== 'function') {
    throw inviteError('EINVITE_BAD_PAYLOAD', 'inviteStore is required');
  }
  if (!input?.membershipStore) {
    throw inviteError('EINVITE_BAD_PAYLOAD', 'membershipStore is required');
  }
  if (!input?.dualInput) {
    throw inviteError('EINVITE_BAD_PAYLOAD', 'dualInput is required');
  }

  const familyId = requireId(input.familyId, 'familyId');

  if (typeof input.to !== 'string' || !input.to.trim()) {
    throw inviteError('EINVITE_EMPTY_TO', 'Invite `to` address is required');
  }

  let role;
  try {
    role = assertRole(input.role);
  } catch (err) {
    throw inviteError(
      'EINVITE_INVALID_ROLE',
      err?.message || 'Invalid invite role',
    );
  }

  const to = normalizeAddress(input.to);

  // DualAuth first — fail-closed unauth
  const allowed = dualAuthGate({
    ...input.dualInput,
    membershipStore: input.membershipStore,
    familyId,
  });

  if (allowed.membership.role !== 'parent') {
    // RoleGate would also deny FAMILY_MEMBERS_SETTINGS for child; explicit for AC-M01.
    const err = new Error('RoleGate deny: parent_required_for_invite');
    err.code = 'EROLEGATE_DENY';
    throw err;
  }

  const familyMemberships =
    input.familyMemberships ||
    input.membershipStore.listMembershipsByFamily(familyId);

  return runWithRoleGate(
    {
      actor: allowed.actor,
      capabilityId: CAPABILITIES.FAMILY_MEMBERS_SETTINGS,
      familyMemberships,
    },
    () => {
      if (!input.membershipStore.getFamily(familyId)) {
        throw inviteError(
          'EINVITE_UNKNOWN_FAMILY',
          `Unknown familyId: ${familyId}`,
        );
      }
      if (!input.membershipStore.isBootstrapped(familyId)) {
        throw inviteError(
          'EINVITE_NOT_BOOTSTRAPPED',
          `Family ${familyId} is not bootstrapped (AC-M05)`,
        );
      }

      assertNoAddressRoleConflict({
        membershipStore: input.membershipStore,
        inviteStore: input.inviteStore,
        familyId,
        to,
        role,
      });

      const inviteId =
        typeof input.inviteId === 'string' && input.inviteId.trim()
          ? input.inviteId.trim()
          : nextInviteId();

      return input.inviteStore.addInvite({
        id: inviteId,
        from: allowed.membership.address,
        to,
        role,
        familyId,
        displayName: input.displayName,
        fromMembershipId: allowed.membership.id,
      });
    },
  );
}

module.exports = {
  createInvite,
  assertNoAddressRoleConflict,
  nextInviteId,
};
