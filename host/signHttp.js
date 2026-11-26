'use strict';

const { URL } = require('url');
const { SignTokenStore } = require('./signTokenStore');
const { createSignSessionController } = require('./signClient');
const { issueChallenge } = require('../packages/core/src/auth');

const MINT_SECRET_HEADER = 'x-capy-sign-mint-secret';

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
    label{display:block;margin:1rem 0 0.25rem}
    input#capy-address{width:100%;max-width:36rem;padding:0.5rem;font-family:ui-monospace,monospace;box-sizing:border-box}
    button{margin:0.25rem 0.5rem 0.25rem 0;padding:0.5rem 1rem}
    #status{margin-top:1rem;white-space:pre-wrap}
    .err{color:#a00}
    #poc-banner{border:1px solid #888;padding:0.5rem 0.75rem;margin:0 0 1rem;background:#f7f7f7;font-size:0.9rem}
    #status-steps{list-style:decimal;padding-left:1.25rem;margin:1rem 0}
    #status-steps li{margin:0.15rem 0;opacity:0.45}
    #status-steps li.active{opacity:1;font-weight:600}
    #status-steps li.done{opacity:0.85}
    #status-steps li.fail{opacity:1;color:#a00}
    #outcome{margin-top:1rem;display:none}
    #outcome.visible{display:block}
    #copy-actions{margin-top:0.75rem;display:none}
    #copy-actions.visible{display:block}
    .mono{font-family:ui-monospace,monospace;word-break:break-all}
  </style>
</head>
<body>
  <p id="poc-banner" data-capy-poc="residual">POC / residual · same-host Sign · Connector = target wallet UX · no product private keys on this page</p>
  <h1>Capybara address proof</h1>
  <p>Enter or paste the wallet address to prove, then Connect &amp; Sign.</p>
  <label for="capy-address">Wallet address</label>
  <input type="text" id="capy-address" name="address" autocomplete="off" spellcheck="false" placeholder="0x…"/>
  <p>
  <button type="button" id="btn-run">Connect &amp; Sign</button>
  <button type="button" id="btn-retry" hidden>Retry</button>
  </p>
  <ol id="status-steps" aria-label="Sign process">
    <li data-step="bind">bind</li>
    <li data-step="connect">connect</li>
    <li data-step="sign">sign</li>
    <li data-step="verify">verify</li>
    <li data-step="outcome">outcome</li>
  </ol>
  <div id="status"></div>
  <div id="outcome">
    <p><strong>Auth user Present</strong></p>
    <p>userId: <span id="out-userid" class="mono"></span></p>
    <p>address: <span id="out-address" class="mono"></span></p>
  </div>
  <div id="copy-actions">
    <button type="button" id="btn-copy-proof">Copy proof</button>
    <button type="button" id="btn-copy-bearer">Copy Bearer</button>
    <button type="button" id="btn-copy-verify">Copy verify JSON</button>
  </div>
  <script>
    window.__CAPY_SIGN_BOOTSTRAP__ = ${bootstrapJson};
    window.__CAPY_SIGN_TOKEN__ = ${tokenJson};
    window.__CAPY_LAST_VERIFY__ = null;
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
  // WPROOF-08: ordered steps · userId surface · copy · fail codes · POC banner (HTML).
  return `'use strict';
(function () {
  var STEP_ORDER = ['bind', 'connect', 'sign', 'verify', 'outcome'];
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
  function resetSteps() {
    var items = document.querySelectorAll('#status-steps [data-step]');
    for (var i = 0; i < items.length; i++) {
      items[i].className = '';
    }
  }
  function markStep(step, state) {
    var el = document.querySelector('#status-steps [data-step="' + step + '"]');
    if (!el) return;
    el.className = state || '';
  }
  function advanceTo(step) {
    var idx = STEP_ORDER.indexOf(step);
    if (idx < 0) return;
    for (var i = 0; i < STEP_ORDER.length; i++) {
      if (i < idx) markStep(STEP_ORDER[i], 'done');
      else if (i === idx) markStep(STEP_ORDER[i], 'active');
      else markStep(STEP_ORDER[i], '');
    }
  }
  function failAt(step) {
    advanceTo(step);
    markStep(step, 'fail');
  }
  function hideCapture() {
    var outcome = document.getElementById('outcome');
    var copy = document.getElementById('copy-actions');
    if (outcome) outcome.className = '';
    if (copy) copy.className = '';
    window.__CAPY_LAST_VERIFY__ = null;
  }
  function showSuccessCapture(json) {
    window.__CAPY_LAST_VERIFY__ = json;
    var outcome = document.getElementById('outcome');
    var copy = document.getElementById('copy-actions');
    var uid = document.getElementById('out-userid');
    var addr = document.getElementById('out-address');
    if (uid) uid.textContent = json.userId != null ? String(json.userId) : '';
    if (addr) addr.textContent = json.address != null ? String(json.address) : '';
    if (outcome) outcome.className = 'visible';
    if (copy) copy.className = 'visible';
  }
  function copyText(label, text) {
    var statusEl = document.getElementById('status');
    if (text == null || text === '') {
      setStatus(statusEl, 'Copy ' + label + ' failed: empty', true);
      return;
    }
    var done = function () {
      setStatus(statusEl, 'Copied ' + label + '.');
    };
    var fail = function () {
      setStatus(statusEl, 'Copy ' + label + ' failed: clipboard unavailable', true);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(String(text)).then(done).catch(fail);
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = String(text);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (_) {
      fail();
    }
  }
  function readEnteredAddress() {
    var el = document.getElementById('capy-address');
    return el && typeof el.value === 'string' ? el.value.trim() : '';
  }
  async function bindEnteredAddress(signToken, address) {
    var res = await fetch('/sign/' + encodeURIComponent(signToken) + '/bind-address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address })
    });
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok || !json.ok) {
      var err = new Error((json && json.error) || ('bind-address HTTP ' + res.status));
      err.code = (json && json.error) || 'ESIGN_BIND_FAILED';
      err.payload = json;
      throw err;
    }
    return json;
  }
  async function runFlow() {
    var statusEl = document.getElementById('status');
    var bootstrap = window.__CAPY_SIGN_BOOTSTRAP__;
    var signToken = window.__CAPY_SIGN_TOKEN__;
    var ethereum = window.ethereum;
    hideCapture();
    resetSteps();
    if (!ethereum || typeof ethereum.request !== 'function') {
      failAt('connect');
      setStatus(statusEl, 'No EIP-1193 provider (install MetaMask). [ESIGN_NO_PROVIDER]', true);
      return;
    }
    if (!bootstrap || typeof bootstrap.message !== 'string') {
      failAt('bind');
      setStatus(statusEl, 'Missing bootstrap challenge. [ESIGN_NO_BOOTSTRAP]', true);
      return;
    }
    var entered = readEnteredAddress();
    if (!entered) {
      failAt('bind');
      setStatus(statusEl, 'Enter or paste a wallet address before Connect & Sign. [ESIGN_ADDRESS_REQUIRED]', true);
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
        failAt('sign');
        setStatus(statusEl, 'Account switched — in-flight sign aborted. Connect & Sign again. [ESIGN_ACCOUNT_SWITCH]', true);
      }
    }
    if (typeof ethereum.on === 'function') ethereum.on('accountsChanged', onAccountsChanged);
    try {
      advanceTo('bind');
      setStatus(statusEl, 'Binding challenge to entered address…');
      var bound = await bindEnteredAddress(signToken, entered);
      bootstrap.challengeId = bound.challengeId;
      bootstrap.message = bound.message;
      bootstrap.address = bound.address;
      bootstrap.expiresAt = bound.expiresAt;
      window.__CAPY_SIGN_BOOTSTRAP__ = bootstrap;
      entered = String(bound.address || entered);
      advanceTo('connect');
      setStatus(statusEl, 'Connecting…');
      var accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      connected = accounts && accounts[0] ? String(accounts[0]) : '';
      if (!connected) {
        failAt('connect');
        setStatus(statusEl, 'No account. [ESIGN_NO_ACCOUNT]', true);
        return;
      }
      if (connected.toLowerCase() !== entered.toLowerCase()) {
        failAt('connect');
        setStatus(
          statusEl,
          'MetaMask account does not match entered address. Switch account or fix the address field. [EMISMATCH_ACCOUNT]',
          true
        );
        return;
      }
      var myGen = gen;
      advanceTo('sign');
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
          failAt('sign');
          setStatus(statusEl, 'Sign cancelled. You can retry the same page while the session is pending. [ESIGN_WALLET_REJECT]', true);
          document.getElementById('btn-retry').hidden = false;
          return;
        }
        throw err;
      }
      if (aborted || myGen !== gen) {
        failAt('sign');
        setStatus(statusEl, 'Ignored late signature after account switch. [ESIGN_ACCOUNT_SWITCH]', true);
        return;
      }
      advanceTo('verify');
      setStatus(statusEl, 'Verifying…');
      var res = await fetch('/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: bootstrap.challengeId, signature: signature })
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.ok) {
        var code = json.error || res.status;
        var msg = json.message ? String(json.message) : '';
        var failLine = 'Verify failed: ' + code + (msg ? ' — ' + msg : '') + ' (HTTP ' + res.status + ')';
        failAt('verify');
        setStatus(statusEl, failLine, true);
        try {
          console.warn('[capy-sign]', { error: code, message: msg || null, status: res.status });
        } catch (_) {}
        return;
      }
      advanceTo('outcome');
      markStep('outcome', 'done');
      showSuccessCapture(json);
      setStatus(
        statusEl,
        'Verified. userId: ' + (json.userId || '') + ' · address: ' + (json.address || connected)
      );
    } catch (err) {
      var code = (err && err.code) || 'ESIGN_FLOW_ERROR';
      failAt('outcome');
      setStatus(statusEl, String(err && err.message ? err.message : err) + ' [' + code + ']', true);
    }
  }
  var addrInput = document.getElementById('capy-address');
  if (addrInput && window.__CAPY_SIGN_BOOTSTRAP__ && window.__CAPY_SIGN_BOOTSTRAP__.address) {
    addrInput.value = String(window.__CAPY_SIGN_BOOTSTRAP__.address);
  }
  var btn = document.getElementById('btn-run');
  var retry = document.getElementById('btn-retry');
  if (btn) btn.addEventListener('click', runFlow);
  if (retry) retry.addEventListener('click', runFlow);
  var btnProof = document.getElementById('btn-copy-proof');
  var btnBearer = document.getElementById('btn-copy-bearer');
  var btnVerify = document.getElementById('btn-copy-verify');
  if (btnProof) {
    btnProof.addEventListener('click', function () {
      var v = window.__CAPY_LAST_VERIFY__;
      copyText('proof', v && v.proof != null ? JSON.stringify(v.proof) : '');
    });
  }
  if (btnBearer) {
    btnBearer.addEventListener('click', function () {
      var v = window.__CAPY_LAST_VERIFY__;
      copyText('Bearer', v && v.token != null ? String(v.token) : '');
    });
  }
  if (btnVerify) {
    btnVerify.addEventListener('click', function () {
      var v = window.__CAPY_LAST_VERIFY__;
      copyText('verify JSON', v != null ? JSON.stringify(v) : '');
    });
  }
})();
`;
}

