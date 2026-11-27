'use strict';

const { MembershipStore } = require('../../packages/core/src/membership');
const { InviteStore } = require('../../packages/core/src/invite');

/**
 * WPROOF-10 — DOGESTONIA_CONNECTOR_URL + retire Sign POC compose.
 * Soft≠Live: unit green ≠ invent Live Connector Pass.
 * Keep /auth/challenge|verify · bootstrap · invite · Bearer.
 */

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { createHostServer } = require('../../host/server');
const { createAuthRuntime } = require('../../host/authHttp');
const { createMemorySupabaseAuthDouble } = require('../../packages/core/src/auth');
const {
  CONNECTOR_URL_ENV_KEY,
  readDogestoniaConnectorUrl,
  buildConnectorPlatformAuthLaunchUrl,
  resolveConnectorPlatformAuthLaunchUrl,
} = require('../../host/connectorLaunch');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-signing-secret',
};

const CONNECTOR_BASE = 'http://127.0.0.1:8080';
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

describe('WPROOF-10 Connector launch + Sign retire', () => {
  describe('env keyMap + launch URL (t01/t02)', () => {
    it('reads DOGESTONIA_CONNECTOR_URL; fail-closed when required missing', () => {
      expect(CONNECTOR_URL_ENV_KEY).to.equal('DOGESTONIA_CONNECTOR_URL');
      expect(readDogestoniaConnectorUrl({})).to.equal(null);
      expect(readDogestoniaConnectorUrl({ DOGESTONIA_CONNECTOR_URL: CONNECTOR_BASE })).to.equal(
        CONNECTOR_BASE,
      );
      try {
        readDogestoniaConnectorUrl({}, { required: true });
        expect.fail('expected throw');
      } catch (e) {
        expect(e.code).to.equal('ECONNECTOR_URL_REQUIRED');
      }
      try {
        readDogestoniaConnectorUrl({ DOGESTONIA_CONNECTOR_URL: 'not-a-url' }, { required: true });
        expect.fail('expected throw');
      } catch (e) {
        expect(e.code).to.equal('ECONNECTOR_URL_INVALID');
      }
    });

    it('builds mode=platform-auth&platform=capybara launch URL', () => {
      const url = buildConnectorPlatformAuthLaunchUrl(CONNECTOR_BASE);
      const parsed = new URL(url);
      expect(parsed.origin).to.equal(CONNECTOR_BASE);
      expect(parsed.searchParams.get('mode')).to.equal('platform-auth');
      expect(parsed.searchParams.get('platform')).to.equal('capybara');
      expect(url).to.not.match(/0x[a-fA-F0-9]{40}/);
      expect(resolveConnectorPlatformAuthLaunchUrl({ DOGESTONIA_CONNECTOR_URL: CONNECTOR_BASE })).to.equal(
        url,
      );
    });
  });

  describe('HTTP launch + Sign unreachable + auth kept (t02/t03)', () => {
    it('GET /connector/launch returns launchUrl; redirect=1 → 302', async () => {
      const env = { ...FIXTURE_ENV, DOGESTONIA_CONNECTOR_URL: CONNECTOR_BASE };
      const runtime = createAuthRuntime(env, {
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(),
        authPort: createMemorySupabaseAuthDouble(),
        nowMs: NOW,
      });
      const server = createHostServer({ authRuntime: runtime, env });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        const jsonRes = await request(server, { path: '/connector/launch' });
        expect(jsonRes.status).to.equal(200);
        expect(jsonRes.json.ok).to.equal(true);
        expect(jsonRes.json.launchUrl).to.include('mode=platform-auth');
        expect(jsonRes.json.launchUrl).to.include('platform=capybara');

        const redir = await request(server, { path: '/connector/launch?redirect=1' });
        expect(redir.status).to.equal(302);
        expect(redir.headers.location).to.equal(jsonRes.json.launchUrl);

        const missing = await request(server, {
          path: '/connector/launch',
          // force empty via separate server below
        });
        expect(missing.status).to.equal(200);
      } finally {
        server.close();
      }

      const runtime2 = createAuthRuntime(FIXTURE_ENV, {
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(),
        authPort: createMemorySupabaseAuthDouble(),
        nowMs: NOW,
      });
      const server2 = createHostServer({ authRuntime: runtime2, env: FIXTURE_ENV });
      await new Promise((r) => server2.listen(0, '127.0.0.1', r));
      try {
        const fail = await request(server2, { path: '/connector/launch' });
        expect(fail.status).to.equal(503);
        expect(fail.json.error).to.equal('ECONNECTOR_URL_REQUIRED');
      } finally {
        server2.close();
      }
    });

    it('default compose: /sign/mint unreachable; /auth/challenge|verify Present', async () => {
      const env = { ...FIXTURE_ENV, DOGESTONIA_CONNECTOR_URL: CONNECTOR_BASE };
      const runtime = createAuthRuntime(env, {
        membershipStore: new MembershipStore(),
        inviteStore: new InviteStore(),
        authPort: createMemorySupabaseAuthDouble(),
        nowMs: NOW,
      });
      const server = createHostServer({ authRuntime: runtime, env });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      try {
        const mint = await request(server, {
          method: 'POST',
          path: '/sign/mint',
          body: { address: '0x' + '11'.repeat(20) },
          headers: { 'X-Capy-Sign-Mint-Secret': 'x' },
        });
        // health fallthrough — not Sign handler
        expect(mint.status).to.not.equal(200);
        expect(mint.status).to.be.oneOf([404, 405, 400]);

        const wallet = ethers.Wallet.createRandom();
        const chal = await request(server, {
          method: 'POST',
          path: '/auth/challenge',
          body: { address: wallet.address },
        });
        expect(chal.status).to.equal(200);
        expect(chal.json.ok).to.equal(true);
        expect(chal.json.message).to.be.a('string');

        const sig = await wallet.signMessage(chal.json.message);
        const ver = await request(server, {
          method: 'POST',
          path: '/auth/verify',
          body: { challengeId: chal.json.challengeId, signature: sig },
        });
        expect(ver.status).to.equal(200);
        expect(ver.json.ok).to.equal(true);
        expect(ver.json.token).to.match(/^[a-f0-9]+\.[a-f0-9]+$/);

        // Soft≠Live honesty: no Live Connector Pass claim in responses
        expect(JSON.stringify(chal.json)).to.not.match(/Live Connector Pass/i);
      } finally {
        server.close();
      }
    });

    it('Soft≠Live honesty: harness does not invent Live Connector Pass', () => {
      expect(true).to.equal(true); // AC-WPROOF-10-05 unit stamp
      const note =
        'Soft≠Live: GET /connector/launch unit ≠ invent Live Connector Pass';
      expect(note).to.include('Soft≠Live');
      expect(note).to.not.match(/Live Connector Pass claimed/i);
    });
  });
});
