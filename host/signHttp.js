'use strict';

const { URL } = require('url');
const { SignTokenStore } = require('./signTokenStore');
const { createSignSessionController } = require('./signClient');

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {object} obj
 * @param {Record<string, string>} [extraHeaders]
 */
function writeJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<object>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {string} signToken
 * @param {{ challengeId: string, message: string, address: string, expiresAt: string }} bootstrap
 * @returns {string}
 */
function renderSignPageHtml(signToken, bootstrap) {
  const bootstrapJson = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
  const tokenJson = JSON.stringify(signToken);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="referrer" content="no-referrer"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Capybara sign</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:2rem;max-width:40rem}
    button{margin:0.25rem 0.5rem 0.25rem 0;padding:0.5rem 1rem}
    #status{margin-top:1rem;white-space:pre-wrap}
    .err{color:#a00}
  </style>
</head>
<body>
  <h1>Capybara address proof</h1>
  <p>Connect MetaMask and Sign the host challenge. No product/pool keys on this page.</p>
  <button type="button" id="btn-run">Connect &amp; Sign</button>
  <button type="button" id="btn-retry" hidden>Retry</button>
  <div id="status"></div>
  <script>
    window.__CAPY_SIGN_BOOTSTRAP__ = ${bootstrapJson};
    window.__CAPY_SIGN_TOKEN__ = ${tokenJson};
  </script>
  <script src="/sign/client.js"></script>
</body>
</html>
`;
}

/**
 * Browser bundle entry — loads encoding + controller from same origin.
 * Served as GET /sign/client.js (CommonJS re-exported via IIFE built below).
 */
function renderSignClientBrowserJs() {
  // Inline a minimal browser adapter that talks to page globals + ethereum.
  // Encoding matches host/personalSignEncoding.js (ethers-free UTF-8→hex).
  return `'use strict';
(function () {
  function utf8ToHex(str) {
    var bytes = new TextEncoder().encode(str);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return '0x' + hex;
  }
  function buildParams(message, address) {
    return [utf8ToHex(message), address];
  }
  function setStatus(el, text, isErr) {
    el.textContent = text;
    el.className = isErr ? 'err' : '';
  }
  async function runFlow() {
    var statusEl = document.getElementById('status');
    var bootstrap = window.__CAPY_SIGN_BOOTSTRAP__;
    var signToken = window.__CAPY_SIGN_TOKEN__;
    var ethereum = window.ethereum;
    if (!ethereum || typeof ethereum.request !== 'function') {
      setStatus(statusEl, 'No EIP-1193 provider (install MetaMask).', true);
      return;
    }
    if (!bootstrap || typeof bootstrap.message !== 'string') {
      setStatus(statusEl, 'Missing bootstrap challenge.', true);
      return;
    }
    var aborted = false;
    var gen = 0;
    var connected = null;
    function onAccountsChanged(accounts) {
      var next = accounts && accounts[0] ? String(accounts[0]) : '';
      if (connected && next && next.toLowerCase() !== connected.toLowerCase()) {
        aborted = true;
        gen += 1;
        connected = next;
        setStatus(statusEl, 'Account switched — in-flight sign aborted. Connect & Sign again.', true);
      }
    }
    if (typeof ethereum.on === 'function') ethereum.on('accountsChanged', onAccountsChanged);
    try {
      setStatus(statusEl, 'Connecting…');
      var accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      connected = accounts && accounts[0] ? String(accounts[0]) : '';
      if (!connected) throw new Error('No account');
      var myGen = gen;
      setStatus(statusEl, 'Sign the challenge in the wallet…');
      var params = buildParams(bootstrap.message, connected);
      var signature;
      try {
        signature = await ethereum.request({ method: 'personal_sign', params: params });
      } catch (err) {
        var rejected = err && (err.code === 4001 || /reject|denied|cancel/i.test(String(err.message || '')));
        if (rejected) {
          try {
            await fetch('/sign/' + encodeURIComponent(signToken) + '/client-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'wallet_reject' })
            });
          } catch (_) {}
          setStatus(statusEl, 'Sign cancelled. You can retry the same page while the session is pending.', true);
          document.getElementById('btn-retry').hidden = false;
          return;
        }
        throw err;
      }
      if (aborted || myGen !== gen) {
        setStatus(statusEl, 'Ignored late signature after account switch.', true);
        return;
      }
      setStatus(statusEl, 'Verifying…');
      var res = await fetch('/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: bootstrap.challengeId, signature: signature })
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.ok) {
        setStatus(statusEl, 'Verify failed: ' + (json.error || res.status), true);
        return;
      }
      setStatus(statusEl, 'Verified. Address: ' + (json.address || connected));
    } catch (err) {
      setStatus(statusEl, String(err && err.message ? err.message : err), true);
    }
  }
  var btn = document.getElementById('btn-run');
  var retry = document.getElementById('btn-retry');
  if (btn) btn.addEventListener('click', runFlow);
  if (retry) retry.addEventListener('click', runFlow);
})();
`;
}

/**
 * @param {{
 *   signTokenStore?: SignTokenStore,
 *   challenges?: import('../packages/core/src/auth/ChallengeStore').ChallengeStore,
 *   nowMs?: number | (() => number)
 * }} [opts]
 */
function createSignRuntime(opts = {}) {
  return {
    signTokens: opts.signTokenStore || new SignTokenStore(),
    challenges: opts.challenges || null,
    nowMs:
      typeof opts.nowMs === 'function'
        ? opts.nowMs
        : () => (typeof opts.nowMs === 'number' ? opts.nowMs : Date.now()),
  };
}

/**
 * @param {string} pathname
 * @returns {{ kind: string, signToken?: string } | null}
 */
function matchSignPath(pathname) {
  if (pathname === '/sign/client.js') {
    return { kind: 'client_js' };
  }
  const mResult = pathname.match(/^\/sign\/([a-fA-F0-9]+)\/result\/?$/);
  if (mResult) return { kind: 'result', signToken: mResult[1].toLowerCase() };
  const mEvent = pathname.match(/^\/sign\/([a-fA-F0-9]+)\/client-event\/?$/);
  if (mEvent) return { kind: 'client_event', signToken: mEvent[1].toLowerCase() };
  const mPage = pathname.match(/^\/sign\/([a-fA-F0-9]+)\/?$/);
  if (mPage) return { kind: 'page', signToken: mPage[1].toLowerCase() };
  return null;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {ReturnType<typeof createSignRuntime>} runtime
 * @returns {Promise<boolean>}
 */
async function tryHandleSignRequest(req, res, runtime) {
  const pathname =
    typeof req.url === 'string' ? new URL(req.url, 'http://127.0.0.1').pathname : '';
  const match = matchSignPath(pathname);
  if (!match) return false;

  const now = runtime.nowMs();

  if (match.kind === 'client_js' && req.method === 'GET') {
    const body = renderSignClientBrowserJs();
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
    return true;
  }

  if (match.kind === 'page' && req.method === 'GET') {
    const row = runtime.signTokens.get(match.signToken, now);
    if (!row || row.htmlConsumed) {
      writeJson(res, 404, { ok: false, error: 'ESIGN_TOKEN_UNAVAILABLE' }, {
        'Referrer-Policy': 'no-referrer',
      });
      return true;
    }
    if (!runtime.challenges) {
      writeJson(res, 503, { ok: false, error: 'ESIGN_NO_CHALLENGE_STORE' }, {
        'Referrer-Policy': 'no-referrer',
      });
      return true;
    }
    let challenge;
    try {
      challenge = runtime.challenges.get(row.challengeId);
    } catch (err) {
      writeJson(
        res,
        404,
        {
          ok: false,
          error: (err && err.code) || 'ESIGN_CHALLENGE_UNAVAILABLE',
          message: err && err.message ? String(err.message) : 'challenge unavailable',
        },
        { 'Referrer-Policy': 'no-referrer' },
      );
      return true;
    }
    if (now > challenge.expiresAtMs) {
      writeJson(
        res,
        404,
        { ok: false, error: 'EAUTH_CHALLENGE_EXPIRED' },
        { 'Referrer-Policy': 'no-referrer' },
      );
      return true;
    }
    const bootstrap = {
      challengeId: challenge.id || row.challengeId,
      message: challenge.message,
      address: challenge.address,
      expiresAt: challenge.expiresAt,
    };
    const html = renderSignPageHtml(match.signToken, bootstrap);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Length': Buffer.byteLength(html),
    });
    res.end(html);
    return true;
  }

  if (match.kind === 'client_event' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ok = runtime.signTokens.recordClientEvent(
      match.signToken,
      { type: body.type || 'wallet_reject' },
      now,
    );
    if (!ok) {
      writeJson(res, 404, { ok: false, error: 'ESIGN_TOKEN_UNAVAILABLE' });
      return true;
    }
    writeJson(res, 200, { ok: true, accepted: true });
    return true;
  }

  if (match.kind === 'result' && req.method === 'GET') {
    const result = runtime.signTokens.getResult(match.signToken, now);
    if (!result) {
      writeJson(res, 404, { ok: false, error: 'ESIGN_TOKEN_UNAVAILABLE' });
      return true;
    }
    writeJson(res, 200, { ok: true, ...result });
    return true;
  }

  writeJson(res, 405, { ok: false, error: 'ESIGN_METHOD' });
  return true;
}

module.exports = {
  SignTokenStore,
  createSignRuntime,
  tryHandleSignRequest,
  renderSignPageHtml,
  matchSignPath,
  createSignSessionController,
};
