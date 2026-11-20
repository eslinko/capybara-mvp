'use strict';

const crypto = require('crypto');
const { normalizeAddress } = require('../membership/normalize');
const { assertBootstrapInput } = require('./assertBootstrapInput');
const { bindAddressToAuthUser } = require('./bindAddressToAuthUser');
const { requireAuthEnvClasses } = require('./loadAuthEnvConfig');
const { authError } = require('./errors');

/**
 * Verify AddressProof binds to expected address (AUTH-01 contract consume).
 *
 * @param {object} proof
 * @param {string} expectedAddress
 * @param {string} label
 * @returns {string} normalized proof address
 */
function assertProofMatchesAddress(proof, expectedAddress, label) {
  if (!proof || typeof proof.address !== 'string') {
    throw authError('EAUTH_BOOTSTRAP_MISSING_PROOF', `${label} AddressProof required`);
  }
  let proofAddr;
  try {
    proofAddr = normalizeAddress(proof.address);
  } catch {
    throw authError('EAUTH_BOOTSTRAP_PROOF_MISMATCH', `${label} proof address invalid`);
  }
  if (proofAddr !== expectedAddress) {
    throw authError(
      'EAUTH_BOOTSTRAP_PROOF_MISMATCH',
      `${label} proof address ${proofAddr} !== ${expectedAddress}`,
    );
  }
  return proofAddr;
}

/**
 * Bootstrap family: signed pool + founder parent proofs (AC-A05/A06).
 * Host-agnostic; Railway live deploy = residual.
 *
 * Same or different pool vs parent addresses allowed (AC-A06).
 * Success → founder membership role=parent + logical pool identity.
 * Second bootstrap on live family → reject.
 *
 * @param {{
 *   membershipStore: import('../membership/MembershipStore'),
 *   authPort: import('./supabaseAuthPort').SupabaseAuthPort,
 *   config: import('./loadAuthEnvConfig').AuthEnvConfig,
 *   familyId?: string,
 *   poolAddress: string,
 *   parentAddress: string,
 *   poolProof: object,
 *   parentProof: object,
 *   founderMembershipId?: string
 * }} input
 * @param {{ nowMs?: number }} [opts]
 * @returns {Promise<{
 *   family: object,
 *   founderMembership: object,
 *   poolAddress: string,
 *   parentAddress: string,
 *   sameAddress: boolean,
 *   userLink: object
 * }>}
 */
async function bootstrapPoolAndFounder(input, opts = {}) {
  const parsed = assertBootstrapInput(input);
  const store = input?.membershipStore;
  if (!store || typeof store.createFamily !== 'function') {
    throw authError('EAUTH_BAD_PAYLOAD', 'MembershipStore required');
  }
  requireAuthEnvClasses(input?.config);
  if (!input?.authPort || typeof input.authPort.createOrLinkUser !== 'function') {
    throw authError('EAUTH_BAD_PAYLOAD', 'SupabaseAuthPort required');
  }

  // t02 — verify two AddressProofs bind to declared addresses (AUTH-01)
  assertProofMatchesAddress(parsed.poolProof, parsed.poolAddress, 'pool');
  assertProofMatchesAddress(parsed.parentProof, parsed.parentAddress, 'parent');

  const familyId = parsed.familyId || `fam-${crypto.randomBytes(8).toString('hex')}`;
  const existing = store.getFamily(familyId);
  if (existing && store.isBootstrapped(familyId)) {
    throw authError(
      'EAUTH_BOOTSTRAP_REPLAY',
      `Family already bootstrapped: ${familyId}`,
    );
  }
  if (existing && !store.isBootstrapped(familyId)) {
    // Family created without bootstrap — refuse ambiguous live state
    throw authError(
      'EAUTH_BOOTSTRAP_REPLAY',
      `Family exists but not via bootstrap: ${familyId}`,
    );
  }

  // t03 — create family + founder parent membership
  const family = store.createFamily({ id: familyId });
  const founderMembershipId =
    parsed.founderMembershipId || `m-founder-${crypto.randomBytes(6).toString('hex')}`;
  let founderMembership = store.addMembership({
    id: founderMembershipId,
    familyId,
    role: 'parent',
    address: parsed.parentAddress,
  });

  // AUTH-02 seam: bind Supabase Auth user after parent proof
  const userLink = await bindAddressToAuthUser(
    {
      proof: { ...parsed.parentProof, address: parsed.parentAddress },
      authPort: input.authPort,
      config: input.config,
    },
    { nowMs: opts.nowMs },
  );
  founderMembership = store.bindUserId(founderMembership.id, userLink.userId);

  // t04 — logical pool identity (no invent DDL)
  store.setPoolIdentity(familyId, parsed.poolAddress);
  // t05 — mark live so second bootstrap rejects
  const bootstrappedFamily = store.markBootstrapped(familyId);

  return {
    family: bootstrappedFamily,
    founderMembership,
    poolAddress: parsed.poolAddress,
    parentAddress: parsed.parentAddress,
    sameAddress: parsed.poolAddress === parsed.parentAddress,
    userLink,
  };
}

module.exports = {
  bootstrapPoolAndFounder,
  assertProofMatchesAddress,
};
