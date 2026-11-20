'use strict';

const { normalizeAddress } = require('../membership/normalize');
const { decide } = require('../roleGate/decide');
const { CAPABILITIES } = require('../roleGate/capabilities');
const { inviteError } = require('./errors');

/**
 * Pre-accept deny (AC-M06): open Invite alone ≠ Membership; invitee cannot
 * pass a family capability path until accept creates membership.
 *
 * @param {{
 *   membershipStore: import('../membership/MembershipStore'),
 *   toAddress: string,
 *   familyId: string,
 *   capabilityId?: string
 * }} input
 * @returns {{ outcome: 'deny', reason: string }}
 */
function assertInviteeNoFamilyCaps(input) {
  const { membershipStore, familyId } = input;
  if (!membershipStore) {
    throw inviteError('EINVITE_BAD_PAYLOAD', 'membershipStore is required');
  }
  if (typeof input.toAddress !== 'string' || !input.toAddress.trim()) {
    throw inviteError('EINVITE_EMPTY_TO', 'to address is required');
  }

  const to = normalizeAddress(input.toAddress);
  const memberships = membershipStore
    .listMembershipsByAddress(to)
    .filter((m) => m.familyId === familyId);

  if (memberships.length > 0) {
    // Already accepted / member — not a pre-accept path
    throw inviteError(
      'EINVITE_BAD_PAYLOAD',
      `Address ${to} already has membership in ${familyId}; not a pre-accept path`,
    );
  }

  // Synthetic actor without membershipId — RoleGate must deny missing_actor /
  // or we explicitly deny: no actor from open invite alone.
  const capabilityId =
    typeof input.capabilityId === 'string' && input.capabilityId.trim()
      ? input.capabilityId.trim()
      : CAPABILITIES.FAMILY_JOURNAL;

  const decision = decide({
    actor: null,
    capabilityId,
    familyMemberships: membershipStore.listMembershipsByFamily(familyId),
  });

  if (decision.outcome !== 'deny') {
    throw inviteError(
      'EINVITE_PRE_ACCEPT_NO_CAPS',
      'Pre-accept path unexpectedly allowed family capability (AC-M06)',
    );
  }

  return {
    outcome: 'deny',
    reason: decision.reason || 'pre_accept_no_membership',
    code: 'EINVITE_PRE_ACCEPT_NO_CAPS',
  };
}

module.exports = {
  assertInviteeNoFamilyCaps,
};
