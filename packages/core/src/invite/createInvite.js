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
 * Async-aware for Postgres stores (PGDUR-02).
 *
 * @param {{
 *   membershipStore: import('../membership/MembershipStore'),
 *   inviteStore: import('./InviteStore'),
 *   familyId: string,
 *   to: string,
 *   role: 'parent' | 'child'
 * }} input
 */
async function assertNoAddressRoleConflict(input) {
  const { membershipStore, inviteStore, familyId, to, role } = input;
  const existingRole = await Promise.resolve(
    membershipStore.getRoleForAddress(to),
  );
  if (existingRole && existingRole !== role) {
    throw inviteError(
      'EINVITE_ADDRESS_ROLE_CONFLICT',
      `Address ${to} already bound to role "${existingRole}"; cannot invite as "${role}"`,
    );
  }

  const sameFamilyMemberships = (
    await Promise.resolve(membershipStore.listMembershipsByAddress(to))
  ).filter((m) => m.familyId === familyId);
  if (sameFamilyMemberships.length > 0) {
    throw inviteError(
      'EINVITE_ADDRESS_ROLE_CONFLICT',
      `Address ${to} already has membership in family ${familyId}`,
    );
  }

  const open = await Promise.resolve(
    inviteStore.listOpenByToInFamily(familyId, to),
  );
  if (open.length > 0) {
    throw inviteError(
      'EINVITE_OPEN_CONFLICT',
      `Open invite already exists for ${to} in family ${familyId}`,
    );
  }
}

/**
 * createInvite — DualAuthGate **before** RoleGate `family.members_settings` + bootstrapped family.
 * Async-aware for Postgres adapters (PGDUR-02).
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
 * @returns {Promise<object>} Invite row (status=open)
 */
async function createInvite(input) {
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
  const allowed = await dualAuthGate({
    ...input.dualInput,
    membershipStore: input.membershipStore,
    familyId,
  });

  if (allowed.membership.role !== 'parent') {
    const err = new Error('RoleGate deny: parent_required_for_invite');
    err.code = 'EROLEGATE_DENY';
    throw err;
  }

  const familyMemberships =
    input.familyMemberships ||
    (await Promise.resolve(
      input.membershipStore.listMembershipsByFamily(familyId),
    ));

  return runWithRoleGate(
    {
      actor: allowed.actor,
      capabilityId: CAPABILITIES.FAMILY_MEMBERS_SETTINGS,
      familyMemberships,
    },
    async () => {
      const family = await Promise.resolve(
        input.membershipStore.getFamily(familyId),
      );
      if (!family) {
        throw inviteError(
          'EINVITE_UNKNOWN_FAMILY',
          `Unknown familyId: ${familyId}`,
        );
      }
      const bootstrapped = await Promise.resolve(
        input.membershipStore.isBootstrapped(familyId),
      );
      if (!bootstrapped) {
        throw inviteError(
          'EINVITE_NOT_BOOTSTRAPPED',
          `Family ${familyId} is not bootstrapped (AC-M05)`,
        );
      }

      await assertNoAddressRoleConflict({
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

      return Promise.resolve(
        input.inviteStore.addInvite({
          id: inviteId,
          from: allowed.membership.address,
          to,
          role,
          familyId,
          displayName: input.displayName,
          fromMembershipId: allowed.membership.id,
        }),
      );
    },
  );
}

module.exports = {
  createInvite,
  assertNoAddressRoleConflict,
  nextInviteId,
};