/**
 * Parse CAPY_PUBLIC_BASE_URL — absolute HTTPS origin, no trailing slash.
 * @param {string | undefined} raw
 * @returns {{ baseUrl: string, hostname: string } | null}
 */
function parsePublicBaseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.pathname && parsed.pathname !== '/') return null;
  if (parsed.search || parsed.hash) return null;
  if (!parsed.hostname) return null;
  return { baseUrl: trimmed, hostname: parsed.hostname };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {import('http').IncomingMessage} req
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function checkMintAuth(env, req) {
  const secret =
    env && typeof env.CAPY_SIGN_MINT_SECRET === 'string'
      ? env.CAPY_SIGN_MINT_SECRET.trim()
      : '';
  if (!secret) {
    return { ok: false, status: 503, error: 'ESIGN_MINT_SECRET_UNSET' };
  }
  const header =
    req.headers && typeof req.headers[MINT_SECRET_HEADER] === 'string'
      ? String(req.headers[MINT_SECRET_HEADER]).trim()
      : '';
  if (!header || header !== secret) {
    return { ok: false, status: 401, error: 'ESIGN_MINT_UNAUTHORIZED' };
  }
  return { ok: true };
}

/**
 * @param {{
 *   signTokenStore?: SignTokenStore,
 *   challenges?: import('../packages/core/src/auth/ChallengeStore').ChallengeStore,
 *   nowMs?: number | (() => number),
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>
 * }} [opts]
 */
