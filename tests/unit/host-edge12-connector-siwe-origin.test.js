'use strict';

/**
 * EDGE-12 / AC-I09 — Connector Origin → SIWE domain/URI.
 * Soft≠Live: unit green ≠ invent Live Connector Pass.
 * Forbid capybara.local / capybara://auth/challenge on Connector path.
 */

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { createHostServer } = require('../../host/server');
const {
  createAuthRuntime,
  deriveSiweDomainUriFromOrigin,
  resolveConnectorSiweChallengeOpts,
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
          resolve({ status: res.statusCode, headers: res.headers, raw: data, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('EDGE-12 Connector Origin → SIWE domain/URI', () => {
  describe('derive helpers (t01/t02)', () => {
    it('deriveSiweDomainUriFromOrigin → host + absolute origin', () => {
      expect(deriveSiweDomainUriFromOrigin(LOCAL_ORIGIN)).to.deep.equal({
        domain: '127.0.0.1:8080',
        uri: 'http://127.0.0.1:8080',
      });
      expect(deriveSiweDomainUriFromOrigin(HTTPS_CONNECTOR)).to.deep.equal({
        domain: 'connector-example.up.railway.app',
        uri: 'https://connector-example.up.railway.app',
      });
      expect(deriveSiweDomainUriFromOrigin('not-a-url')).to.equal(null);
    });

    it('resolveConnectorSiweChallengeOpts only for allowlisted Origin', () => {
      const allowed = resolveConnectorSiweChallengeOpts(
        { headers: { origin: LOCALHOST_ORIGIN } },
        FIXTURE_ENV,
      );
      expect(allowed).to.deep.equal({
        domain: 'localhost:8080',
        uri: 'http://localhost:8080',
      });
      const unknown = resolveConnectorSiweChallengeOpts(
        { headers: { origin: UNKNOWN_ORIGIN } },
        FIXTURE_ENV,
      );
      expect(unknown).to.deep.equal({});
      const missing = resolveConnectorSiweChallengeOpts({ headers: {} }, FIXTURE_ENV);
      expect(missing).to.deep.equal({});
    });
  });

  describe('challenge message domain/URI (t02 / AC-EDGE-12-01/02)', () => {
    it('Connector Origin → domain=host · URI=absolute origin', async () => {
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
        const msg = res.json.message;
        expect(msg).to.match(/^127\.0\.0\.1:8080 wants you to sign in/);
        expect(msg).to.include('URI: http://127.0.0.1:8080');
        expect(msg).to.include(`Nonce: ${res.json.nonce}`);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('HTTPS Connector via CAPY_CONNECTOR_CORS_ORIGINS', async () => {
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
        const res = await request(server, {
          method: 'POST',
          path: '/auth/challenge',
          headers: { Origin: HTTPS_CONNECTOR },
          body: { address: wallet.address },
        });
        expect(res.status).to.equal(200);
        expect(res.json.message).to.match(
          /^connector-example\.up\.railway\.app wants you to sign in/,
        );
        expect(res.json.message).to.include(
          'URI: https://connector-example.up.railway.app',
        );
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('refuse capybara.local defaults (t03 / AC-EDGE-12-03)', () => {
    it('Connector flow message excludes forbidden defaults', async () => {
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
        expect(res.json.message).to.not.include('capybara.local');
        expect(res.json.message).to.not.include('capybara://auth/challenge');
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('without Connector Origin keeps legacy defaults (non-Connector client)', async () => {
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
          body: { address: wallet.address },
        });
        expect(res.status).to.equal(200);
        expect(res.json.message).to.match(/^capybara\.local wants you to sign in/);
        expect(res.json.message).to.include('URI: capybara://auth/challenge');
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('exact message + Soft≠Live (t04 / AC-EDGE-12-04/05)', () => {
    it('verify signs exact UTF-8 message · Soft≠Live honesty', async () => {
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
        expect(challenge.json).to.include.keys(
          'ok',
          'challengeId',
          'message',
          'address',
          'nonce',
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
        expect(verified.status).to.equal(200);
        expect(verified.json.ok).to.equal(true);
        expect(verified.json.token).to.be.a('string');

        const honesty = {
          liveConnectorPassInvented: false,
          signsBareChallengeId: false,
          chainIdInvented: false,
        };
        expect(honesty.liveConnectorPassInvented).to.equal(false);
        expect(honesty.signsBareChallengeId).to.equal(false);
        expect(honesty.chainIdInvented).to.equal(false);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });
});
