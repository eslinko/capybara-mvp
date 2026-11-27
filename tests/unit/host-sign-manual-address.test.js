'use strict';

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { SignTokenStore } = require('../../host/signTokenStore');
const { matchSignPath } = require('../../host/signHttp');
const { createSignSessionController } = require('../../host/signClient');
const {
  encodePersonalSignData,
  buildPersonalSignParams,
} = require('../../host/personalSignEncoding');
const { createHostServer } = require('../../host/server');
const { createAuthRuntime } = require('../../host/authHttp');
const { createMemorySupabaseAuthDouble } = require('../../packages/core/src/auth');
const {
  GOLDEN_FIXTURE_MESSAGE,
  GOLDEN_PERSONAL_SIGN_PARAMS0_HEX,
} = require('./fixtures/personal-sign-golden');

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

describe('host sign manual address entry (WPROOF-07 / G5)', () => {
  it('matchSignPath recognizes bind-address', () => {
    expect(matchSignPath('/sign/abcdef0123456789abcdef0123456789/bind-address')).to.deep.equal({
      kind: 'bind_address',
      signToken: 'abcdef0123456789abcdef0123456789',
    });
  });

  it('HTML includes editable address field (AC-G5-01)', async () => {
    const wallet = ethers.Wallet.createRandom();
    const auth = createAuthRuntime(MINT_ENV, {
      nowMs: 1_700_000_000_000,
      authPort: createMemorySupabaseAuthDouble(),
    });
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
      expect(mint.status).to.equal(200);
      const page = await request(port, 'GET', `/sign/${mint.json.signToken}`);
      expect(page.status).to.equal(200);
      expect(page.text).to.include('id="capy-address"');
      expect(page.text).to.include('Enter or paste the wallet address');
      expect(page.text).to.match(/no product (\/pool keys|private keys) on this page/i);
      const js = await request(port, 'GET', '/sign/client.js');
      expect(js.status).to.equal(200);
      expect(js.text).to.include('bind-address');
      expect(js.text).to.include('readEnteredAddress');
      expect(js.text).to.include('does not match entered address');
      // Encoding lock intact (AC-G5-04) — same utf8→hex / personal_sign form
      expect(js.text).to.include('personal_sign');
      expect(js.text).to.include('utf8ToHex');
      expect(js.text).to.include('buildParams(message, address)');
      expect(js.text).to.match(/return \[utf8ToHex\(message\), address\]/);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('bind-address rebinds challenge to typed address; same address idempotent (AC-G5-02)', async () => {
    const mintWallet = ethers.Wallet.createRandom();
    const typedWallet = ethers.Wallet.createRandom();
    const auth = createAuthRuntime(MINT_ENV, {
      nowMs: 1_700_000_000_000,
      authPort: createMemorySupabaseAuthDouble(),
    });
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
        { address: mintWallet.address },
        { 'X-Capy-Sign-Mint-Secret': 'mint-secret-test' },
      );
      expect(mint.status).to.equal(200);
      const token = mint.json.signToken;
      const originalCid = mint.json.challengeId;

      const same = await request(port, 'POST', `/sign/${token}/bind-address`, {
        address: mintWallet.address,
      });
      expect(same.status).to.equal(200);
      expect(same.json.ok).to.equal(true);
      expect(same.json.rebound).to.equal(false);
      expect(same.json.challengeId).to.equal(originalCid);
      expect(same.json.address.toLowerCase()).to.equal(mintWallet.address.toLowerCase());

      const rebound = await request(port, 'POST', `/sign/${token}/bind-address`, {
        address: typedWallet.address,
      });
      expect(rebound.status).to.equal(200);
      expect(rebound.json.ok).to.equal(true);
      expect(rebound.json.rebound).to.equal(true);
      expect(rebound.json.challengeId).to.not.equal(originalCid);
      expect(rebound.json.address.toLowerCase()).to.equal(typedWallet.address.toLowerCase());
      expect(rebound.json.message).to.be.a('string');
      expect(rebound.json.message.toLowerCase()).to.include(
        typedWallet.address.toLowerCase(),
      );

      const row = store.get(token, 1_700_000_000_000);
      expect(row.challengeId).to.equal(rebound.json.challengeId);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('controller fail-closed on MM account ≠ entered address (AC-G5-02/03)', async () => {
    const entered = ethers.Wallet.createRandom();
    const connected = ethers.Wallet.createRandom();
    const ethereum = {
      request: async ({ method }) => {
        if (method === 'eth_requestAccounts') return [connected.address];
        if (method === 'personal_sign') {
          throw new Error('personal_sign must not run on mismatch');
        }
        throw new Error(`unexpected ${method}`);
      },
      on() {},
      removeListener() {},
    };
    const controller = createSignSessionController({
      ethereum,
      bootstrap: {
        challengeId: 'cid',
        message: 'exact-message',
        address: entered.address,
      },
      enteredAddress: entered.address,
      signToken: 'tok',
      fetchImpl: async () => {
        throw new Error('verify/bind must not run on mismatch path after bind skip');
      },
    });
    const result = await controller.run();
    expect(result.ok).to.equal(false);
    expect(result.status).to.equal('mismatch');
    expect(result.capabilitiesGranted).to.equal(false);
  });

  it('controller signs bound typed address and verifies (proof for entered only)', async () => {
    const mintWallet = ethers.Wallet.createRandom();
    const typedWallet = ethers.Wallet.createRandom();
    const auth = createAuthRuntime(MINT_ENV, {
      nowMs: 1_700_000_000_000,
      authPort: createMemorySupabaseAuthDouble(),
    });
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
        { address: mintWallet.address },
        { 'X-Capy-Sign-Mint-Secret': 'mint-secret-test' },
      );
      const token = mint.json.signToken;
      let personalSignParams = null;
      let lastBoundMessage = '';
      const ethereum = {
        request: async ({ method, params }) => {
          if (method === 'eth_requestAccounts') return [typedWallet.address];
          if (method === 'personal_sign') {
            personalSignParams = params;
            expect(params[0]).to.equal(encodePersonalSignData(lastBoundMessage));
            expect(params[1].toLowerCase()).to.equal(typedWallet.address.toLowerCase());
            return typedWallet.signMessage(lastBoundMessage);
          }
          throw new Error(`unexpected ${method}`);
        },
        on() {},
        removeListener() {},
      };
      const controller = createSignSessionController({
        ethereum,
        bootstrap: {
          challengeId: mint.json.challengeId,
          message: 'placeholder-will-rebind',
          address: mintWallet.address,
        },
        enteredAddress: typedWallet.address,
        signToken: token,
        fetchImpl: async (url, init) => {
          const path = String(url);
          const method = (init && init.method) || 'GET';
          const body = init && init.body ? JSON.parse(init.body) : null;
          const res = await request(port, method, path, body);
          if (path.includes('/bind-address') && res.json && res.json.message) {
            lastBoundMessage = res.json.message;
          }
          return {
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            json: async () => res.json,
          };
        },
      });

      const result = await controller.run();
      expect(result.ok).to.equal(true);
      expect(result.json.address.toLowerCase()).to.equal(typedWallet.address.toLowerCase());
      expect(personalSignParams[0]).to.equal(encodePersonalSignData(lastBoundMessage));
      // No product private keys on page path (AC-G5-03) — only wallet.signMessage in test double
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('encoding dual-channel lock unchanged (AC-G5-04)', () => {
    expect(encodePersonalSignData(GOLDEN_FIXTURE_MESSAGE)).to.equal(
      GOLDEN_PERSONAL_SIGN_PARAMS0_HEX,
    );
    const params = buildPersonalSignParams(
      GOLDEN_FIXTURE_MESSAGE,
      '0x0000000000000000000000000000000000000001',
    );
    expect(params[0]).to.equal(GOLDEN_PERSONAL_SIGN_PARAMS0_HEX);
    expect(params[1]).to.equal('0x0000000000000000000000000000000000000001');
  });
});
