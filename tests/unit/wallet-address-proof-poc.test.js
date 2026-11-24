'use strict';

const { expect } = require('chai');
const {
  resolvePocConfig,
  formatOkPrint,
  pollResultOnly,
  runPoc,
} = require('../../cli/wallet-address-proof-poc');

const BASE_ENV = {
  CAPY_POOL_ADDRESS: '0x1111111111111111111111111111111111111111',
  CAPY_SIGN_MINT_SECRET: 'mint-secret',
  CAPY_PUBLIC_BASE_URL: 'https://sign.test.example',
  CAPY_POC_HOST: 'http://127.0.0.1:9999',
  CAPY_POC_POLL_MS: '10',
  CAPY_POC_TIMEOUT_MS: '100',
};

describe('wallet-address-proof-poc (WPROOF-05)', () => {
  describe('resolvePocConfig (t01)', () => {
    it('fail-closed without pool / mint secret / public base', () => {
      expect(() => resolvePocConfig({})).to.throw(/CAPY_POOL_ADDRESS/);
      expect(() =>
        resolvePocConfig({ CAPY_POOL_ADDRESS: '0x1' }),
      ).to.throw(/CAPY_SIGN_MINT_SECRET/);
      expect(() =>
        resolvePocConfig({
          CAPY_POOL_ADDRESS: '0x1',
          CAPY_SIGN_MINT_SECRET: 's',
        }),
      ).to.throw(/CAPY_PUBLIC_BASE_URL/);
    });

    it('resolves host from CAPY_POC_HOST or public base', () => {
      const cfg = resolvePocConfig(BASE_ENV);
      expect(cfg.poolAddress).to.equal(BASE_ENV.CAPY_POOL_ADDRESS);
      expect(cfg.hostBase).to.equal('http://127.0.0.1:9999');
      expect(cfg.mintSecret).to.equal('mint-secret');
    });
  });

  describe('formatOkPrint (t03)', () => {
    it('prints residual-safe OK without bearer/secret fields', () => {
      const line = formatOkPrint({
        status: 'ok',
        challengeId: 'cid1',
        address: '0xabc',
        token: 'BEARER_MUST_NOT_APPEAR',
        secret: 'SECRET',
      });
      expect(line).to.include('status=ok');
      expect(line).to.include('challengeId=cid1');
      expect(line).to.include('address=0xabc');
      expect(line).to.not.include('BEARER');
      expect(line).to.not.include('SECRET');
      expect(line).to.not.match(/token=/i);
    });
  });

  describe('pollResultOnly (t02)', () => {
    it('keeps polling on pending; exit path ok', async () => {
      let n = 0;
      const clock = { t: 0 };
      const out = await pollResultOnly({
        hostBase: 'http://h',
        signToken: 'tok',
        pollMs: 5,
        timeoutMs: 1000,
        nowMs: () => clock.t,
        sleep: async (ms) => {
          clock.t += ms;
        },
        fetchImpl: async () => {
          n += 1;
          if (n < 3) {
            return { status: 200, json: { ok: true, status: 'pending' }, text: '' };
          }
          return {
            status: 200,
            json: { ok: true, status: 'ok', challengeId: 'c', address: '0x1' },
            text: '',
          };
        },
      });
      expect(out.ok).to.equal(true);
      expect(out.result.status).to.equal('ok');
      expect(n).to.be.at.least(3);
    });

    it('fail-closed on first 4xx (not wait for timeout)', async () => {
      const out = await pollResultOnly({
        hostBase: 'http://h',
        signToken: 'tok',
        pollMs: 5,
        timeoutMs: 10_000,
        nowMs: () => 0,
        sleep: async () => {},
        fetchImpl: async () => ({ status: 404, json: { ok: false }, text: '' }),
      });
      expect(out.ok).to.equal(false);
      expect(out.reason).to.equal('http_4xx');
      expect(out.status).to.equal(404);
    });

    it('fail-closed on local timeout while pending', async () => {
      const clock = { t: 0 };
      const out = await pollResultOnly({
        hostBase: 'http://h',
        signToken: 'tok',
        pollMs: 50,
        timeoutMs: 100,
        nowMs: () => clock.t,
        sleep: async (ms) => {
          clock.t += ms;
        },
        fetchImpl: async () => ({
          status: 200,
          json: { ok: true, status: 'pending' },
          text: '',
        }),
      });
      expect(out.ok).to.equal(false);
      expect(out.reason).to.equal('timeout');
    });
  });

  describe('runPoc integration (t01–t03)', () => {
    it('mints, prints URL, polls ok, exit 0; no secret dump', async () => {
      const lines = [];
      const errLines = [];
      let step = 0;
      const code = await runPoc({
        env: BASE_ENV,
        loadDotenv: false,
        stdout: { write: (s) => lines.push(String(s)) },
        stderr: { write: (s) => errLines.push(String(s)) },
        nowMs: () => 0,
        sleep: async () => {},
        fetchImpl: async (method, url) => {
          if (method === 'POST' && String(url).endsWith('/sign/mint')) {
            return {
              status: 200,
              json: {
                ok: true,
                signToken: 'aabbccdd11223344aabbccdd11223344',
                url: 'https://sign.test.example/sign/aabbccdd11223344aabbccdd11223344',
                challengeId: 'cid',
                expiresAt: '2099-01-01T00:00:00.000Z',
              },
              text: '',
            };
          }
          if (method === 'GET' && String(url).includes('/result')) {
            step += 1;
            if (step === 1) {
              return { status: 200, json: { ok: true, status: 'pending' }, text: '' };
            }
            return {
              status: 200,
              json: {
                ok: true,
                status: 'ok',
                challengeId: 'cid',
                address: BASE_ENV.CAPY_POOL_ADDRESS,
                token: 'MUST_NOT_PRINT',
              },
              text: '',
            };
          }
          throw new Error(`unexpected ${method} ${url}`);
        },
      });
      expect(code).to.equal(0);
      const joined = lines.join('');
      expect(joined).to.include('Open sign URL');
      expect(joined).to.include('/sign/aabbccdd11223344aabbccdd11223344');
      expect(joined).to.include('status=ok');
      expect(joined).to.not.include('MUST_NOT_PRINT');
      expect(joined).to.not.include('mint-secret');
      expect(errLines.join('')).to.equal('');
    });

    it('mint fail → exit 1 before poll', async () => {
      const errLines = [];
      const code = await runPoc({
        env: BASE_ENV,
        loadDotenv: false,
        stdout: { write: () => {} },
        stderr: { write: (s) => errLines.push(String(s)) },
        fetchImpl: async () => ({
          status: 503,
          json: { ok: false, error: 'ESIGN_MINT_SECRET_UNSET' },
          text: '',
        }),
      });
      expect(code).to.equal(1);
      expect(errLines.join('')).to.include('mint failed');
    });
  });
});
