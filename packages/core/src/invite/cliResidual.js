'use strict';

/**
 * Stable string for tests / docs: invite Done = modules under test only.
 * CLI coexistence residual — do not claim CLI invite Done.
 */
const INVITE_CLI_RESIDUAL_NOTE =
  'Invite Done = packages/core/src/invite modules under test; ' +
  'CLI paths that skip Invite / createInvite remain ungated coexistence residual — ' +
  'do not claim CLI invite Done. Legacy addMembership without Invite ≠ invite Done.';

module.exports = {
  INVITE_CLI_RESIDUAL_NOTE,
};
