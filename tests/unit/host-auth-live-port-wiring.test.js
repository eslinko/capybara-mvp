'use strict';

const { MembershipStore } = require('../../packages/core/src/membership');
const { InviteStore } = require('../../packages/core/src/invite');

const http = require('http');
const { expect } = require('chai');

const {
  createAuthRuntime,
  requireRuntimeConfig,
  sanitizePublicAuthMessage,
} = require('../../host/authHttp');
const { createHostServer } = require('../../host/server');
const { createMemorySupabaseAuthDouble } = require('../../packages/core/src/auth');
const { healthPayload } = require('../../host/health');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'super-secret-service-role-key',
  CAPY_BEARER_SECRET: 'super-secret-bearer-hmac-key',
};

describe('host / live Auth port wiring (SBPORT-02)', () => {
  describe('selection rule (t01/AC-S01)', () => {
    it('config Present → live port (not silent memory)', () => {
      const runtime = createAuthRuntime(FIXTURE_ENV, { membershipStore: new MembershipStore(), inviteStore: new InviteStore() });
      expect(runtime.configError).to.equal(null);
      expect(runtime.config).to.be.an('object');
      expect(runtime.authPort.kind).to.equal('live-supabase-js');
      expect(runtime.authPort.residual).to.equal(false);
    });

    it('opts.authPort inject wins (unit memory double)', () => {
      const mem = createMemorySupabaseAuthDouble();
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(), authPort: mem });
      expect(runtime.authPort).to.equal(mem);
      expect(runtime.authPort.kind).to.equal('memory-double');
    });

    it('createClient inject builds live factory when package Absent', async () => {
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(),
        createClient: () => ({
          auth: {
            admin: {
              async createUser() {
                return { data: { user: { id: 'wired-uid' } }, error: null };
              },
            },
          },
        }),
      });
      expect(runtime.authPort.kind).to.equal('live-supabase-js');
      const link = await runtime.authPort.createOrLinkUser({
        address: '0x0000000000000000000000000000000000000001',
        challengeId: 'c1',
        verifiedAt: new Date().toISOString(),
        verifiedAtMs: Date.now(),
      });
      expect(link.userId).to.equal('wired-uid');
      expect(link.created).to.equal(true);
    });
  });

  describe('fail-closed (t02/AC-S03)', () => {
    it('missing env → configError + requireRuntimeConfig throws; no memory default', () => {
      const runtime = createAuthRuntime({}, { membershipStore: new MembershipStore(), inviteStore: new InviteStore() });
      expect(runtime.config).to.equal(null);
      expect(runtime.configError).to.be.ok;
      expect(runtime.configError.code).to.equal('EAUTH_ENV_MISSING');
      expect(runtime.authPort.kind).to.equal('live-supabase-js');
      expect(() => requireRuntimeConfig(runtime))
        .to.throw(/supabaseUrl|Auth env/i)
        .and.satisfy((e) => e.code === 'EAUTH_ENV_MISSING');
      expect(() => runtime.authPort.createOrLinkUser({ address: '0x1' }))
        .to.throw()
        .and.satisfy((e) => e.code === 'EAUTH_ENV_MISSING');
    });

    it('SERVICE_ROLE_KEY alias still loads config → live selection', () => {
      const runtime = createAuthRuntime({
        SUPABASE_URL: FIXTURE_ENV.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: FIXTURE_ENV.SUPABASE_SECRET_KEY,
        CAPY_BEARER_SECRET: FIXTURE_ENV.CAPY_BEARER_SECRET,
      });
      expect(runtime.config).to.be.an('object');
      expect(runtime.authPort.kind).to.equal('live-supabase-js');
    });
  });

  describe('secret hygiene (t03/AC-S04)', () => {
    it('health payload never includes secrets', () => {
      const payload = healthPayload();
      const raw = JSON.stringify(payload);
      expect(raw).to.not.include(FIXTURE_ENV.SUPABASE_SECRET_KEY);
      expect(raw).to.not.include(FIXTURE_ENV.CAPY_BEARER_SECRET);
      expect(payload).to.deep.equal({ ok: true });
    });

    it('sanitizePublicAuthMessage redacts config secrets', () => {
      const runtime = createAuthRuntime(FIXTURE_ENV, { membershipStore: new MembershipStore(), inviteStore: new InviteStore() });
      const dirty = `fail ${runtime.config.supabaseKey} at ${runtime.config.supabaseUrl} with ${runtime.config.bearerSecret}`;
      const clean = sanitizePublicAuthMessage(dirty, runtime.config);
      expect(clean).to.not.include(FIXTURE_ENV.SUPABASE_SECRET_KEY);
      expect(clean).to.not.include(FIXTURE_ENV.CAPY_BEARER_SECRET);
      expect(clean).to.include('[redacted]');
    });

    it('auth error JSON does not echo secret key values', (done) => {
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(),
        createClient: () => ({
          auth: {
            admin: {
              async createUser() {
                throw Object.assign(
                  new Error(
                    `Admin failed with key=${FIXTURE_ENV.SUPABASE_SECRET_KEY}`,
                  ),
                  { code: 'EAUTH_BIND_FAILED' },
                );
              },
            },
          },
        }),
      });
      // Force bind failure path via verify requires challenge — instead hit createOrLink via injected throw in map
      // Use tryHandleAuthRequest with challenge after patching authPort to throw with secret in message
      runtime.authPort = {
        kind: 'live-supabase-js',
        residual: false,
        async createOrLinkUser() {
          const err = new Error(
            `bind leaked ${FIXTURE_ENV.SUPABASE_SECRET_KEY}`,
          );
          err.code = 'EAUTH_BIND_FAILED';
          throw err;
        },
      };

      const server = createHostServer({ authRuntime: runtime, env: FIXTURE_ENV });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const { port } = server.address();
          // Minimal challenge then verify to trigger bind
          const { ethers } = require('ethers');
          const wallet = ethers.Wallet.createRandom();
          const challengeBody = JSON.stringify({ address: wallet.address });
          const challengeRes = await new Promise((resolve, reject) => {
            const req = http.request(
              {
                hostname: '127.0.0.1',
                port,
                path: '/auth/challenge',
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(challengeBody),
                },
              },
              (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () =>
                  resolve({
                    status: res.statusCode,
                    json: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                  }),
                );
              },
            );
            req.on('error', reject);
            req.write(challengeBody);
            req.end();
          });
          expect(challengeRes.status).to.equal(200);
          const signature = await wallet.signMessage(challengeRes.json.message);
          const verifyBody = JSON.stringify({
            challengeId: challengeRes.json.challengeId,
            signature,
          });
          const verifyRes = await new Promise((resolve, reject) => {
            const req = http.request(
              {
                hostname: '127.0.0.1',
                port,
                path: '/auth/verify',
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(verifyBody),
                },
              },
              (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                  const body = Buffer.concat(chunks).toString('utf8');
                  resolve({
                    status: res.statusCode,
                    body,
                    json: JSON.parse(body),
                  });
                });
              },
            );
            req.on('error', reject);
            req.write(verifyBody);
            req.end();
          });
          expect(verifyRes.status).to.equal(502);
          expect(verifyRes.body).to.not.include(FIXTURE_ENV.SUPABASE_SECRET_KEY);
          expect(verifyRes.json.message).to.include('[redacted]');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });
  });
});
