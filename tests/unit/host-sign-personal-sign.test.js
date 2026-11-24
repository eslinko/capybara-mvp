'use strict';

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const {
  encodePersonalSignData,
  buildPersonalSignParams,
} = require('../../host/personalSignEncoding');
const { createSignSessionController } = require('../../host/signClient');
const { SignTokenStore } = require('../../host/signTokenStore');
const { createHostServer } = require('../../host/server');
const { createAuthRuntime } = require('../../host/authHttp');
const { createMemorySupabaseAuthDouble } = require('../../packages/core/src/auth');
const { issueChallenge } = require('../../packages/core/src/auth');
const {
  GOLDEN_FIXTURE_MESSAGE,
  GOLDEN_PERSONAL_SIGN_PARAMS0_HEX,
} = require('./fixtures/personal-sign-golden');

const AUTH_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-secret',
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

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : {},
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

describe('host sign page + personal_sign (WPROOF-01)', () => {
  describe('golden vector (t04 / C6)', () => {
    it('params[0] equals checked-in hex constant (not only same helper)', () => {
      expect(GOLDEN_PERSONAL_SIGN_PARAMS0_HEX).to.match(/^0x[0-9a-f]+$/);
      // Independent reference path (ethers) — must match constant
      const independent = ethers.hexlify(ethers.toUtf8Bytes(GOLDEN_FIXTURE_MESSAGE));
      expect(independent).to.equal(GOLDEN_PERSONAL_SIGN_PARAMS0_HEX);
      // Production helper must match constant
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

    it('Wallet.signMessage(fixture) verifies with ethers.verifyMessage', async () => {
      const wallet = ethers.Wallet.createRandom();
      const sig = await wallet.signMessage(GOLDEN_FIXTURE_MESSAGE);
      const recovered = ethers.verifyMessage(GOLDEN_FIXTURE_MESSAGE, sig);
      expect(recovered.toLowerCase()).to.equal(wallet.address.toLowerCase());
    });
  });

  describe('sign client UX (t02/t03/t05)', () => {
    it('signs exact message and verifies without product private keys (AC-W01/W02)', async () => {
      const wallet = ethers.Wallet.createRandom();
      const auth = createAuthRuntime(AUTH_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const issued = issueChallenge(auth.challenges, wallet.address, {
        nowMs: 1_700_000_000_000,
        ttlMs: 120_000,
      });

      let personalSignParams = null;
      const ethereum = {
        request: async ({ method, params }) => {
          if (method === 'eth_requestAccounts') return [wallet.address];
          if (method === 'personal_sign') {
            personalSignParams = params;
            expect(params[0]).to.equal(encodePersonalSignData(issued.message));
            expect(params[1].toLowerCase()).to.equal(wallet.address.toLowerCase());
            return wallet.signMessage(issued.message);
          }
          throw new Error(`unexpected ${method}`);
        },
        on() {},
        removeListener() {},
      };

      const controller = createSignSessionController({
        ethereum,
        bootstrap: {
          challengeId: issued.challengeId,
          message: issued.message,
          address: issued.address,
        },
        signToken: 'deadbeef',
        fetchImpl: async (url, init) => {
          expect(url).to.equal('/auth/verify');
          const body = JSON.parse(init.body);
          expect(body.challengeId).to.equal(issued.challengeId);
          const proof = require('../../packages/core/src/auth').verifyAddressProof(
            auth.challenges,
            body.challengeId,
            body.signature,
            { nowMs: 1_700_000_000_000 },
          );
          return {
            ok: true,
            json: async () => ({
              ok: true,
              token: 'sess',
              address: proof.address,
            }),
          };
        },
      });

      const result = await controller.run();
      expect(result.ok).to.equal(true);
      expect(result.capabilitiesGranted).to.equal(true);
      expect(personalSignParams[0]).to.equal(encodePersonalSignData(issued.message));
      // Page path never touches pool/product keys
      expect(controller.getState().connectedAddress.toLowerCase()).to.equal(
        wallet.address.toLowerCase(),
      );
    });

    it('reject/cancel does not grant capabilities; optional client-event (AC-W04)', async () => {
      const wallet = ethers.Wallet.createRandom();
      let clientEventBody = null;
      const ethereum = {
        request: async ({ method }) => {
          if (method === 'eth_requestAccounts') return [wallet.address];
          if (method === 'personal_sign') {
            const err = new Error('User rejected');
            err.code = 4001;
            throw err;
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
          message: 'msg',
          address: wallet.address,
        },
        signToken: 'tok1',
        fetchImpl: async (url, init) => {
          if (String(url).includes('client-event')) {
            clientEventBody = JSON.parse(init.body);
            return { ok: true, json: async () => ({ ok: true }) };
          }
          throw new Error('verify must not be called on reject');
        },
      });
      const result = await controller.run();
      expect(result.ok).to.equal(false);
      expect(result.capabilitiesGranted).to.equal(false);
      expect(controller.getState().capabilitiesGranted).to.equal(false);
      expect(clientEventBody).to.deep.equal({ type: 'wallet_reject' });
    });

    it('account-switch aborts and ignores late signature (t05)', async () => {
      const walletA = ethers.Wallet.createRandom();
      const walletB = ethers.Wallet.createRandom();
      let accountsHandler = null;
      let resolveSign;
      const signPromise = new Promise((r) => {
        resolveSign = r;
      });
      const ethereum = {
        request: async ({ method }) => {
          if (method === 'eth_requestAccounts') return [walletA.address];
          if (method === 'personal_sign') {
            // Simulate account switch mid-sign, then resolve late signature from A
            if (accountsHandler) accountsHandler([walletB.address]);
            return signPromise;
          }
          throw new Error(`unexpected ${method}`);
        },
        on(event, fn) {
          if (event === 'accountsChanged') accountsHandler = fn;
        },
        removeListener() {},
      };
      const controller = createSignSessionController({
        ethereum,
        bootstrap: {
          challengeId: 'cid',
          message: 'exact-message',
          address: walletA.address,
        },
        signToken: 'tok2',
        fetchImpl: async () => {
          throw new Error('verify must not run after abort');
        },
      });
      const runPromise = controller.run();
      // Allow connect+sign to start, then resolve late sig
      await new Promise((r) => setImmediate(r));
      resolveSign(await walletA.signMessage('exact-message'));
      const result = await runPromise;
      expect(result.ok).to.equal(false);
      expect(result.capabilitiesGranted).to.equal(false);
      expect(controller.getState().aborted).to.equal(true);
    });
  });

  describe('HTTP sign page shell (t01)', () => {
    it('GET /sign/{token} returns HTML bootstrap when token+challenge pending', async () => {
      const wallet = ethers.Wallet.createRandom();
      const auth = createAuthRuntime(AUTH_ENV, { nowMs: 1_700_000_000_000, authPort: createMemorySupabaseAuthDouble() });
      const issued = issueChallenge(auth.challenges, wallet.address, {
        nowMs: 1_700_000_000_000,
        ttlMs: 120_000,
      });
      const store = new SignTokenStore();
      const token = store.create({
        challengeId: issued.challengeId,
        expiresAtMs: issued.expiresAtMs,
      });
      const server = createHostServer({
        env: AUTH_ENV,
        authRuntime: auth,
        signTokenStore: store,
        nowMs: 1_700_000_000_000,
      });
      const port = await listen(server);
      try {
        const res = await request(port, 'GET', `/sign/${token}`);
        expect(res.status).to.equal(200);
        expect(res.headers['content-type']).to.match(/text\/html/);
        expect(res.headers['referrer-policy']).to.equal('no-referrer');
        expect(res.text).to.include('__CAPY_SIGN_BOOTSTRAP__');
        expect(res.text).to.include(issued.challengeId);
        expect(res.text).to.include('/sign/client.js');
        // exact message embedded (JSON)
        expect(res.text).to.include(JSON.stringify(issued.message).slice(1, -1));

        const js = await request(port, 'GET', '/sign/client.js');
        expect(js.status).to.equal(200);
        expect(js.text).to.include('personal_sign');

        const rejectEvt = await request(port, 'POST', `/sign/${token}/client-event`, {
          type: 'wallet_reject',
        });
        expect(rejectEvt.status).to.equal(200);
        expect(rejectEvt.json.ok).to.equal(true);

        const result = await request(port, 'GET', `/sign/${token}/result`);
        expect(result.status).to.equal(200);
        expect(result.json.status).to.equal('pending'); // reject does not terminalize

        const bad = await request(port, 'GET', '/sign/ffffffffffffffffffffffffffffffff');
        expect(bad.status).to.equal(404);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });
});
