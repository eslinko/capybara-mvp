'use strict';

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { SignTokenStore } = require('../../host/signTokenStore');
const { parsePublicBaseUrl, matchSignPath } = require('../../host/signHttp');
const { createHostServer } = require('../../host/server');
const { createAuthRuntime } = require('../../host/authHttp');
const { createMemorySupabaseAuthDouble } = require('../../packages/core/src/auth');

const AUTH_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-secret',
};

const MINT_ENV = {
  ...AUTH_ENV,
  CAPY_SIGN_MINT_SECRET: 'mint-secret-test',
  CAPY_PUBLIC_BASE_URL: 'https://sign.test.example',
};

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(port);
    });
    server.on('error', reject);
  });
}

function request(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
          ...headers,
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
          } catch (_) {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, text: data, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('host signToken mint / result (WPROOF-02)', () => {
  describe('parsePublicBaseUrl (t04)', () => {
    it('accepts absolute HTTPS origin without trailing slash junk', () => {
      const ok = parsePublicBaseUrl('https://sign.test.example');
      expect(ok).to.deep.equal({
        baseUrl: 'https://sign.test.example',
        hostname: 'sign.test.example',
      });
      expect(parsePublicBaseUrl('https://sign.test.example/')).to.deep.equal(ok);
      expect(parsePublicBaseUrl('http://sign.test.example')).to.equal(null);
      expect(parsePublicBaseUrl('')).to.equal(null);
      expect(parsePublicBaseUrl('https://sign.test.example/path')).to.equal(null);
    });
  });

  describe('mint API auth + create (t01/t04)', () => {
    it('503 when CAPY_SIGN_MINT_SECRET unset; 401 wrong/missing header', async () => {
      const auth = createAuthRuntime(AUTH_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const store = new SignTokenStore();
      const noSecret = createHostServer({
        enableSignHttp: true,
        env: { ...AUTH_ENV, CAPY_PUBLIC_BASE_URL: 'https://sign.test.example' },
        authRuntime: auth,
        signTokenStore: store,
        nowMs: 1_700_000_000_000,
      });
      const port = await listen(noSecret);
      try {
        const res = await request(port, 'POST', '/sign/mint', { address: '0x' + '11'.repeat(20) });
        expect(res.status).to.equal(503);
        expect(res.json.error).to.equal('ESIGN_MINT_SECRET_UNSET');
      } finally {
        await new Promise((r) => noSecret.close(r));
      }

      const auth2 = createAuthRuntime(MINT_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const server = createHostServer({
        enableSignHttp: true,
        env: MINT_ENV,
        authRuntime: auth2,
        signTokenStore: new SignTokenStore(),
        nowMs: 1_700_000_000_000,
      });
      const port2 = await listen(server);
      try {
        const missing = await request(port2, 'POST', '/sign/mint', {
          address: ethers.Wallet.createRandom().address,
        });
        expect(missing.status).to.equal(401);
        const wrong = await request(
          port2,
          'POST',
          '/sign/mint',
          { address: ethers.Wallet.createRandom().address },
          { 'X-Capy-Sign-Mint-Secret': 'nope' },
        );
        expect(wrong.status).to.equal(401);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('503 without CAPY_PUBLIC_BASE_URL; mint returns unique url + domain/uri in challenge', async () => {
      const wallet = ethers.Wallet.createRandom();
      const noBase = createHostServer({
        enableSignHttp: true,
        env: { ...AUTH_ENV, CAPY_SIGN_MINT_SECRET: 'mint-secret-test' },
        authRuntime: createAuthRuntime(AUTH_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() }),
        signTokenStore: new SignTokenStore(),
        nowMs: 1_700_000_000_000,
      });
      const p0 = await listen(noBase);
      try {
        const res = await request(
          p0,
          'POST',
          '/sign/mint',
          { address: wallet.address },
          { 'X-Capy-Sign-Mint-Secret': 'mint-secret-test' },
        );
        expect(res.status).to.equal(503);
        expect(res.json.error).to.equal('ESIGN_PUBLIC_BASE_URL_UNSET');
      } finally {
        await new Promise((r) => noBase.close(r));
      }

      const auth = createAuthRuntime(MINT_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const store = new SignTokenStore();
      const server = createHostServer({
        enableSignHttp: true,
        env: MINT_ENV,
        authRuntime: auth,
        signTokenStore: store,
        nowMs: 1_700_000_000_000,
      });
      const port = await listen(server);
      try {
        const res = await request(
          port,
          'POST',
          '/sign/mint',
          { address: wallet.address },
          { 'X-Capy-Sign-Mint-Secret': 'mint-secret-test' },
        );
        expect(res.status).to.equal(200);
        expect(res.headers['cache-control']).to.equal('no-store');
        expect(res.json.ok).to.equal(true);
        expect(res.json.signToken).to.match(/^[0-9a-f]{32}$/);
        expect(res.json.url).to.equal(
          `https://sign.test.example/sign/${res.json.signToken}`,
        );
        expect(res.json.challengeId).to.be.a('string');
        const ch = auth.challenges.get(res.json.challengeId);
        expect(ch.message).to.include('sign.test.example');
        expect(ch.message).to.include('https://sign.test.example/sign');
        expect(ch.message).to.not.include(res.json.signToken);

        // remint → new challenge + new token (AC-W09 uniqueness)
        const res2 = await request(
          port,
          'POST',
          '/sign/mint',
          { address: wallet.address },
          { 'X-Capy-Sign-Mint-Secret': 'mint-secret-test' },
        );
        expect(res2.json.signToken).to.not.equal(res.json.signToken);
        expect(res2.json.challengeId).to.not.equal(res.json.challengeId);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('HTML bootstrap gate (t02 / AC-W09)', () => {
    it('fail-closed for unknown/expired/consumed; HTML closed after challenge consume', async () => {
      const wallet = ethers.Wallet.createRandom();
      const auth = createAuthRuntime(MINT_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const store = new SignTokenStore();
      const server = createHostServer({
        enableSignHttp: true,
        env: MINT_ENV,
        authRuntime: auth,
        signTokenStore: store,
        nowMs: 1_700_000_000_000,
      });
      const port = await listen(server);
      try {
        const mint = await request(
          port,
          'POST',
          '/sign/mint',
          { address: wallet.address },
          { 'X-Capy-Sign-Mint-Secret': 'mint-secret-test' },
        );
        const token = mint.json.signToken;
        const page = await request(port, 'GET', `/sign/${token}`);
        expect(page.status).to.equal(200);
        expect(page.text).to.include('__CAPY_SIGN_BOOTSTRAP__');

        expect((await request(port, 'GET', '/sign/ffffffffffffffffffffffffffffffff')).status).to.equal(
          404,
        );

        const sig = await wallet.signMessage(
          auth.challenges.get(mint.json.challengeId).message,
        );
        const verify = await request(port, 'POST', '/auth/verify', {
          challengeId: mint.json.challengeId,
          signature: sig,
        });
        expect(verify.status).to.equal(200);
        expect(verify.json.ok).to.equal(true);
        // verify body must not require signToken
        expect(Object.prototype.hasOwnProperty.call(
          JSON.parse(JSON.stringify({ challengeId: mint.json.challengeId, signature: sig })),
          'signToken',
        )).to.equal(false);

        const reopen = await request(port, 'GET', `/sign/${token}`);
        expect(reopen.status).to.equal(404);

        const result = await request(port, 'GET', `/sign/${token}/result`);
        expect(result.status).to.equal(200);
        expect(result.json.status).to.equal('ok');
        expect(result.json.address.toLowerCase()).to.equal(wallet.address.toLowerCase());
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('/result transitions (t03 / arch-03)', () => {
    it('wallet_reject leaves pending; later verify → ok; ok readable after HTML consume', async () => {
      const wallet = ethers.Wallet.createRandom();
      const auth = createAuthRuntime(MINT_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const store = new SignTokenStore();
      const server = createHostServer({
        enableSignHttp: true,
        env: MINT_ENV,
        authRuntime: auth,
        signTokenStore: store,
        nowMs: 1_700_000_000_000,
      });
      const port = await listen(server);
      try {
        const mint = await request(
          port,
          'POST',
          '/sign/mint',
          { address: wallet.address },
          { 'X-Capy-Sign-Mint-Secret': 'mint-secret-test' },
        );
        const token = mint.json.signToken;

        const rej = await request(port, 'POST', `/sign/${token}/client-event`, {
          type: 'wallet_reject',
        });
        expect(rej.status).to.equal(200);
        let result = await request(port, 'GET', `/sign/${token}/result`);
        expect(result.json.status).to.equal('pending');

        const message = auth.challenges.get(mint.json.challengeId).message;
        const sig = await wallet.signMessage(message);
        const verify = await request(port, 'POST', '/auth/verify', {
          challengeId: mint.json.challengeId,
          signature: sig,
        });
        expect(verify.json.ok).to.equal(true);

        result = await request(port, 'GET', `/sign/${token}/result`);
        expect(result.json.status).to.equal('ok');
        // HTML consumed — page 404 but result still ok
        expect((await request(port, 'GET', `/sign/${token}`)).status).to.equal(404);
        result = await request(port, 'GET', `/sign/${token}/result`);
        expect(result.json.status).to.equal('ok');
      } finally {
        await new Promise((r) => server.close(r));
      }
    });

    it('parallel reject + success: server ok precedence (arch-03)', async () => {
      const wallet = ethers.Wallet.createRandom();
      const auth = createAuthRuntime(MINT_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const store = new SignTokenStore();
      const server = createHostServer({
        enableSignHttp: true,
        env: MINT_ENV,
        authRuntime: auth,
        signTokenStore: store,
        nowMs: 1_700_000_000_000,
      });
      const port = await listen(server);
      try {
        const mint = await request(
          port,
          'POST',
          '/sign/mint',
          { address: wallet.address },
          { 'X-Capy-Sign-Mint-Secret': 'mint-secret-test' },
        );
        const token = mint.json.signToken;
        const message = auth.challenges.get(mint.json.challengeId).message;
        const sig = await wallet.signMessage(message);

        await request(port, 'POST', `/sign/${token}/client-event`, {
          type: 'wallet_reject',
        });
        const verify = await request(port, 'POST', '/auth/verify', {
          challengeId: mint.json.challengeId,
          signature: sig,
        });
        expect(verify.json.ok).to.equal(true);
        // post-ok client-event is no-op
        await request(port, 'POST', `/sign/${token}/client-event`, {
          type: 'wallet_reject',
        });
        const result = await request(port, 'GET', `/sign/${token}/result`);
        expect(result.json.status).to.equal('ok');
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('result write-fail / POC fail-closed (t05)', () => {
    it('verify ok + write fail → login done, HTML closed, /result pending then 404 after expiresAt', async () => {
      const wallet = ethers.Wallet.createRandom();
      const auth = createAuthRuntime(MINT_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const store = new SignTokenStore();
      store.setFailNextWriteOk(true);
      const server = createHostServer({
        enableSignHttp: true,
        env: MINT_ENV,
        authRuntime: auth,
        signTokenStore: store,
        nowMs: 1_700_000_000_000,
      });
      const port = await listen(server);
      try {
        const mint = await request(
          port,
          'POST',
          '/sign/mint',
          { address: wallet.address },
          { 'X-Capy-Sign-Mint-Secret': 'mint-secret-test' },
        );
        const token = mint.json.signToken;
        const message = auth.challenges.get(mint.json.challengeId).message;
        const sig = await wallet.signMessage(message);
        const verify = await request(port, 'POST', '/auth/verify', {
          challengeId: mint.json.challengeId,
          signature: sig,
        });
        expect(verify.status).to.equal(200);
        expect(verify.json.ok).to.equal(true);
        expect(verify.json.token).to.be.a('string'); // login done

        // HTML fail-closed (challenge consumed)
        expect((await request(port, 'GET', `/sign/${token}`)).status).to.equal(404);

        // /result stays pending (write failed)
        let result = await request(port, 'GET', `/sign/${token}/result`);
        expect(result.status).to.equal(200);
        expect(result.json.status).to.equal('pending');

        // past expiresAt → 4xx (POC fail-closed path)
        const expiredServer = createHostServer({
        enableSignHttp: true,
          env: MINT_ENV,
          authRuntime: auth,
          signTokenStore: store,
          nowMs: 1_700_000_000_000 + 10 * 60 * 1000,
        });
        const port2 = await listen(expiredServer);
        try {
          result = await request(port2, 'GET', `/sign/${token}/result`);
          expect(result.status).to.equal(404);
        } finally {
          await new Promise((r) => expiredServer.close(r));
        }
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  describe('path lock', () => {
    it('matchSignPath recognizes mint', () => {
      expect(matchSignPath('/sign/mint')).to.deep.equal({ kind: 'mint' });
      expect(matchSignPath('/sign/abcdef0123456789abcdef0123456789').kind).to.equal('page');
    });
  });
});
