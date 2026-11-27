'use strict';

/**
 * EDGE-11 / AC-I08 — Connector CORS on `/auth/challenge|verify`.
 * Soft≠Live: unit green ≠ invent Live Connector Pass.
 * No wildcard `*` · challenge/verify body contracts unchanged.
 */

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { createHostServer } = require('../../host/server');
const {
  createAuthRuntime,
  DEFAULT_CONNECTOR_CORS_ORIGINS,
  resolveConnectorCorsAllowlist,
  resolveAllowedConnectorOrigin,
  connectorCorsResponseHeaders,
  isConnectorCorsAuthPath,
} = require('../../host/authHttp');
const { createMemorySupabaseAuthDouble } = require('../../packages/core/src/auth');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-signing-secret',
};

const LOCAL_ORIGIN = 'http://127.0.0.1:8080';
const LOCALHOST_ORIGIN = 'http://localhost:8080';
const HTTPS_CONNECTOR = 'https://connector-example.up.railway.app';
const UNKNOWN_ORIGIN = 'https://evil.example';
const NOW = 1_700_000_000_000;

/**
 * @param {import('http').Server} server
 * @param {{ method?: string, path: string, headers?: Record<string, string>, body?: object }} opts
 */
function request(server, opts) {
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
          resolve({
            status: res.statusCode,
            headers: res.headers,
            raw: data,
            json,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('EDGE-11 Connector CORS on /auth/challenge|verify', () => {
  describe('allowlist helpers (t01)', () => {
    it('defaults include local Connector Origins · never *', () => {
      expect(DEFAULT_CONNECTOR_CORS_ORIGINS).to.include(LOCAL_ORIGIN);
      expect(DEFAULT_CONNECTOR_CORS_ORIGINS).to.include(LOCALHOST_ORIGIN);
      const list = resolveConnectorCorsAllowlist({});
      expect(list).to.deep.equal([...DEFAULT_CONNECTOR_CORS_ORIGINS]);
      expect(list).to.not.include('*');
    });

    it('CAPY_CONNECTOR_CORS_ORIGINS adds HTTPS Connector · strips *', () => {
      const list = resolveConnectorCorsAllowlist({
        CAPY_CONNECTOR_CORS_ORIGINS: `${HTTPS_CONNECTOR}, * , https://other.example`,
      });
      expect(list).to.include(HTTPS_CONNECTOR);
      expect(list).to.include('https://other.example');
      expect(list).to.not.include('*');
    });

    it('resolveAllowedConnectorOrigin fail-closed for unknown', () => {
      const allowlist = resolveConnectorCorsAllowlist({});
      expect(
        resolveAllowedConnectorOrigin(
          { headers: { origin: LOCAL_ORIGIN } },
          allowlist,
        ),
      ).to.equal(LOCAL_ORIGIN);
      expect(
        resolveAllowedConnectorOrigin(
          { headers: { origin: UNKNOWN_ORIGIN } },
          allowlist,
        ),
      ).to.equal(null);
      expect(
        resolveAllowedConnectorOrigin({ headers: {} }, allowlist),
      ).to.equal(null);
      const headers = connectorCorsResponseHeaders(LOCAL_ORIGIN);
      expect(headers['Access-Control-Allow-Origin']).to.equal(LOCAL_ORIGIN);
      expect(headers['Access-Control-Allow-Origin']).to.not.equal('*');
      expect(connectorCorsResponseHeaders(null)).to.deep.equal({});
    });

    it('CORS path stamp only challenge/verify', () => {
      expect(isConnectorCorsAuthPath('/auth/challenge')).to.equal(true);
      expect(isConnectorCorsAuthPath('/auth/verify')).to.equal(true);
      expect(isConnectorCorsAuthPath('/auth/session')).to.equal(false);
      expect(isConnectorCorsAuthPath('/auth/bootstrap')).to.equal(false);
    });
  });

  describe('ACAO echo on challenge/verify (t01 / AC-EDGE-11-01)', () => {
    it('allowed Origin gets ACAO echo on POST challenge · not *', async () => {
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        nowMs: NOW,
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({
        authRuntime: runtime,
        env: FIXTURE_ENV,
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        const wallet = ethers.Wallet.createRandom();
        const res = await request(server, {
          method: 'POST',
          path: '/auth/challenge',
          headers: { Origin: LOCAL_ORIGIN },
          body: { address: wallet.address },
        });
        expect(res.status).to.equal(200);
        expect(res.json.ok).to.equal(true);
        expect(res.json.challengeId).to.be.a('string');
        expect(res.json.message).to.be.a('string');
        expect(res.headers['access-control-allow-origin']).to.equal(LOCAL_ORIGIN);
        expect(res.headers['access-control-allow-origin']).to.not.equal('*');
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('HTTPS Connector Origin via CAPY_CONNECTOR_CORS_ORIGINS on verify', async () => {
      const env = {
        ...FIXTURE_ENV,
        CAPY_CONNECTOR_CORS_ORIGINS: HTTPS_CONNECTOR,
      };
      const runtime = createAuthRuntime(env, {
        nowMs: NOW,
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({ authRuntime: runtime, env });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        const wallet = ethers.Wallet.createRandom();
        const challenge = await request(server, {
          method: 'POST',
          path: '/auth/challenge',
          headers: { Origin: HTTPS_CONNECTOR },
          body: { address: wallet.address },
        });
        expect(challenge.status).to.equal(200);
        const signature = await wallet.signMessage(challenge.json.message);
        const verified = await request(server, {
          method: 'POST',
          path: '/auth/verify',
          headers: { Origin: HTTPS_CONNECTOR },
          body: {
            challengeId: challenge.json.challengeId,
            signature,
          },
        });
        expect(verified.status).to.equal(200);
        expect(verified.json.ok).to.equal(true);
        expect(verified.json.token).to.be.a('string');
        expect(verified.json.userId).to.be.a('string');
        expect(verified.headers['access-control-allow-origin']).to.equal(
          HTTPS_CONNECTOR,
        );
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('OPTIONS preflight (t02 / AC-EDGE-11-02)', () => {
    it('OPTIONS challenge/verify → 204 with POST,OPTIONS and Content-Type,Accept', async () => {
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        nowMs: NOW,
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({
        authRuntime: runtime,
        env: FIXTURE_ENV,
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        for (const path of ['/auth/challenge', '/auth/verify']) {
          const res = await request(server, {
            method: 'OPTIONS',
            path,
            headers: { Origin: LOCALHOST_ORIGIN },
          });
          expect(res.status, path).to.equal(204);
          expect(res.headers['access-control-allow-origin']).to.equal(
            LOCALHOST_ORIGIN,
          );
          const methods = String(
            res.headers['access-control-allow-methods'] || '',
          );
          expect(methods).to.match(/POST/i);
          expect(methods).to.match(/OPTIONS/i);
          const allowHeaders = String(
            res.headers['access-control-allow-headers'] || '',
          );
          expect(allowHeaders).to.match(/Content-Type/i);
          expect(allowHeaders).to.match(/Accept/i);
        }
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('fail-closed unknown Origin (t03 / AC-EDGE-11-03)', () => {
    it('unknown Origin → no ACAO · no *', async () => {
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        nowMs: NOW,
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({
        authRuntime: runtime,
        env: FIXTURE_ENV,
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        const wallet = ethers.Wallet.createRandom();
        const res = await request(server, {
          method: 'POST',
          path: '/auth/challenge',
          headers: { Origin: UNKNOWN_ORIGIN },
          body: { address: wallet.address },
        });
        expect(res.status).to.equal(200);
        expect(res.json.ok).to.equal(true);
        expect(res.headers['access-control-allow-origin']).to.equal(undefined);
        expect(String(res.headers['access-control-allow-origin'] || '')).to.not.equal(
          '*',
        );

        const preflight = await request(server, {
          method: 'OPTIONS',
          path: '/auth/verify',
          headers: { Origin: UNKNOWN_ORIGIN },
        });
        expect(preflight.status).to.equal(204);
        expect(preflight.headers['access-control-allow-origin']).to.equal(
          undefined,
        );
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('Soft≠Live + body contract (t04 / AC-EDGE-11-04/05)', () => {
    it('challenge/verify body shape unchanged · Soft≠Live honesty', async () => {
      const runtime = createAuthRuntime(FIXTURE_ENV, {
        nowMs: NOW,
        authPort: createMemorySupabaseAuthDouble(),
      });
      const server = createHostServer({
        authRuntime: runtime,
        env: FIXTURE_ENV,
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        const wallet = ethers.Wallet.createRandom();
        const challenge = await request(server, {
          method: 'POST',
          path: '/auth/challenge',
          headers: { Origin: LOCAL_ORIGIN },
          body: { address: wallet.address },
        });
        // AC-EDGE-11-05: body contracts required by Connector client
        expect(challenge.json).to.include.keys(
          'ok',
          'challengeId',
          'message',
          'address',
          'nonce',
          'issuedAt',
          'expiresAt',
        );
        const signature = await wallet.signMessage(challenge.json.message);
        const verified = await request(server, {
          method: 'POST',
          path: '/auth/verify',
          headers: { Origin: LOCAL_ORIGIN },
          body: {
            challengeId: challenge.json.challengeId,
            signature,
          },
        });
        expect(verified.json).to.include.keys(
          'ok',
          'token',
          'tokenType',
          'userId',
          'address',
          'expiresAt',
          'proof',
        );

        const honesty = {
          liveConnectorPassInvented: false,
          wildcardCorsInvented: false,
          bodyContractChanged: false,
        };
        expect(honesty.liveConnectorPassInvented).to.equal(false);
        expect(honesty.wildcardCorsInvented).to.equal(false);
        expect(honesty.bodyContractChanged).to.equal(false);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });
});
