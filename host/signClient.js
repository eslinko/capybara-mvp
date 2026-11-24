'use strict';

/**
 * Browser/host-shared sign client logic (WPROOF-01).
 * No product/pool private keys (AC-W02). Testable under Node with mocks.
 */

const {
  buildPersonalSignParams,
  encodePersonalSignData,
} = require('./personalSignEncoding');

/**
 * @param {{
 *   ethereum: { request: Function, on?: Function, removeListener?: Function },
 *   bootstrap: { challengeId: string, message: string, address: string, expiresAt?: string },
 *   fetchImpl?: typeof fetch,
 *   signToken: string,
 *   nowMs?: () => number
 * }} opts
 */
function createSignSessionController(opts) {
  const ethereum = opts.ethereum;
  const bootstrap = opts.bootstrap;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const signToken = String(opts.signToken || '');
  const nowMs = opts.nowMs || (() => Date.now());

  let connectedAddress = null;
  let signGeneration = 0;
  let aborted = false;
  let status = 'idle';
  let lastError = null;
  let verifyOk = false;
  let capabilitiesGranted = false;

  function setStatus(next, err) {
    status = next;
    lastError = err || null;
  }

  function requireProvider() {
    if (!ethereum || typeof ethereum.request !== 'function') {
      const err = new Error('No EIP-1193 provider');
      err.code = 'ENO_PROVIDER';
      throw err;
    }
  }

  async function connect() {
    requireProvider();
    aborted = false;
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    const addr = Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : '';
    if (!addr) {
      const err = new Error('No account');
      err.code = 'ENO_ACCOUNT';
      throw err;
    }
    connectedAddress = addr;
    setStatus('connected');
    return addr;
  }

  function onAccountsChanged(accounts) {
    const next =
      Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : '';
    if (
      connectedAddress &&
      next &&
      next.toLowerCase() !== connectedAddress.toLowerCase()
    ) {
      aborted = true;
      signGeneration += 1;
      connectedAddress = next;
      setStatus('account_switched');
    } else if (connectedAddress && !next) {
      aborted = true;
      signGeneration += 1;
      connectedAddress = null;
      setStatus('account_switched');
    }
  }

  function bindAccountListener() {
    if (ethereum && typeof ethereum.on === 'function') {
      ethereum.on('accountsChanged', onAccountsChanged);
    }
  }

  function unbindAccountListener() {
    if (ethereum && typeof ethereum.removeListener === 'function') {
      ethereum.removeListener('accountsChanged', onAccountsChanged);
    }
  }

  /**
   * Sign exact bootstrap.message; ignore late results after account-switch.
   * @returns {Promise<string|null>} signature or null if aborted/rejected
   */
  async function signChallenge() {
    requireProvider();
    if (!connectedAddress) {
      await connect();
    }
    const gen = signGeneration;
    const message = bootstrap.message;
    if (typeof message !== 'string') {
      const err = new Error('Missing challenge message');
      err.code = 'ENO_MESSAGE';
      throw err;
    }
    // Exact message — no trim / normalize (arch-01)
    const params = buildPersonalSignParams(message, connectedAddress);
    setStatus('signing');
    try {
      const signature = await ethereum.request({
        method: 'personal_sign',
        params,
      });
      if (aborted || gen !== signGeneration) {
        setStatus('aborted');
        return null;
      }
      setStatus('signed');
      return typeof signature === 'string' ? signature : String(signature);
    } catch (err) {
      const code = err && (err.code === 4001 || err.code === 'ACTION_REJECTED');
      if (code || (err && /reject|denied|cancel/i.test(String(err.message || '')))) {
        setStatus('rejected');
        await postClientEvent({ type: 'wallet_reject' }).catch(() => {});
        return null;
      }
      setStatus('error', err);
      throw err;
    }
  }

  async function postClientEvent(body) {
    if (!signToken || typeof fetchImpl !== 'function') return null;
    const res = await fetchImpl(`/sign/${encodeURIComponent(signToken)}/client-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return res;
  }

  /**
   * POST /auth/verify — never called on reject/abort.
   * @param {string} signature
   */
  async function verify(signature) {
    if (aborted) {
      setStatus('aborted');
      return null;
    }
    if (!signature || typeof fetchImpl !== 'function') {
      const err = new Error('Missing signature or fetch');
      err.code = 'ENO_VERIFY';
      throw err;
    }
    setStatus('verifying');
    const res = await fetchImpl('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: bootstrap.challengeId,
        signature,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json || json.ok !== true) {
      verifyOk = false;
      capabilitiesGranted = false;
      setStatus('verify_failed', json);
      return json;
    }
    verifyOk = true;
    // Bearer/session may exist — capabilities still gated elsewhere; mark local only
    capabilitiesGranted = Boolean(json.token);
    setStatus('verified');
    return json;
  }

  async function run() {
    bindAccountListener();
    try {
      await connect();
      const signature = await signChallenge();
      if (!signature) {
        // reject / abort — no capabilities
        capabilitiesGranted = false;
        return { ok: false, status, capabilitiesGranted: false };
      }
      if (aborted) {
        capabilitiesGranted = false;
        return { ok: false, status: 'aborted', capabilitiesGranted: false };
      }
      const json = await verify(signature);
      return {
        ok: Boolean(json && json.ok),
        status,
        capabilitiesGranted,
        json,
      };
    } finally {
      unbindAccountListener();
    }
  }

  return {
    connect,
    signChallenge,
    verify,
    postClientEvent,
    run,
    onAccountsChanged,
    bindAccountListener,
    unbindAccountListener,
    encodePersonalSignData,
    buildPersonalSignParams,
    getState: () => ({
      status,
      lastError,
      connectedAddress,
      aborted,
      verifyOk,
      capabilitiesGranted,
      signGeneration,
    }),
  };
}

module.exports = {
  createSignSessionController,
  encodePersonalSignData,
  buildPersonalSignParams,
};
