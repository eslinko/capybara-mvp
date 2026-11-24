'use strict';

/**
 * Capybara auth edge (AUTH-01…04).
 *
 * CLI residual: DualAuthGate product AC-A01 is for host/modules under test.
 * CLI paths that omit DualAuthGate remain ungated coexistence residual —
 * do not claim CLI dual-auth Done.
 * Bootstrap Railway live deploy = residual; modules are host-agnostic.
 */

const { ChallengeStore } = require('./ChallengeStore');
const { buildSiweClassMessage } = require('./buildSiweClassMessage');
const { issueChallenge, DEFAULT_TTL_MS } = require('./issueChallenge');
const { verifyAddressProof } = require('./verifyAddressProof');
const { authError } = require('./errors');
const {
  requireAuthEnvClasses,
  loadAuthEnvConfig,
} = require('./loadAuthEnvConfig');
const {
  createMemorySupabaseAuthDouble,
  createLiveSupabaseAuthPortResidual,
  createLiveSupabaseAuthPort,
  buildCapybaraAuthEmail,
} = require('./supabaseAuthPort');
const { bindAddressToAuthUser } = require('./bindAddressToAuthUser');
const {
  BearerSessionStore,
  issueBearerSession,
  validateBearer,
  logoutBearer,
  DEFAULT_BEARER_TTL_MS,
} = require('./bearerSession');
const { resolveMembershipForSession } = require('./resolveMembershipForSession');
const { decideDualAuth, dualAuthGate } = require('./dualAuthGate');
const { runWithDualAuthThenRoleGate } = require('./runWithDualAuthThenRoleGate');
const { assertBootstrapInput } = require('./assertBootstrapInput');
const {
  bootstrapPoolAndFounder,
  assertProofMatchesAddress,
} = require('./bootstrapPoolAndFounder');

module.exports = {
  ChallengeStore,
  buildSiweClassMessage,
  issueChallenge,
  DEFAULT_TTL_MS,
  verifyAddressProof,
  authError,
  requireAuthEnvClasses,
  loadAuthEnvConfig,
  createMemorySupabaseAuthDouble,
  createLiveSupabaseAuthPortResidual,
  createLiveSupabaseAuthPort,
  buildCapybaraAuthEmail,
  bindAddressToAuthUser,
  BearerSessionStore,
  issueBearerSession,
  validateBearer,
  logoutBearer,
  DEFAULT_BEARER_TTL_MS,
  resolveMembershipForSession,
  decideDualAuth,
  dualAuthGate,
  runWithDualAuthThenRoleGate,
  assertBootstrapInput,
  bootstrapPoolAndFounder,
  assertProofMatchesAddress,
};
