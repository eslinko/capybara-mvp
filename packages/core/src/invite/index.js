'use strict';

/**
 * Capybara invite edge (INV-01…03).
 *
 * **CLI residual:** invite product AC (createInvite / bind / refusals) is claimed
 * on host-agnostic modules under test. CLI paths that call
 * `MembershipStore.addMembership` without Invite are ungated coexistence —
 * do **not** claim CLI invite Done. Legacy `addMembership` without Invite ≠ invite Done.
 *
 * Soft-disable / hard delete / `family.invite_member` RoleGate id = out of epic.
 */

const InviteStore = require('./InviteStore');
const { createInvite, assertNoAddressRoleConflict, nextInviteId } = require('./createInvite');
const { findOpenInviteByTo } = require('./findOpenInviteByTo');
const {
  bindInviteeAndAccept,
  assertProofMatchesInviteTo,
  nextMembershipId,
} = require('./bindInvitee');
const { assertInviteeNoFamilyCaps } = require('./assertInviteeNoFamilyCaps');
const { inviteError } = require('./errors');
const { INVITE_CLI_RESIDUAL_NOTE } = require('./cliResidual');

module.exports = {
  InviteStore,
  createInvite,
  assertNoAddressRoleConflict,
  nextInviteId,
  findOpenInviteByTo,
  bindInviteeAndAccept,
  assertProofMatchesInviteTo,
  nextMembershipId,
  assertInviteeNoFamilyCaps,
  inviteError,
  INVITE_CLI_RESIDUAL_NOTE,
};
