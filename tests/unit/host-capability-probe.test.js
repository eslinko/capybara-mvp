'use strict';

const http = require('http');
const { expect } = require('chai');

const { createHostServer } = require('../../host/server');
const { createAuthRuntime } = require('../../host/authHttp');
const {
  PROFILE_SELF_PATH,
  PROFILE_SELF_ID,
} = require('../../host/capabilityProbe');
const { MembershipStore } = require('../../packages/core/src/membership');
const {
  BearerSessionStore,
  issueBearerSession,
} = require('../../packages/core/src/auth');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-signing-secret',
};

const FIXTURE_CONFIG = {
  supabaseUrl: FIXTURE_ENV.SUPABASE_URL,
  supabaseKey: FIXTURE_ENV.SUPABASE_SECRET_KEY,
  bearerSecret: FIXTURE_ENV.CAPY_BEARER_SECRET,
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

function seedParentMembership() {
  const store = new MembershipStore();
  store.createFamily({ id: 'fam-probe' });
  const parent = store.addMembership({
    id: 'm-parent-probe',
    familyId: 'fam-probe',
    role: 'parent',
    address: '0xparentprobe0000000000000000000000000001',
    userId: 'user-parent-probe',
  });
  return { store, parent };
}

describe('host capability probe profile.self (EDGE-03)', () => {
  describe('route stamp (t01)', () => {
    it('exposes /v1/capabilities/profile.self only (not CRUD catalog)', () => {
      expect(PROFILE_SELF_PATH).to.equal('/v1/capabilities/profile.self');
      expect(PROFILE_SELF_ID).to.equal('profile.self');
    });
  });

  describe('unauth deny (t02/AC-I01)', () => {
    it('GET probe without bearer → 401 EAUTH_DUAL_DENY', (done) => {
      const { store } = seedParentMembership();
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore: store,
        nowMs: 1_700_000_000_000,
      });
      const server = createHostServer({ authRuntime: runtime, env: FIXTURE_ENV });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, { path: PROFILE_SELF_PATH });
          expect(res.status).to.equal(401);
          expect(res.json.ok).to.equal(false);
          expect(res.json.error).to.equal('EAUTH_DUAL_DENY');
          const health = await requestJson(server, { path: '/health' });
          expect(health.status).to.equal(200);
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('fail-closed without auth env → 503', (done) => {
      const server = createHostServer({ env: {} });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, { path: PROFILE_SELF_PATH });
          expect(res.status).to.equal(503);
          expect(res.json.error).to.equal('EAUTH_ENV_MISSING');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });
  });

  describe('authed allow + ignore client role (t02/t03/AC-I02)', () => {
    it('Bearer + membership → RoleGate allow with minimal echo', (done) => {
      const { store, parent } = seedParentMembership();
      const sessions = new BearerSessionStore();
      const nowMs = 1_700_000_000_000;
      const session = issueBearerSession(
        sessions,
        { userId: parent.userId, address: parent.address },
        FIXTURE_CONFIG,
        { nowMs, ttlMs: 120_000 },
      );
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore: store,
        sessionStore: sessions,
        nowMs,
      });
      const server = createHostServer({ authRuntime: runtime, env: FIXTURE_ENV });

      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: PROFILE_SELF_PATH,
            headers: { Authorization: `Bearer ${session.token}` },
            body: {
              clientClaimedRole: 'child',
              role: 'child',
              familyId: 'fam-probe',
            },
          });
          expect(res.status).to.equal(200);
          expect(res.json.ok).to.equal(true);
          expect(res.json.capabilityId).to.equal('profile.self');
          expect(res.json.role).to.equal('parent'); // membership role, not client claim
          expect(res.json.membershipId).to.equal(parent.id);
          expect(res.json.familyId).to.equal('fam-probe');
          expect(res.json.userId).to.equal(parent.userId);
          expect(Object.keys(res.json).sort()).to.deep.equal(
            [
              'address',
              'capabilityId',
              'familyId',
              'membershipId',
              'ok',
              'role',
              'userId',
            ].sort(),
          );
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });
  });

  describe('honesty', () => {
    it('documents unit harness ≠ Phase 2 Done / not CRUD API', () => {
      expect(PROFILE_SELF_PATH.startsWith('/v1/capabilities/')).to.equal(true);
      expect(PROFILE_SELF_PATH.includes('families')).to.equal(false);
    });
  });
});
