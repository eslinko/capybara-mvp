'use strict';

/**
 * Capybara auth edge (AUTH-01…03).
 *
 * CLI residual: DualAuthGate product AC-A01 is for host/modules under test.
 * CLI paths that omit DualAuthGate remain ungated coexistence residual —
 * do not claim CLI dual-auth Done.
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
};
