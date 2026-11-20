'use strict';

const { normalizeAddress } = require('../membership/normalize');
const { buildActorContext } = require('../membership/actorContext');
const { bindAddressToAuthUser } = require('../auth/bindAddressToAuthUser');
const { findOpenInviteByTo } = require('./findOpenInviteByTo');
const { inviteError } = require('./errors');

let _membershipSeq = 0;

/**
 * @returns {string}
 */
function nextMembershipId() {
  _membershipSeq += 1;
  return `m-invitee-${_membershipSeq}-${Date.now()}`;
}

/**
 * Assert AddressProof.address equals Invite.`to` (no opaque token).
 *
 * @param {{ address: string }} proof
 * @param {object} invite
 */
function assertProofMatchesInviteTo(proof, invite) {
  if (!proof || typeof proof.address !== 'string') {
    throw inviteError('EINVITE_BAD_PAYLOAD', 'AddressProof required');
  }
  const proofAddr = normalizeAddress(proof.address);
  if (proofAddr !== invite.to) {
    throw inviteError(
      'EINVITE_PROOF_MISMATCH',
      `Proof address ${proofAddr} does not match Invite.to ${invite.to}`,
    );
  }
}

/**
 * Bind invitee after AUTH proof → active Membership with Invite.role + userId;
 * mark Invite accepted (AC-M03). Reuses AUTH bindAddressToAuthUser — no fork.
 *
 * @param {{
 *   inviteStore: import('./InviteStore'),
 *   membershipStore: import('../membership/MembershipStore'),
 *   proof: import('../auth/supabaseAuthPort').AddressProof,
 *   authPort: import('../auth/supabaseAuthPort').SupabaseAuthPort,
 *   config: import('../auth/loadAuthEnvConfig').AuthEnvConfig,
 *   familyId?: string,
 *   inviteId?: string,
 *   membershipId?: string,
 *   nowMs?: number,
 *   clientClaimedRole?: string
 * }} input
 * @returns {Promise<{
 *   invite: object,
 *   membership: object,
 *   link: object,
 *   actor: object
 * }>}
 */
async function bindInviteeAndAccept(input) {
  // Client-claimed role ignored (AC-M03 / AC-A03) — role from Invite only.
  void input?.clientClaimedRole;

  if (!input?.inviteStore || !input?.membershipStore) {
    throw inviteError(
      'EINVITE_BAD_PAYLOAD',
      'inviteStore and membershipStore are required',
    );
  }
  if (!input?.proof || !input?.authPort || !input?.config) {
    throw inviteError(
      'EINVITE_BAD_PAYLOAD',
      'proof, authPort, and config are required',
    );
  }

  let invite;
  if (typeof input.inviteId === 'string' && input.inviteId.trim()) {
    invite = input.inviteStore.getInvite(input.inviteId.trim());
    if (!invite) {
      throw inviteError(
        'EINVITE_NOT_FOUND',
        `Unknown inviteId: ${input.inviteId}`,
      );
    }
    if (invite.status !== 'open') {
      throw inviteError(
        'EINVITE_ALREADY_ACCEPTED',
        `Invite ${invite.id} is not open (status=${invite.status})`,
      );
    }
  } else {
    invite = findOpenInviteByTo(
      input.inviteStore,
      input.proof.address,
      input.familyId,
    );
    if (!invite) {
      throw inviteError(
        'EINVITE_NOT_FOUND',
        `No open invite for address ${normalizeAddress(input.proof.address)}`,
      );
    }
  }

  assertProofMatchesInviteTo(input.proof, invite);

  const link = await bindAddressToAuthUser(
    {
      proof: input.proof,
      authPort: input.authPort,
      config: input.config,
    },
    { nowMs: input.nowMs },
  );

  if (link.address !== invite.to) {
    throw inviteError(
      'EINVITE_PROOF_MISMATCH',
      `Bound address ${link.address} does not match Invite.to ${invite.to}`,
    );
  }

  const membershipId =
    typeof input.membershipId === 'string' && input.membershipId.trim()
      ? input.membershipId.trim()
      : nextMembershipId();

  // Role from Invite only (frozen) — never from client claim
  const membership = input.membershipStore.addMembership({
    id: membershipId,
    familyId: invite.familyId,
    role: invite.role,
    address: invite.to,
    userId: link.userId,
  });

  const accepted = input.inviteStore.markAccepted(invite.id);
  const actor = buildActorContext(membership);

  return {
    invite: accepted,
    membership,
    link,
    actor,
  };
}

module.exports = {
  bindInviteeAndAccept,
  assertProofMatchesInviteTo,
  nextMembershipId,
};
