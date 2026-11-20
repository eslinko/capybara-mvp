'use strict';

const { expect } = require('chai');
const { ethers } = require('ethers');

const { MembershipStore } = require('../../packages/core/src/membership');
const {
  ChallengeStore,
  issueChallenge,
  verifyAddressProof,
  createMemorySupabaseAuthDouble,
  assertBootstrapInput,
  bootstrapPoolAndFounder,
} = require('../../packages/core/src/auth');

const FIXTURE_CONFIG = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'test-service-role-key',
  bearerSecret: 'test-bearer-signing-secret',
};

/**
 * @param {import('ethers').HDNodeWallet} wallet
 * @param {number} nowMs
 */
async function makeProof(wallet, nowMs = 1_700_000_000_000) {
  const store = new ChallengeStore();
  const issued = issueChallenge(store, wallet.address, { nowMs, ttlMs: 120_000 });
  const signature = await wallet.signMessage(issued.message);
  return verifyAddressProof(store, issued.challengeId, signature, { nowMs });
}

describe('auth / bootstrap pool + founder (AUTH-04)', () => {
  describe('input contract (t01)', () => {
    it('rejects missing poolProof or parentProof (AC-A05)', () => {
      expect(() =>
        assertBootstrapInput({
          poolAddress: '0xabc',
          parentAddress: '0xdef',
          parentProof: { address: '0xdef' },
        }),
      )
        .to.throw(/poolProof/)
        .and.satisfy((e) => e.code === 'EAUTH_BOOTSTRAP_MISSING_PROOF');

      expect(() =>
        assertBootstrapInput({
          poolAddress: '0xabc',
          parentAddress: '0xdef',
          poolProof: { address: '0xabc' },
        }),
      )
        .to.throw(/parentProof/)
        .and.satisfy((e) => e.code === 'EAUTH_BOOTSTRAP_MISSING_PROOF');
    });
  });

  describe('same / diff / replay (t02–t06) — AC-A05/A06', () => {
    it('allows same address for pool+parent (AC-A06)', async () => {
      const wallet = ethers.Wallet.createRandom();
      const proof = await makeProof(wallet);
      const membershipStore = new MembershipStore();
      const authPort = createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'founder-uid-same',
      });

      const result = await bootstrapPoolAndFounder({
        membershipStore,
        authPort,
        config: FIXTURE_CONFIG,
        familyId: 'fam-same',
        poolAddress: wallet.address,
        parentAddress: wallet.address,
        poolProof: proof,
        parentProof: proof,
        founderMembershipId: 'm-founder-same',
      });

      expect(result.sameAddress).to.equal(true);
      expect(result.founderMembership.role).to.equal('parent');
      expect(result.founderMembership.userId).to.equal('founder-uid-same');
      expect(result.family.poolAddress).to.equal(wallet.address.toLowerCase());
      expect(result.family.bootstrapped).to.equal(true);
      expect(membershipStore.isBootstrapped('fam-same')).to.equal(true);
    });

    it('allows different pool vs parent addresses (AC-A06)', async () => {
      const poolWallet = ethers.Wallet.createRandom();
      const parentWallet = ethers.Wallet.createRandom();
      const poolProof = await makeProof(poolWallet);
      const parentProof = await makeProof(parentWallet);
      const membershipStore = new MembershipStore();
      const authPort = createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'founder-uid-diff',
      });

      const result = await bootstrapPoolAndFounder({
        membershipStore,
        authPort,
        config: FIXTURE_CONFIG,
        familyId: 'fam-diff',
        poolAddress: poolWallet.address,
        parentAddress: parentWallet.address,
        poolProof,
        parentProof,
      });

      expect(result.sameAddress).to.equal(false);
      expect(result.poolAddress).to.equal(poolWallet.address.toLowerCase());
      expect(result.parentAddress).to.equal(parentWallet.address.toLowerCase());
      expect(result.founderMembership.role).to.equal('parent');
      expect(result.founderMembership.address).to.equal(
        parentWallet.address.toLowerCase(),
      );
      expect(result.family.poolAddress).to.equal(poolWallet.address.toLowerCase());
    });

    it('rejects bootstrap without both proofs (AC-A05)', async () => {
      const membershipStore = new MembershipStore();
      const authPort = createMemorySupabaseAuthDouble();
      try {
        await bootstrapPoolAndFounder({
          membershipStore,
          authPort,
          config: FIXTURE_CONFIG,
          poolAddress: '0x1111111111111111111111111111111111111111',
          parentAddress: '0x2222222222222222222222222222222222222222',
          poolProof: { address: '0x1111111111111111111111111111111111111111' },
          // parentProof missing
        });
        expect.fail('should throw');
      } catch (e) {
        expect(e.code).to.equal('EAUTH_BOOTSTRAP_MISSING_PROOF');
      }
    });

    it('rejects proof/address mismatch', async () => {
      const poolWallet = ethers.Wallet.createRandom();
      const parentWallet = ethers.Wallet.createRandom();
      const other = ethers.Wallet.createRandom();
      const poolProof = await makeProof(poolWallet);
      const parentProof = await makeProof(parentWallet);
      const membershipStore = new MembershipStore();
      const authPort = createMemorySupabaseAuthDouble();

      try {
        await bootstrapPoolAndFounder({
          membershipStore,
          authPort,
          config: FIXTURE_CONFIG,
          poolAddress: other.address, // mismatch
          parentAddress: parentWallet.address,
          poolProof,
          parentProof,
        });
        expect.fail('should throw');
      } catch (e) {
        expect(e.code).to.equal('EAUTH_BOOTSTRAP_PROOF_MISMATCH');
      }
    });

    it('rejects second bootstrap on same live family', async () => {
      const wallet = ethers.Wallet.createRandom();
      const proof = await makeProof(wallet);
      const membershipStore = new MembershipStore();
      const authPort = createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'founder-uid-replay',
      });

      await bootstrapPoolAndFounder({
        membershipStore,
        authPort,
        config: FIXTURE_CONFIG,
        familyId: 'fam-replay',
        poolAddress: wallet.address,
        parentAddress: wallet.address,
        poolProof: proof,
        parentProof: proof,
      });

      const proof2 = await makeProof(wallet);
      try {
        await bootstrapPoolAndFounder({
          membershipStore,
          authPort,
          config: FIXTURE_CONFIG,
          familyId: 'fam-replay',
          poolAddress: wallet.address,
          parentAddress: wallet.address,
          poolProof: proof2,
          parentProof: proof2,
        });
        expect.fail('should throw');
      } catch (e) {
        expect(e.code).to.equal('EAUTH_BOOTSTRAP_REPLAY');
      }
    });
  });
});
