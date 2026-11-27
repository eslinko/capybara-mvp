'use strict';

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { createHostServer } = require('../../host/server');
const {
  createAuthRuntime,
  resolveBootstrapAddresses,
} = require('../../host/authHttp');
const { createMemorySupabaseAuthDouble } = require('../../packages/core/src/auth');
const { MembershipStore } = require('../../packages/core/src/membership');
const { InviteStore } = require('../../packages/core/src/invite');

const FIXTURE_AUTH = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-signing-secret',
};

/**
 * @param {import('http').Server} server
 * @param {{ method?: string, path: string, headers?: Record<string, string>, body?: object }} opts
 */
function requestJson(server, opts) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = opts.body ? JSON.stringify(opts.body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: opts.path,
        method: opts.method || 'GET',
        headers: {
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
          ...(opts.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, raw: data, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * @param {import('http').Server} server
 * @param {import('ethers').HDNodeWallet} wallet
 */
async function challengeVerifyProof(server, wallet) {
  const challenge = await requestJson(server, {
    method: 'POST',
    path: '/auth/challenge',
    body: { address: wallet.address },
  });
  expect(challenge.status).to.equal(200);
  const signature = await wallet.signMessage(challenge.json.message);
  const verified = await requestJson(server, {
    method: 'POST',
    path: '/auth/verify',
    body: {
      challengeId: challenge.json.challengeId,
      signature,
    },
  });
  expect(verified.status).to.equal(200);
  expect(verified.json.proof).to.be.an('object');
  expect(verified.json.proof.address.toLowerCase()).to.equal(
    wallet.address.toLowerCase(),
  );
  return verified.json.proof;
}

describe('host identity HTTP bootstrap (EDGE-02 / AC-I04)', () => {
  describe('env defaults (t02)', () => {
    it('keeps CAPY_POOL_ADDRESS distinct from PARENT_ADDRESS', () => {
      const env = {
        CAPY_POOL_ADDRESS: '0x1111111111111111111111111111111111111111',
        PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
      };
      const resolved = resolveBootstrapAddresses(env, {});
      expect(resolved.poolAddress).to.equal(env.CAPY_POOL_ADDRESS);
      expect(resolved.parentAddress).to.equal(env.PARENT_ADDRESS);
      expect(resolved.poolAddress).to.not.equal(resolved.parentAddress);
    });

    it('allows equal hex without merging fields', () => {
      const same = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const resolved = resolveBootstrapAddresses(
        { CAPY_POOL_ADDRESS: same, PARENT_ADDRESS: same },
        {},
      );
      expect(resolved.poolAddress).to.equal(same);
      expect(resolved.parentAddress).to.equal(same);
    });

    it('body overrides do not collapse env field names', () => {
      const resolved = resolveBootstrapAddresses(
        {
          CAPY_POOL_ADDRESS: '0x1111111111111111111111111111111111111111',
          PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
        },
        { poolAddress: '0x3333333333333333333333333333333333333333' },
      );
      expect(resolved.poolAddress).to.equal(
        '0x3333333333333333333333333333333333333333',
      );
      expect(resolved.parentAddress).to.equal(
        '0x2222222222222222222222222222222222222222',
      );
    });
  });

  describe('fail-closed (t01)', () => {
    it('POST /auth/bootstrap → 503 without auth env', (done) => {
      const server = createHostServer({
        env: {
          CAPY_POOL_ADDRESS: '0x1111111111111111111111111111111111111111',
          PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
        },
      });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: '/auth/bootstrap',
            body: {
              poolProof: { address: '0x1111111111111111111111111111111111111111' },
              parentProof: { address: '0x2222222222222222222222222222222222222222' },
            },
          });
          expect(res.status).to.equal(503);
          expect(res.json.error).to.equal('EAUTH_ENV_MISSING');
          const health = await requestJson(server, { path: '/health' });
          expect(health.status).to.equal(200);
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });
  });

  describe('HTTP bootstrap dual proofs (t01/t03/t04)', () => {
    it('bootstraps same pool+parent via challenge/verify proofs + env defaults', (done) => {
      const wallet = ethers.Wallet.createRandom();
      const env = {
        ...FIXTURE_AUTH,
        CAPY_POOL_ADDRESS: wallet.address,
        PARENT_ADDRESS: wallet.address,
      };
      const membershipStore = new MembershipStore();
      const runtime = createAuthRuntime(env, {
        nowMs: 1_700_000_000_000,
        membershipStore,
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({ authRuntime: runtime, env });

      server.listen(0, '127.0.0.1', async () => {
        try {
          const proof = await challengeVerifyProof(server, wallet);
          const boot = await requestJson(server, {
            method: 'POST',
            path: '/auth/bootstrap',
            body: {
              poolProof: proof,
              parentProof: proof,
            },
          });
          expect(boot.status).to.equal(200);
          expect(boot.json.ok).to.equal(true);
          expect(boot.json.bootstrapped).to.equal(true);
          expect(boot.json.sameAddress).to.equal(true);
          expect(boot.json.familyId).to.match(/^fam-/);
          expect(boot.json.founderRole).to.equal('parent');
          expect(membershipStore.isBootstrapped(boot.json.familyId)).to.equal(
            true,
          );
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('bootstraps different pool vs parent addresses (AC-I04)', (done) => {
      const poolWallet = ethers.Wallet.createRandom();
      const parentWallet = ethers.Wallet.createRandom();
      const env = {
        ...FIXTURE_AUTH,
        CAPY_POOL_ADDRESS: poolWallet.address,
        PARENT_ADDRESS: parentWallet.address,
      };
      const runtime = createAuthRuntime(env, {
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(), nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const server = createHostServer({ authRuntime: runtime, env });

      server.listen(0, '127.0.0.1', async () => {
        try {
          const poolProof = await challengeVerifyProof(server, poolWallet);
          const parentProof = await challengeVerifyProof(server, parentWallet);
          const boot = await requestJson(server, {
            method: 'POST',
            path: '/auth/bootstrap',
            body: { poolProof, parentProof },
          });
          expect(boot.status).to.equal(200);
          expect(boot.json.sameAddress).to.equal(false);
          expect(boot.json.poolAddress.toLowerCase()).to.equal(
            poolWallet.address.toLowerCase(),
          );
          expect(boot.json.parentAddress.toLowerCase()).to.equal(
            parentWallet.address.toLowerCase(),
          );
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('rejects second bootstrap on live family (core replay)', (done) => {
      const wallet = ethers.Wallet.createRandom();
      const env = {
        ...FIXTURE_AUTH,
        CAPY_POOL_ADDRESS: wallet.address,
        PARENT_ADDRESS: wallet.address,
      };
      const membershipStore = new MembershipStore();
      const runtime = createAuthRuntime(env, {
        nowMs: 1_700_000_000_000,
        membershipStore,
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({ authRuntime: runtime, env });

      server.listen(0, '127.0.0.1', async () => {
        try {
          const proof1 = await challengeVerifyProof(server, wallet);
          const first = await requestJson(server, {
            method: 'POST',
            path: '/auth/bootstrap',
            body: {
              familyId: 'fam-http-replay',
              poolProof: proof1,
              parentProof: proof1,
            },
          });
          expect(first.status).to.equal(200);

          const proof2 = await challengeVerifyProof(server, wallet);
          const second = await requestJson(server, {
            method: 'POST',
            path: '/auth/bootstrap',
            body: {
              familyId: 'fam-http-replay',
              poolProof: proof2,
              parentProof: proof2,
            },
          });
          expect(second.status).to.equal(409);
          expect(second.json.error).to.equal('EAUTH_BOOTSTRAP_REPLAY');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('rejects missing proofs (AC-I04)', (done) => {
      const wallet = ethers.Wallet.createRandom();
      const env = {
        ...FIXTURE_AUTH,
        CAPY_POOL_ADDRESS: wallet.address,
        PARENT_ADDRESS: wallet.address,
      };
      const server = createHostServer({
        authRuntime: createAuthRuntime(env, {
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(), nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() }),
        env,
      });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: '/auth/bootstrap',
            body: {},
          });
          expect(res.status).to.equal(400);
          expect(res.json.error).to.equal('EAUTH_BOOTSTRAP_MISSING_PROOF');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });
  });

  describe('honesty (AC-I06)', () => {
    it('documents unit harness ≠ Phase 2 Done', () => {
      const runtime = createAuthRuntime(FIXTURE_AUTH, { membershipStore: new MembershipStore(), inviteStore: new InviteStore() });
      expect(runtime.authPort.kind).to.equal('live-supabase-js');
      expect(runtime.authPort.residual).to.equal(false);
      expect(runtime.membershipStore).to.be.instanceOf(MembershipStore);
    });
  });
});
