'use strict';

const { normalizeAddress } = require('../membership/normalize');
const { authError } = require('./errors');

/**
 * Bootstrap input contract (AC-A05): both poolProof + parentProof required.
 *
 * @typedef {{
 *   familyId?: string,
 *   poolAddress: string,
 *   parentAddress: string,
 *   poolProof: { address: string, challengeId?: string, verifiedAt?: string, verifiedAtMs?: number },
 *   parentProof: { address: string, challengeId?: string, verifiedAt?: string, verifiedAtMs?: number },
 *   founderMembershipId?: string
 * }} BootstrapInput
 *
 * @param {Partial<BootstrapInput> | null | undefined} input
 * @returns {{
 *   familyId: string | null,
 *   poolAddress: string,
 *   parentAddress: string,
 *   poolProof: object,
 *   parentProof: object,
 *   founderMembershipId: string | null
 * }}
 */
function assertBootstrapInput(input) {
  if (!input || typeof input !== 'object') {
    throw authError('EAUTH_BAD_PAYLOAD', 'Bootstrap input required');
  }
  if (!input.poolProof || typeof input.poolProof !== 'object') {
    throw authError('EAUTH_BOOTSTRAP_MISSING_PROOF', 'poolProof required (AC-A05)');
  }
  if (!input.parentProof || typeof input.parentProof !== 'object') {
    throw authError('EAUTH_BOOTSTRAP_MISSING_PROOF', 'parentProof required (AC-A05)');
  }

  let poolAddress;
  let parentAddress;
  try {
    poolAddress = normalizeAddress(input.poolAddress);
    parentAddress = normalizeAddress(input.parentAddress);
  } catch {
    throw authError('EAUTH_BAD_PAYLOAD', 'poolAddress and parentAddress required');
  }

  return {
    familyId:
      typeof input.familyId === 'string' && input.familyId.trim()
        ? input.familyId.trim()
        : null,
    poolAddress,
    parentAddress,
    poolProof: input.poolProof,
    parentProof: input.parentProof,
    founderMembershipId:
      typeof input.founderMembershipId === 'string' && input.founderMembershipId.trim()
        ? input.founderMembershipId.trim()
        : null,
  };
}

module.exports = {
  assertBootstrapInput,
};
