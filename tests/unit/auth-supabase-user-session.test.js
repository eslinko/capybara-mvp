'use strict';

const { expect } = require('chai');
const { ethers } = require('ethers');

const {
  ChallengeStore,
  issueChallenge,
  verifyAddressProof,
  requireAuthEnvClasses,
  loadAuthEnvConfig,
  createMemorySupabaseAuthDouble,
  createLiveSupabaseAuthPortResidual,
  bindAddressToAuthUser,
  BearerSessionStore,
  issueBearerSession,
  validateBearer,
  logoutBearer,
} = require('../../packages/core/src/auth');

const FIXTURE_CONFIG = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'test-service-role-key',
  bearerSecret: 'test-bearer-signing-secret',
};

const KEY_MAP = {
  supabaseUrl: 'TEST_SUPABASE_URL',
  supabaseKey: 'TEST_SUPABASE_KEY',
  bearerSecret: 'TEST_BEARER_SECRET',
};

describe('auth / Supabase user + bearer session (AUTH-02)', () => {
  /** @returns {Promise<import('../../packages/core/src/auth/supabaseAuthPort').AddressProof>} */
  async function makeProof() {
    const wallet = ethers.Wallet.createRandom();
    const store = new ChallengeStore();
    const nowMs = 1_700_000_000_000;
    const issued = issueChallenge(store, wallet.address, { nowMs, ttlMs: 120_000 });
    const signature = await wallet.signMessage(issued.message);
    return verifyAddressProof(store, issued.challengeId, signature, { nowMs });
  }

  describe('env config fail-closed (t01)', () => {
    it('refuses when a required class is missing', () => {
      expect(() => requireAuthEnvClasses({ supabaseUrl: 'u', supabaseKey: 'k' }))
        .to.throw(/bearerSecret/)
        .and.satisfy((e) => e.code === 'EAUTH_ENV_MISSING');
      expect(() => loadAuthEnvConfig({}, KEY_MAP))
        .to.throw(/supabaseUrl/)
        .and.satisfy((e) => e.code === 'EAUTH_ENV_MISSING');
    });

    it('loads classes via injectable key map (names not frozen)', () => {
      const env = {
        TEST_SUPABASE_URL: FIXTURE_CONFIG.supabaseUrl,
        TEST_SUPABASE_KEY: FIXTURE_CONFIG.supabaseKey,
        TEST_BEARER_SECRET: FIXTURE_CONFIG.bearerSecret,
      };
      expect(loadAuthEnvConfig(env, KEY_MAP)).to.deep.equal(FIXTURE_CONFIG);
    });
  });

  describe('SupabaseAuthPort + memory double (t02/t03)', () => {
    it('creates and links user via Auth double (not custom users-table-as-Auth)', async () => {
      const proof = await makeProof();
      const port = createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'user-fixed-1',
      });
      expect(port.kind).to.equal('memory-double');
      expect(port.residual).to.equal(false);
      const first = await port.createOrLinkUser(proof);
      expect(first).to.deep.include({ userId: 'user-fixed-1', created: true });
      const second = await port.createOrLinkUser(proof);
      expect(second).to.deep.include({ userId: 'user-fixed-1', created: false });
    });

    it('labels live Supabase port as residual', async () => {
      const live = createLiveSupabaseAuthPortResidual();
      expect(live.residual).to.equal(true);
      expect(live.kind).to.equal('live-supabase-js');
      const proof = await makeProof();
      expect(() => live.createOrLinkUser(proof))
        .to.throw(/residual/i)
        .and.satisfy((e) => e.code === 'EAUTH_BIND_FAILED');
    });
  });

  describe('bind + bearer session (t04/t05/t06) — AC-A02/A04', () => {
    it('valid proof → bind → bearer usable until logout/expiry', async () => {
      const proof = await makeProof();
      const authPort = createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'supabase-uid-42',
      });
      const link = await bindAddressToAuthUser(
        { proof, authPort, config: FIXTURE_CONFIG },
        { nowMs: 1_700_000_100_000 },
      );
      expect(link.userId).to.equal('supabase-uid-42');
      expect(link.address).to.equal(proof.address);
      // ready for membership.userId (AUTH-03 writes)
      expect(link).to.have.property('userId');

      const sessions = new BearerSessionStore();
      const session = issueBearerSession(sessions, link, FIXTURE_CONFIG, {
        nowMs: 1_700_000_100_000,
        ttlMs: 60_000,
      });
      expect(session.token).to.match(/^[a-f0-9]+\.[a-f0-9]+$/);
      const ok = validateBearer(sessions, session.token, FIXTURE_CONFIG, {
        nowMs: 1_700_000_100_500,
      });
      expect(ok.userId).to.equal('supabase-uid-42');

      logoutBearer(sessions, session.token);
      expect(() => validateBearer(sessions, session.token, FIXTURE_CONFIG, {
        nowMs: 1_700_000_100_500,
      }))
        .to.throw(/logged out|unknown/i)
        .and.satisfy((e) => e.code === 'EAUTH_SESSION_INVALID');
    });

    it('rejects expired / missing bearer', async () => {
      const proof = await makeProof();
      const authPort = createMemorySupabaseAuthDouble();
      const link = await bindAddressToAuthUser({
        proof,
        authPort,
        config: FIXTURE_CONFIG,
      });
      const sessions = new BearerSessionStore();
      const session = issueBearerSession(sessions, link, FIXTURE_CONFIG, {
        nowMs: 1_000,
        ttlMs: 100,
      });
      expect(() => validateBearer(sessions, session.token, FIXTURE_CONFIG, { nowMs: 10_000 }))
        .to.throw(/expired/i)
        .and.satisfy((e) => e.code === 'EAUTH_SESSION_EXPIRED');
      expect(() => validateBearer(sessions, '', FIXTURE_CONFIG))
        .to.throw(/missing/i)
        .and.satisfy((e) => e.code === 'EAUTH_SESSION_MISSING');
    });

    it('refuse bind/session when env classes missing', async () => {
      const proof = await makeProof();
      const authPort = createMemorySupabaseAuthDouble();
      try {
        await bindAddressToAuthUser({
          proof,
          authPort,
          config: /** @type {any} */ ({ supabaseUrl: 'x' }),
        });
        expect.fail('should throw');
      } catch (e) {
        expect(e.code).to.equal('EAUTH_ENV_MISSING');
      }
      const sessions = new BearerSessionStore();
      expect(() => issueBearerSession(sessions, { userId: 'u', address: '0x1' }, /** @type {any} */ ({})))
        .to.throw()
        .and.satisfy((err) => err.code === 'EAUTH_ENV_MISSING');
    });

    it('does not store login private keys in session or link', async () => {
      const wallet = ethers.Wallet.createRandom();
      const store = new ChallengeStore();
      const nowMs = 1_700_000_000_000;
      const issued = issueChallenge(store, wallet.address, { nowMs, ttlMs: 120_000 });
      const signature = await wallet.signMessage(issued.message);
      const proof = verifyAddressProof(store, issued.challengeId, signature, { nowMs });
      const authPort = createMemorySupabaseAuthDouble();
      const link = await bindAddressToAuthUser({
        proof,
        authPort,
        config: FIXTURE_CONFIG,
      });
      const sessions = new BearerSessionStore();
      const session = issueBearerSession(sessions, link, FIXTURE_CONFIG, { nowMs });
      const blob = JSON.stringify({ link, session, proof, portUsers: [...authPort._users.entries()] });
      expect(blob).to.not.include(wallet.privateKey);
      expect(blob.toLowerCase()).to.not.match(/privatekey|private_key/);
    });
  });
});
