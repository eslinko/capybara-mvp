'use strict';

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
};
