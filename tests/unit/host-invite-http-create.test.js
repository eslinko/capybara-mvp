'use strict';

const http = require('http');
const { expect } = require('chai');

const { createHostServer } = require('../../host/server');
const { createAuthRuntime } = require('../../host/authHttp');
const {
  CREATE_INVITE_PATH,
} = require('../../host/inviteHttp');
const { MembershipStore } = require('../../packages/core/src/membership');
const { InviteStore } = require('../../packages/core/src/invite');
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

const PARENT_ADDR = '0xparentinvitehttp000000000000000000000001';
const CHILD_ADDR = '0xchildinvitehttp0000000000000000000000001';
const COPARENT_ADDR = '0xcoparentinvitehttp0000000000000000000002';
const NOW = 1_700_000_000_000;

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

function seedBootstrappedFamily(opts = {}) {
  const bootstrapped = opts.bootstrapped !== false;
  const membershipStore = new MembershipStore();
  const inviteStore = new InviteStore();
  membershipStore.createFamily({ id: 'fam-inv-http' });
  if (bootstrapped) {
    membershipStore.markBootstrapped('fam-inv-http');
  }
  const parent = membershipStore.addMembership({
    id: 'm-parent-inv-http',
    familyId: 'fam-inv-http',
    role: 'parent',
    address: PARENT_ADDR,
    userId: 'uid-parent-inv-http',
  });
  return { membershipStore, inviteStore, parent };
}

function issueParentBearer(membershipStore, parent) {
  const sessions = new BearerSessionStore();
  const session = issueBearerSession(
    sessions,
    { userId: parent.userId, address: parent.address },
    FIXTURE_CONFIG,
    { nowMs: NOW, ttlMs: 120_000 },
  );
  return { sessions, token: session.token };
}

