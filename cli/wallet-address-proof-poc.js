'use strict';

/**
 * Terminal wallet address-proof POC (WPROOF-05 / AC-W06).
 *
 * Usage (from capybara/):
 *   npm run wallet-proof-poc
 *   node cli/wallet-address-proof-poc.js
 *
 * Env: CAPY_POOL_ADDRESS, CAPY_SIGN_MINT_SECRET, CAPY_PUBLIC_BASE_URL
 * Optional: CAPY_POC_HOST (HTTP origin for mint/poll; default CAPY_PUBLIC_BASE_URL
 *   or http://127.0.0.1:$PORT), CAPY_POC_POLL_MS, CAPY_POC_TIMEOUT_MS
 *
 * Polls GET /sign/{signToken}/result only. Exit 0 only on status ok.
 * Reject/pending keep polling. Fail-closed: first of local timeout or /result 4xx.
 * No bearer/secret dump. Live MetaMask = human; no private key auto-sign.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { loadHostDotenv } = require('../host/loadHostDotenv');

const DEFAULT_POLL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {{
 *   poolAddress: string,
 *   mintSecret: string,
 *   publicBaseUrl: string,
 *   hostBase: string,
 *   pollMs: number,
 *   timeoutMs: number
 * }}
 */
function resolvePocConfig(env) {
  const poolAddress =
    typeof env.CAPY_POOL_ADDRESS === 'string' ? env.CAPY_POOL_ADDRESS.trim() : '';
  const mintSecret =
    typeof env.CAPY_SIGN_MINT_SECRET === 'string'
      ? env.CAPY_SIGN_MINT_SECRET.trim()
      : '';
  const publicBaseUrl =
    typeof env.CAPY_PUBLIC_BASE_URL === 'string'
      ? env.CAPY_PUBLIC_BASE_URL.trim().replace(/\/+$/, '')
      : '';
  if (!poolAddress) {
    const err = new Error('CAPY_POOL_ADDRESS is required');
    err.code = 'EPOC_POOL_ADDRESS';
    throw err;
  }
  if (!mintSecret) {
    const err = new Error('CAPY_SIGN_MINT_SECRET is required');
    err.code = 'EPOC_MINT_SECRET';
    throw err;
  }
  if (!publicBaseUrl) {
    const err = new Error('CAPY_PUBLIC_BASE_URL is required');
    err.code = 'EPOC_PUBLIC_BASE';
    throw err;
  }
  let hostBase =
    typeof env.CAPY_POC_HOST === 'string' ? env.CAPY_POC_HOST.trim().replace(/\/+$/, '') : '';
  if (!hostBase) {
    hostBase = publicBaseUrl;
  }
  if (!hostBase && env.PORT) {
    hostBase = `http://127.0.0.1:${String(env.PORT).trim()}`;
  }
  if (!hostBase) {
    const err = new Error('CAPY_POC_HOST or CAPY_PUBLIC_BASE_URL or PORT required for host HTTP');
    err.code = 'EPOC_HOST';
    throw err;
  }
  const pollMs = Number(env.CAPY_POC_POLL_MS);
  const timeoutMs = Number(env.CAPY_POC_TIMEOUT_MS);
  return {
    poolAddress,
    mintSecret,
    publicBaseUrl,
    hostBase,
    pollMs: Number.isFinite(pollMs) && pollMs > 0 ? pollMs : DEFAULT_POLL_MS,
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Residual-safe OK line — never print bearer/token/secret.
 * @param {{ challengeId?: string, address?: string, status?: string }} result
 * @returns {string}
 */
function formatOkPrint(result) {
  const address = result && result.address ? String(result.address) : '';
  const challengeId = result && result.challengeId ? String(result.challengeId) : '';
  return `OK address-proof status=ok challengeId=${challengeId} address=${address}`;
}

/**
 * @param {string} method
 * @param {string} urlStr
 * @param {{ headers?: Record<string, string>, body?: object, fetchImpl?: Function }} [opts]
 * @returns {Promise<{ status: number, json: object|null, text: string }>}
 */
function httpJson(method, urlStr, opts = {}) {
  if (typeof opts.fetchImpl === 'function') {
    return opts.fetchImpl(method, urlStr, opts);
  }
  const payload = opts.body != null ? JSON.stringify(opts.body) : null;
  const u = new URL(urlStr);
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
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
          } catch (_) {
            json = null;
          }
          resolve({ status: res.statusCode || 0, json, text: data });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * @param {{
 *   hostBase: string,
 *   poolAddress: string,
 *   mintSecret: string,
 *   fetchImpl?: Function
 * }} opts
 */
async function mintSignSession(opts) {
  const res = await httpJson('POST', `${opts.hostBase}/sign/mint`, {
    headers: { 'X-Capy-Sign-Mint-Secret': opts.mintSecret },
    body: { address: opts.poolAddress },
    fetchImpl: opts.fetchImpl,
  });
  if (res.status < 200 || res.status >= 300 || !res.json || !res.json.ok) {
    const err = new Error(
      `mint failed status=${res.status} error=${res.json && res.json.error ? res.json.error : 'unknown'}`,
    );
    err.code = 'EPOC_MINT';
    err.status = res.status;
    throw err;
  }
  return {
    signToken: String(res.json.signToken || ''),
    url: String(res.json.url || ''),
    challengeId: String(res.json.challengeId || ''),
    expiresAt: res.json.expiresAt ? String(res.json.expiresAt) : '',
  };
}

/**
 * Poll /result until ok or fail-closed (timeout or 4xx). pending keeps going.
 * @param {{
 *   hostBase: string,
 *   signToken: string,
 *   pollMs: number,
 *   timeoutMs: number,
 *   nowMs?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   fetchImpl?: Function
 * }} opts
 * @returns {Promise<{ ok: true, result: object } | { ok: false, reason: string, status?: number }>}
 */
async function pollResultOnly(opts) {
  const nowFn = typeof opts.nowMs === 'function' ? opts.nowMs : () => Date.now();
  const sleep =
    typeof opts.sleep === 'function'
      ? opts.sleep
      : (ms) => new Promise((r) => setTimeout(r, ms));
  const started = nowFn();
  const path = `${opts.hostBase}/sign/${encodeURIComponent(opts.signToken)}/result`;

  while (true) {
    const elapsed = nowFn() - started;
    if (elapsed >= opts.timeoutMs) {
      return { ok: false, reason: 'timeout' };
    }
    const res = await httpJson('GET', path, { fetchImpl: opts.fetchImpl });
    if (res.status >= 400 && res.status < 500) {
      return { ok: false, reason: 'http_4xx', status: res.status };
    }
    if (res.status >= 200 && res.status < 300 && res.json && res.json.status === 'ok') {
      return {
        ok: true,
        result: {
          status: 'ok',
          challengeId: res.json.challengeId,
          address: res.json.address,
        },
      };
    }
    // pending or transient — keep polling (reject is non-terminal)
    const remain = opts.timeoutMs - (nowFn() - started);
    if (remain <= 0) {
      return { ok: false, reason: 'timeout' };
    }
    await sleep(Math.min(opts.pollMs, remain));
  }
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   loadDotenv?: boolean,
 *   stdout?: { write: Function },
 *   stderr?: { write: Function },
 *   fetchImpl?: Function,
 *   nowMs?: () => number,
 *   sleep?: (ms: number) => Promise<void>
 * }} [opts]
 * @returns {Promise<number>} exit code
 */
async function runPoc(opts = {}) {
  const env = opts.env || process.env;
  if (opts.loadDotenv !== false) {
    loadHostDotenv(env);
  }
  const out = opts.stdout || process.stdout;
  const errOut = opts.stderr || process.stderr;

  let cfg;
  try {
    cfg = resolvePocConfig(env);
  } catch (err) {
    errOut.write(`${err && err.message ? err.message : err}\n`);
    return 1;
  }

  let minted;
  try {
    minted = await mintSignSession({
      hostBase: cfg.hostBase,
      poolAddress: cfg.poolAddress,
      mintSecret: cfg.mintSecret,
      fetchImpl: opts.fetchImpl,
    });
  } catch (err) {
    errOut.write(`${err && err.message ? err.message : err}\n`);
    return 1;
  }

  if (!minted.signToken || !minted.url) {
    errOut.write('mint response missing signToken/url\n');
    return 1;
  }

  // Print URL for human MetaMask (Channel A/B) — no secrets
  out.write(`Open sign URL (MetaMask):\n${minted.url}\n`);
  out.write(`Polling /sign/{token}/result (reject keeps pending)…\n`);

  const poll = await pollResultOnly({
    hostBase: cfg.hostBase,
    signToken: minted.signToken,
    pollMs: cfg.pollMs,
    timeoutMs: cfg.timeoutMs,
    nowMs: opts.nowMs,
    sleep: opts.sleep,
    fetchImpl: opts.fetchImpl,
  });

  if (!poll.ok) {
    errOut.write(
      `POC fail-closed reason=${poll.reason}${poll.status ? ` status=${poll.status}` : ''}\n`,
    );
    return 1;
  }

  out.write(`${formatOkPrint(poll.result)}\n`);
  // AC-W03: session usable when verify+bind Present — honesty residual if REQ-09 unset
  out.write(
    'Note: dual-auth session from page verify; REQ-09 live bind residual when not configured.\n',
  );
  return 0;
}

async function main() {
  const code = await runPoc({ loadDotenv: true });
  process.exitCode = code;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  });
}

module.exports = {
  resolvePocConfig,
  formatOkPrint,
  mintSignSession,
  pollResultOnly,
  runPoc,
  DEFAULT_POLL_MS,
  DEFAULT_TIMEOUT_MS,
};
