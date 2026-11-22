'use strict';

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { createHostServer } = require('../../host/server');
const {
  loadHostAuthEnvConfig,
  createAuthRuntime,
  PRODUCTION_AUTH_KEY_MAP,
} = require('../../host/authHttp');
const { healthPayload, handleHostRequest } = require('../../host/health');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-signing-secret',
};

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers || {};
    },
    end(chunk) {
      this.body = chunk == null ? '' : String(chunk);
    },
  };
}

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

describe('host identity HTTP edge (EDGE-01)', () => {
  describe('env keyMap fail-closed (t04)', () => {
    it('loads production keyMap classes', () => {
      expect(loadHostAuthEnvConfig(FIXTURE_ENV)).to.deep.equal({
        supabaseUrl: FIXTURE_ENV.SUPABASE_URL,
        supabaseKey: FIXTURE_ENV.SUPABASE_SECRET_KEY,
        bearerSecret: FIXTURE_ENV.CAPY_BEARER_SECRET,
      });
      expect(PRODUCTION_AUTH_KEY_MAP.supabaseKey).to.equal('SUPABASE_SECRET_KEY');
    });

    it('aliases SUPABASE_SERVICE_ROLE_KEY when secret key unset', () => {
      const cfg = loadHostAuthEnvConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'alias-key',
        CAPY_BEARER_SECRET: 'bearer',
      });
      expect(cfg.supabaseKey).to.equal('alias-key');
    });

    it('fail-closed when required auth env missing', () => {
      expect(() => loadHostAuthEnvConfig({}))
        .to.throw(/supabaseUrl|Missing required/)
        .and.satisfy((e) => e.code === 'EAUTH_ENV_MISSING');
    });
  });

  describe('health coexistence (t01/AC-I05)', () => {
    it('GET /health still minimal ok without auth env', (done) => {
      const server = createHostServer({ env: {} });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, { path: '/health' });
          expect(res.status).to.equal(200);
          expect(res.json).to.deep.equal({ ok: true });
          expect(res.raw).to.not.match(/SUPABASE|BEARER|SECRET|PRIVATE/i);
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });

    it('health handler never echoes env secrets', () => {
      const payload = healthPayload();
      expect(payload).to.deep.equal({ ok: true });
      const res = mockRes();
      handleHostRequest({ method: 'GET', url: '/health' }, res);
      expect(res.body).to.not.match(/SUPABASE|CAPY_BEARER|PRIVATE_KEY/i);
    });
  });

  describe('auth routes fail-closed without env (t04)', () => {
    it('POST /auth/challenge → 503 EAUTH_ENV_MISSING', (done) => {
      const server = createHostServer({ env: {} });
      server.listen(0, '127.0.0.1', async () => {
        try {
          const res = await requestJson(server, {
            method: 'POST',
            path: '/auth/challenge',
            body: { address: '0x0000000000000000000000000000000000000001' },
          });
          expect(res.status).to.equal(503);
          expect(res.json.ok).to.equal(false);
          expect(res.json.error).to.equal('EAUTH_ENV_MISSING');
          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });
  });

  describe('challenge → verify → session → logout (t02/t03/AC-I03)', () => {
    it('full Bearer flow on same createHostServer process', (done) => {
      const nowMs = 1_700_000_000_000;
      const runtime = createAuthRuntime(FIXTURE_ENV, { nowMs });
      const server = createHostServer({ authRuntime: runtime });
      const wallet = ethers.Wallet.createRandom();

      server.listen(0, '127.0.0.1', async () => {
        try {
          const challenge = await requestJson(server, {
            method: 'POST',
            path: '/auth/challenge',
            body: { address: wallet.address },
          });
          expect(challenge.status).to.equal(200);
          expect(challenge.json.ok).to.equal(true);
          expect(challenge.json.challengeId).to.be.a('string');
          expect(challenge.json.message).to.be.a('string');

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
          expect(verified.json.ok).to.equal(true);
          expect(verified.json.token).to.match(/^[a-f0-9]+\.[a-f0-9]+$/);
          expect(verified.json.address.toLowerCase()).to.equal(
            wallet.address.toLowerCase(),
          );

          const session = await requestJson(server, {
            method: 'GET',
            path: '/auth/session',
            headers: { Authorization: `Bearer ${verified.json.token}` },
          });
          expect(session.status).to.equal(200);
          expect(session.json.ok).to.equal(true);
          expect(session.json.userId).to.be.a('string');

          const logout = await requestJson(server, {
            method: 'POST',
            path: '/auth/logout',
            headers: { Authorization: `Bearer ${verified.json.token}` },
          });
          expect(logout.status).to.equal(200);
          expect(logout.json.loggedOut).to.equal(true);

          const after = await requestJson(server, {
            method: 'GET',
            path: '/auth/session',
            headers: { Authorization: `Bearer ${verified.json.token}` },
          });
          expect(after.status).to.equal(401);
          expect(after.json.error).to.equal('EAUTH_SESSION_INVALID');

          // health still ok on same server
          const health = await requestJson(server, { path: '/health' });
          expect(health.status).to.equal(200);
          expect(health.json).to.deep.equal({ ok: true });

          server.close(() => done());
        } catch (err) {
          server.close(() => done(err));
        }
      });
    });
  });

  describe('honesty (t05/AC-I06)', () => {
    it('documents that unit harness ≠ Phase 2 Done claim', () => {
      // Structural marker: EDGE-01 unit path exists; live DualAuth/REQ-09 not claimed.
      expect(createAuthRuntime(FIXTURE_ENV).authPort.kind).to.equal(
        'memory-double',
      );
      expect(createAuthRuntime(FIXTURE_ENV).authPort.residual).to.equal(false);
    });
  });
});
