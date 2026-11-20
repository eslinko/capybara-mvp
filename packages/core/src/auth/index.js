'use strict';

const { ChallengeStore } = require('./ChallengeStore');
const { buildSiweClassMessage } = require('./buildSiweClassMessage');
const { issueChallenge, DEFAULT_TTL_MS } = require('./issueChallenge');
const { verifyAddressProof } = require('./verifyAddressProof');
const { authError } = require('./errors');

module.exports = {
  ChallengeStore,
  buildSiweClassMessage,
  issueChallenge,
  DEFAULT_TTL_MS,
  verifyAddressProof,
  authError,
};