describe('host HTTP createInvite (INV-04 / G3)', () => {
  describe('runtime mount (t01)', () => {
    it('createAuthRuntime mounts InviteStore by default', () => {
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(), nowMs: NOW });
      expect(runtime.inviteStore).to.be.ok;
      expect(runtime.inviteStore.addInvite).to.be.a('function');
    });

    it('exposes POST /auth/invite path stamp (no opaque token route)', () => {
      expect(CREATE_INVITE_PATH).to.equal('/auth/invite');
    });
  });

  describe('parent create + co-parent + lookup (t02/t03/AC-G3-01/03/04)', () => {
    it('Bearer parent creates open child invite; findable by to', (done) => {
      const { membershipStore, inviteStore, parent } = seedBootstrappedFamily();
      const { sessions, token } = issueParentBearer(membershipStore, parent);
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore,
        inviteStore,
        sessionStore: sessions,
        nowMs: NOW,
      });
      const server = createHostServer({ authRuntime: runtime, env: FIXTURE_ENV });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: CREATE_INVITE_PATH,
            headers: { Authorization: `Bearer ${token}` },
            body: {
              familyId: 'fam-inv-http',
              to: CHILD_ADDR,
              role: 'child',
              membershipId: parent.id,
            },
          });
          expect(res.status).to.equal(200);
          expect(res.json.ok).to.equal(true);
          expect(res.json.invite.status).to.equal('open');
          expect(res.json.invite.role).to.equal('child');
          expect(res.json.invite.to).to.equal(CHILD_ADDR.toLowerCase());
          expect(res.json.openForToId).to.equal(res.json.invite.id);
          expect(inviteStore.listOpenByToInFamily('fam-inv-http', CHILD_ADDR)).to.have.length(1);
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('same path creates co-parent invite role=parent (AC-M04 / AC-G3-03)', (done) => {
      const { membershipStore, inviteStore, parent } = seedBootstrappedFamily();
      const { sessions, token } = issueParentBearer(membershipStore, parent);
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore,
        inviteStore,
        sessionStore: sessions,
        nowMs: NOW,
      });
      const server = createHostServer({ authRuntime: runtime, env: FIXTURE_ENV });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: CREATE_INVITE_PATH,
            headers: { Authorization: `Bearer ${token}` },
            body: {
              familyId: 'fam-inv-http',
              to: COPARENT_ADDR,
              role: 'parent',
              membershipId: parent.id,
            },
          });
          expect(res.status).to.equal(200);
          expect(res.json.invite.role).to.equal('parent');
          expect(res.json.invite.to).to.equal(COPARENT_ADDR.toLowerCase());
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });
  });

  describe('fail-closed (t04/AC-G3-02)', () => {
    it('unauthenticated → 401', (done) => {
      const { membershipStore, inviteStore } = seedBootstrappedFamily();
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore,
        inviteStore,
        nowMs: NOW,
      });
      const server = createHostServer({ authRuntime: runtime, env: FIXTURE_ENV });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: CREATE_INVITE_PATH,
            body: {
              familyId: 'fam-inv-http',
              to: CHILD_ADDR,
              role: 'child',
            },
          });
          expect(res.status).to.equal(401);
          expect(res.json.error).to.equal('EAUTH_DUAL_DENY');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('non-parent membership → 403', (done) => {
      const { membershipStore, inviteStore } = seedBootstrappedFamily();
      const child = membershipStore.addMembership({
        id: 'm-child-inv-http',
        familyId: 'fam-inv-http',
        role: 'child',
        address: '0xchildmemberinvitehttp000000000000000001',
        userId: 'uid-child-inv-http',
      });
      const sessions = new BearerSessionStore();
      const session = issueBearerSession(
        sessions,
        { userId: child.userId, address: child.address },
        FIXTURE_CONFIG,
        { nowMs: NOW, ttlMs: 120_000 },
      );
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore,
        inviteStore,
        sessionStore: sessions,
        nowMs: NOW,
      });
      const server = createHostServer({ authRuntime: runtime, env: FIXTURE_ENV });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: CREATE_INVITE_PATH,
            headers: { Authorization: `Bearer ${session.token}` },
            body: {
              familyId: 'fam-inv-http',
              to: CHILD_ADDR,
              role: 'child',
              membershipId: child.id,
            },
          });
          expect(res.status).to.equal(403);
          expect(res.json.error).to.equal('EROLEGATE_DENY');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('non-bootstrapped family → 403 EINVITE_NOT_BOOTSTRAPPED', (done) => {
      const { membershipStore, inviteStore, parent } = seedBootstrappedFamily({
        bootstrapped: false,
      });
      const { sessions, token } = issueParentBearer(membershipStore, parent);
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore,
        inviteStore,
        sessionStore: sessions,
        nowMs: NOW,
      });
      const server = createHostServer({ authRuntime: runtime, env: FIXTURE_ENV });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: CREATE_INVITE_PATH,
            headers: { Authorization: `Bearer ${token}` },
            body: {
              familyId: 'fam-inv-http',
              to: CHILD_ADDR,
              role: 'child',
              membershipId: parent.id,
            },
          });
          expect(res.status).to.equal(403);
          expect(res.json.error).to.equal('EINVITE_NOT_BOOTSTRAPPED');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('empty to → 400 EINVITE_EMPTY_TO', (done) => {
      const { membershipStore, inviteStore, parent } = seedBootstrappedFamily();
      const { sessions, token } = issueParentBearer(membershipStore, parent);
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        membershipStore,
        inviteStore,
        sessionStore: sessions,
        nowMs: NOW,
      });
      const server = createHostServer({ authRuntime: runtime, env: FIXTURE_ENV });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: CREATE_INVITE_PATH,
            headers: { Authorization: `Bearer ${token}` },
            body: {
              familyId: 'fam-inv-http',
              to: '',
              role: 'child',
              membershipId: parent.id,
            },
          });
          expect(res.status).to.equal(400);
          expect(res.json.error).to.equal('EINVITE_EMPTY_TO');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('missing auth env → 503; health stays open', (done) => {
      const { membershipStore, inviteStore } = seedBootstrappedFamily();
      const runtime = createAuthRuntime({}, {
        membershipStore,
        inviteStore,
        nowMs: NOW,
      });
      const server = createHostServer({ authRuntime: runtime, env: {} });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: CREATE_INVITE_PATH,
            body: { familyId: 'fam-inv-http', to: CHILD_ADDR, role: 'child' },
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
});