function createSignRuntime(opts = {}) {
  return {
    signTokens: opts.signTokenStore || new SignTokenStore(),
    challenges: opts.challenges || null,
    env: opts.env || process.env,
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
  if (pathname === '/sign/mint' || pathname === '/sign/mint/') {
    return { kind: 'mint' };
  }
  const mResult = pathname.match(/^\/sign\/([a-fA-F0-9]+)\/result\/?$/);
  if (mResult) return { kind: 'result', signToken: mResult[1].toLowerCase() };
  const mEvent = pathname.match(/^\/sign\/([a-fA-F0-9]+)\/client-event\/?$/);
  if (mEvent) return { kind: 'client_event', signToken: mEvent[1].toLowerCase() };
  const mBind = pathname.match(/^\/sign\/([a-fA-F0-9]+)\/bind-address\/?$/);
  if (mBind) return { kind: 'bind_address', signToken: mBind[1].toLowerCase() };
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

  if (match.kind === 'mint') {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: 'ESIGN_METHOD' });
      return true;
    }
    const auth = checkMintAuth(runtime.env || {}, req);
    if (!auth.ok) {
      writeJson(res, auth.status, { ok: false, error: auth.error });
      return true;
    }
    const base = parsePublicBaseUrl(
      runtime.env && runtime.env.CAPY_PUBLIC_BASE_URL,
    );
    if (!base) {
      writeJson(res, 503, { ok: false, error: 'ESIGN_PUBLIC_BASE_URL_UNSET' });
      return true;
    }
    if (!runtime.challenges) {
      writeJson(res, 503, { ok: false, error: 'ESIGN_NO_CHALLENGE_STORE' });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (_) {
      writeJson(res, 400, { ok: false, error: 'ESIGN_BAD_JSON' });
      return true;
    }
    const address = body && typeof body.address === 'string' ? body.address : '';
    if (!address.trim()) {
      writeJson(res, 400, { ok: false, error: 'ESIGN_ADDRESS_REQUIRED' });
      return true;
    }
    let issued;
    try {
      issued = issueChallenge(runtime.challenges, address, {
        nowMs: now,
        domain: base.hostname,
        uri: `${base.baseUrl}/sign`,
      });
    } catch (err) {
      writeJson(res, 400, {
        ok: false,
        error: (err && err.code) || 'ESIGN_ISSUE_CHALLENGE',
        message: err && err.message ? String(err.message) : 'issue failed',
      });
      return true;
    }
    let signToken;
    try {
      signToken = runtime.signTokens.create({
        challengeId: issued.challengeId,
        expiresAtMs: issued.expiresAtMs,
      });
    } catch (err) {
      writeJson(res, 409, {
        ok: false,
        error: (err && err.code) || 'ESIGN_TOKEN_CREATE',
        message: err && err.message ? String(err.message) : 'token create failed',
      });
      return true;
    }
    writeJson(res, 200, {
      ok: true,
      signToken,
      url: `${base.baseUrl}/sign/${signToken}`,
      challengeId: issued.challengeId,
      expiresAt: issued.expiresAt,
    });
    return true;
  }

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

  if (match.kind === 'bind_address' && req.method === 'POST') {
    const row = runtime.signTokens.get(match.signToken, now);
    if (!row || row.htmlConsumed || row.resultStatus === 'ok') {
      writeJson(res, 404, { ok: false, error: 'ESIGN_TOKEN_UNAVAILABLE' });
      return true;
    }
    if (!runtime.challenges) {
      writeJson(res, 503, { ok: false, error: 'ESIGN_NO_CHALLENGE_STORE' });
      return true;
    }
    const base = parsePublicBaseUrl(
      runtime.env && runtime.env.CAPY_PUBLIC_BASE_URL,
    );
    if (!base) {
      writeJson(res, 503, { ok: false, error: 'ESIGN_PUBLIC_BASE_URL_UNSET' });
      return true;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (_) {
      writeJson(res, 400, { ok: false, error: 'ESIGN_BAD_JSON' });
      return true;
    }
    const address = body && typeof body.address === 'string' ? body.address.trim() : '';
    if (!address) {
      writeJson(res, 400, { ok: false, error: 'ESIGN_ADDRESS_REQUIRED' });
      return true;
    }
    // Idempotent: same address as current pending challenge → return bootstrap
    try {
      const current = runtime.challenges.get(row.challengeId);
      if (
        current &&
        now <= current.expiresAtMs &&
        String(current.address || '').toLowerCase() === address.toLowerCase()
      ) {
        writeJson(res, 200, {
          ok: true,
          challengeId: current.id || row.challengeId,
          message: current.message,
          address: current.address,
          expiresAt: current.expiresAt,
          rebound: false,
        });
        return true;
      }
    } catch (_) {
      // challenge missing/expired → issue fresh below
    }
    let issued;
    try {
      issued = issueChallenge(runtime.challenges, address, {
        nowMs: now,
        domain: base.hostname,
        uri: `${base.baseUrl}/sign`,
      });
    } catch (err) {
      writeJson(res, 400, {
        ok: false,
        error: (err && err.code) || 'ESIGN_ISSUE_CHALLENGE',
        message: err && err.message ? String(err.message) : 'issue failed',
      });
      return true;
    }
    try {
      const rebound = runtime.signTokens.rebindChallenge(
        match.signToken,
        { challengeId: issued.challengeId, expiresAtMs: issued.expiresAtMs },
        now,
      );
      if (!rebound) {
        writeJson(res, 404, { ok: false, error: 'ESIGN_TOKEN_UNAVAILABLE' });
        return true;
      }
    } catch (err) {
      writeJson(res, 409, {
        ok: false,
        error: (err && err.code) || 'ESIGN_TOKEN_REBIND',
        message: err && err.message ? String(err.message) : 'rebind failed',
      });
      return true;
    }
    writeJson(res, 200, {
      ok: true,
      challengeId: issued.challengeId,
      message: issued.message,
      address: issued.address,
      expiresAt: issued.expiresAt,
      rebound: true,
    });
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
  renderSignClientBrowserJs,
  matchSignPath,
  createSignSessionController,
  parsePublicBaseUrl,
  checkMintAuth,
  MINT_SECRET_HEADER,
};
