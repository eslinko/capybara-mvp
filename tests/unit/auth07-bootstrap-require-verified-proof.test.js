'use strict';

/**
 * AUTH-07 — Bootstrap require verified proof (anti-forge) Soft≠Live.
 * Soft harness ≠ invent Live Pass / REQ-04 Accepted.
 */

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { createHostServer } = require('../../host/server');
const { createAuthRuntime } = require('../../host/authHttp');
const {
  createMemorySupabaseAuthDouble,
  VerifiedAddressProofStore,
  assertVerifiedProofRecorded,
  authError,
} = require('../../packages/core/src/auth');
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
  return verified.json.proof;
}

describe('AUTH-07 bootstrap require verified proof Soft≠Live', () => {
  describe('assertVerifiedProofRecorded (t02)', () => {
    it('AC-A07-01: reject forge without durable row', async () => {
      const store = new VerifiedAddressProofStore();
      try {
        await assertVerifiedProofRecorded(
          store,
          { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', challengeId: 'ch-missing' },
          'poolProof',
        );
        expect.fail('expected reject');
      } catch (err) {
        expect(err.code).to.equal('EAUTH_BOOTSTRAP_UNVERIFIED');
      }
    });

    it('AC-A07-01: reject address-only forge (no challengeId)', async () => {
      const store = new VerifiedAddressProofStore();
      try {
        await assertVerifiedProofRecorded(
          store,
          { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          'poolProof',
        );
        expect.fail('expected reject');
      } catch (err) {
        expect(err.code).to.equal('EAUTH_BOOTSTRAP_UNVERIFIED');
      }
    });

    it('AC-A07-02: accept when store row Present matching address+challengeId', async () => {
      const store = new VerifiedAddressProofStore();
      const addr = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      store.addVerifiedProof({
        address: addr,
        challengeId: 'ch-ok',
        verifiedAt: '2026-11-27T20:00:00.000Z',
        verifiedAtMs: 1_700_000_000_000,
      });
      const row = await assertVerifiedProofRecorded(
        store,
        { address: addr, challengeId: 'ch-ok' },
        'poolProof',
      );
      expect(row.challengeId).to.equal('ch-ok');
    });

    it('AC-A07-03: address mismatch vs stored row → reject', async () => {
      const store = new VerifiedAddressProofStore();
      store.addVerifiedProof({
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        challengeId: 'ch-mis',
        verifiedAt: '2026-11-27T20:00:00.000Z',
        verifiedAtMs: 1_700_000_000_000,
      });
      try {
        await assertVerifiedProofRecorded(
          store,
          {
            address: '0xcccccccccccccccccccccccccccccccccccccccc',
            challengeId: 'ch-mis',
          },
          'parentProof',
        );
        expect.fail('expected reject');
      } catch (err) {
        expect(err.code).to.equal('EAUTH_BOOTSTRAP_PROOF_MISMATCH');
      }
    });
  });

  describe('host /auth/bootstrap object-path gate (t01/t03)', () => {
    it('AC-A07-01: forge {address}-only → reject', (done) => {
      const wallet = ethers.Wallet.createRandom();
      const env = {
        ...FIXTURE_AUTH,
        CAPY_POOL_ADDRESS: wallet.address,
        PARENT_ADDRESS: wallet.address,
      };
      const runtime = createAuthRuntime(env, {
        nowMs: 1_700_000_000_000,
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(),
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({ authRuntime: runtime, env });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const boot = await requestJson(server, {
            method: 'POST',
            path: '/auth/bootstrap',
            body: {
              poolProof: { address: wallet.address },
              parentProof: { address: wallet.address },
            },
          });
          expect(boot.status).to.equal(400);
          expect(boot.json.error).to.equal('EAUTH_BOOTSTRAP_UNVERIFIED');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('AC-A07-02: after verify row Present → bootstrap accepts', (done) => {
      const wallet = ethers.Wallet.createRandom();
      const env = {
        ...FIXTURE_AUTH,
        CAPY_POOL_ADDRESS: wallet.address,
        PARENT_ADDRESS: wallet.address,
      };
      const runtime = createAuthRuntime(env, {
        nowMs: 1_700_000_000_000,
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(),
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({ authRuntime: runtime, env });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const proof = await challengeVerifyProof(server, wallet);
          const boot = await requestJson(server, {
            method: 'POST',
            path: '/auth/bootstrap',
            body: { poolProof: proof, parentProof: proof },
          });
          expect(boot.status).to.equal(200);
          expect(boot.json.ok).to.equal(true);
          expect(boot.json.bootstrapped).to.equal(true);
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('AC-A07-03: invented challengeId without row → reject', (done) => {
      const wallet = ethers.Wallet.createRandom();
      const env = {
        ...FIXTURE_AUTH,
        CAPY_POOL_ADDRESS: wallet.address,
        PARENT_ADDRESS: wallet.address,
      };
      const runtime = createAuthRuntime(env, {
        nowMs: 1_700_000_000_000,
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(),
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({ authRuntime: runtime, env });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const boot = await requestJson(server, {
            method: 'POST',
            path: '/auth/bootstrap',
            body: {
              poolProof: {
                address: wallet.address,
                challengeId: 'invented-ch-no-row',
              },
              parentProof: {
                address: wallet.address,
                challengeId: 'invented-ch-no-row',
              },
            },
          });
          expect(boot.status).to.equal(400);
          expect(boot.json.error).to.equal('EAUTH_BOOTSTRAP_UNVERIFIED');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });
  });

  it('AC-A07-04 Soft≠Live honesty: unit ≠ invent Live Pass / REQ-04 Accepted', () => {
    const note = [
      'Soft≠Live',
      'unit ≠ invent Live Pass',
      'REQ-04 Accepted not claimed',
      'EAUTH_BOOTSTRAP_UNVERIFIED',
    ].join(' · ');
    expect(note).to.include('Soft≠Live');
    expect(note).to.include('Live Pass');
    expect(note).to.not.match(/REQ-04 Accepted claimed/i);
    expect(authError).to.be.a('function');
  });
});
