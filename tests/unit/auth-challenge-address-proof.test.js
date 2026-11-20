'use strict';

const { expect } = require('chai');
const { ethers } = require('ethers');

const {
  ChallengeStore,
  buildSiweClassMessage,
  issueChallenge,
  verifyAddressProof,
} = require('../../packages/core/src/auth');

describe('auth / challenge + address proof (AUTH-01)', () => {
  /** @type {import('ethers').HDNodeWallet} */
  let wallet;
  /** @type {string} */
  let address;

  beforeEach(() => {
    wallet = ethers.Wallet.createRandom();
    address = wallet.address.toLowerCase();
  });

  describe('ChallengeStore (t01)', () => {
    it('holds pending challenge and consume is single-use', () => {
      const store = new ChallengeStore();
      store.put({
        id: 'c1',
        address: '0xabc',
        nonce: 'n1',
        message: 'msg',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:05:00.000Z',
        expiresAtMs: 1,
      });
      expect(store.get('c1').nonce).to.equal('n1');
      expect(store.consume('c1').id).to.equal('c1');
      expect(() => store.get('c1')).to.throw(/already consumed/).and.satisfy((e) => e.code === 'EAUTH_CHALLENGE_REPLAY');
      expect(() => store.consume('c1')).to.throw(/already consumed/).and.satisfy((e) => e.code === 'EAUTH_CHALLENGE_REPLAY');
    });
  });

  describe('issueChallenge + SIWE-class message (t02/t03)', () => {
    it('normalizes address and returns message inputs', () => {
      const store = new ChallengeStore();
      const issued = issueChallenge(store, wallet.address, {
        nowMs: 1_700_000_000_000,
        ttlMs: 60_000,
        id: 'fixed-id',
        nonce: 'fixed-nonce',
      });
      expect(issued.challengeId).to.equal('fixed-id');
      expect(issued.address).to.equal(address);
      expect(issued.nonce).to.equal('fixed-nonce');
      expect(issued.message).to.equal(
        buildSiweClassMessage({
          address,
          nonce: 'fixed-nonce',
          issuedAt: issued.issuedAt,
          expiresAt: issued.expiresAt,
        }),
      );
      expect(issued.message).to.match(/NOT an on-chain money signature/i);
      expect(store.get('fixed-id').address).to.equal(address);
    });

    it('buildSiweClassMessage is deterministic', () => {
      const a = buildSiweClassMessage({
        address: '0xaaa',
        nonce: 'n',
        issuedAt: 't0',
        expiresAt: 't1',
      });
      const b = buildSiweClassMessage({
        address: '0xaaa',
        nonce: 'n',
        issuedAt: 't0',
        expiresAt: 't1',
      });
      expect(a).to.equal(b);
    });
  });

  describe('verifyAddressProof success (t04)', () => {
    it('accepts valid signature and consumes challenge → AddressProof', async () => {
      const store = new ChallengeStore();
      const nowMs = 1_700_000_000_000;
      const issued = issueChallenge(store, wallet.address, {
        nowMs,
        ttlMs: 120_000,
      });
      const signature = await wallet.signMessage(issued.message);
      const proof = verifyAddressProof(store, issued.challengeId, signature, { nowMs: nowMs + 1_000 });
      expect(proof.address).to.equal(address);
      expect(proof.challengeId).to.equal(issued.challengeId);
      expect(proof.verifiedAtMs).to.equal(nowMs + 1_000);
      expect(store.pendingCount()).to.equal(0);
    });
  });

  describe('reject paths fail-closed (t05)', () => {
    it('rejects wrong signer', async () => {
      const store = new ChallengeStore();
      const nowMs = 1_700_000_000_000;
      const issued = issueChallenge(store, wallet.address, { nowMs, ttlMs: 120_000 });
      const other = ethers.Wallet.createRandom();
      const badSig = await other.signMessage(issued.message);
      expect(() => verifyAddressProof(store, issued.challengeId, badSig, { nowMs }))
        .to.throw(/Wrong signer/)
        .and.satisfy((e) => e.code === 'EAUTH_WRONG_SIGNER');
      // challenge remains pending (not consumed on fail)
      expect(store.get(issued.challengeId).id).to.equal(issued.challengeId);
    });

    it('rejects expired challenge', async () => {
      const store = new ChallengeStore();
      const nowMs = 1_700_000_000_000;
      const issued = issueChallenge(store, wallet.address, { nowMs, ttlMs: 1_000 });
      const signature = await wallet.signMessage(issued.message);
      expect(() => verifyAddressProof(store, issued.challengeId, signature, { nowMs: nowMs + 5_000 }))
        .to.throw(/expired/i)
        .and.satisfy((e) => e.code === 'EAUTH_CHALLENGE_EXPIRED');
    });

    it('rejects replay after success', async () => {
      const store = new ChallengeStore();
      const nowMs = 1_700_000_000_000;
      const issued = issueChallenge(store, wallet.address, { nowMs, ttlMs: 120_000 });
      const signature = await wallet.signMessage(issued.message);
      verifyAddressProof(store, issued.challengeId, signature, { nowMs });
      expect(() => verifyAddressProof(store, issued.challengeId, signature, { nowMs }))
        .to.throw(/already consumed/)
        .and.satisfy((e) => e.code === 'EAUTH_CHALLENGE_REPLAY');
    });

    it('rejects unknown challenge id', async () => {
      const store = new ChallengeStore();
      const signature = await wallet.signMessage('nope');
      expect(() => verifyAddressProof(store, 'missing-id', signature))
        .to.throw(/Unknown challenge/)
        .and.satisfy((e) => e.code === 'EAUTH_UNKNOWN_CHALLENGE');
    });

    it('rejects invalid signature payload', async () => {
      const store = new ChallengeStore();
      const nowMs = 1_700_000_000_000;
      const issued = issueChallenge(store, wallet.address, { nowMs, ttlMs: 120_000 });
      expect(() => verifyAddressProof(store, issued.challengeId, '0xdead', { nowMs }))
        .to.throw(/Signature recovery failed/)
        .and.satisfy((e) => e.code === 'EAUTH_INVALID_SIGNATURE');
    });
  });
});
