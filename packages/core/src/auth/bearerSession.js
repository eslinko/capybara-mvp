'use strict';

const crypto = require('crypto');
const { requireAuthEnvClasses } = require('./loadAuthEnvConfig');
const { authError } = require('./errors');

/** Default bearer TTL: 1 hour. */
const DEFAULT_BEARER_TTL_MS = 60 * 60 * 1000;

/**
 * @typedef {{
 *   token: string,
 *   userId: string,
 *   address: string,
 *   issuedAt: string,
 *   expiresAt: string,
 *   expiresAtMs: number
 * }} BearerSession
 */

/**
 * In-memory bearer session store (not cookie; not login private keys).
 */
class BearerSessionStore {
  constructor() {
    /** @type {Map<string, BearerSession>} */
    this._sessions = new Map();
  }

  /**
   * @param {BearerSession} session
   * @returns {BearerSession}
   */
  put(session) {
    this._sessions.set(session.token, { ...session });
    return { ...session };
  }

  /**
   * @param {string} token
   * @returns {BearerSession | null}
   */
  get(token) {
    const row = this._sessions.get(token);
    return row ? { ...row } : null;
  }

  /**
   * @param {string} token
   * @returns {boolean}
   */
  delete(token) {
    return this._sessions.delete(token);
  }

  /** @returns {number} */
  size() {
    return this._sessions.size;
  }
}

/**
 * Issue bearer after successful bind. Transport = bearer (not cookie).
 *
 * @param {BearerSessionStore} store
 * @param {{ userId: string, address: string }} link
 * @param {import('./loadAuthEnvConfig').AuthEnvConfig} config
 * @param {{ nowMs?: number, ttlMs?: number }} [opts]
 * @returns {BearerSession}
 */
function issueBearerSession(store, link, config, opts = {}) {
  requireAuthEnvClasses(config);
  if (!store || typeof store.put !== 'function') {
    throw authError('EAUTH_BAD_PAYLOAD', 'BearerSessionStore required');
  }
  if (!link?.userId || !link?.address) {
    throw authError('EAUTH_BAD_PAYLOAD', 'SupabaseUserLink userId+address required');
  }

  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const ttlMs = Number.isFinite(opts.ttlMs) && opts.ttlMs > 0 ? opts.ttlMs : DEFAULT_BEARER_TTL_MS;
  const expiresAtMs = nowMs + ttlMs;
  const nonce = crypto.randomBytes(24).toString('hex');
  const mac = crypto
    .createHmac('sha256', config.bearerSecret)
    .update(`${link.userId}:${link.address}:${nonce}:${expiresAtMs}`)
    .digest('hex');
  const token = `${nonce}.${mac}`;

  const session = {
    token,
    userId: link.userId,
    address: link.address,
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
  };
  store.put(session);
  return { ...session };
}

/**
 * Validate bearer — invalid / expired / missing → fail-closed.
 *
 * @param {BearerSessionStore} store
 * @param {string | null | undefined} token
 * @param {import('./loadAuthEnvConfig').AuthEnvConfig} config
 * @param {{ nowMs?: number }} [opts]
 * @returns {BearerSession}
 */
function validateBearer(store, token, config, opts = {}) {
  requireAuthEnvClasses(config);
  if (typeof token !== 'string' || !token.trim()) {
    throw authError('EAUTH_SESSION_MISSING', 'Bearer token missing');
  }
  const session = store.get(token.trim());
  if (!session) {
    throw authError('EAUTH_SESSION_INVALID', 'Bearer session unknown or logged out');
  }
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  if (nowMs > session.expiresAtMs) {
    store.delete(session.token);
    throw authError('EAUTH_SESSION_EXPIRED', 'Bearer session expired');
  }
  // Integrity check against current secret (rotated secret → invalid)
  const [nonce, mac] = session.token.split('.');
  if (!nonce || !mac) {
    throw authError('EAUTH_SESSION_INVALID', 'Bearer token malformed');
  }
  const expected = crypto
    .createHmac('sha256', config.bearerSecret)
    .update(`${session.userId}:${session.address}:${nonce}:${session.expiresAtMs}`)
    .digest('hex');
  if (expected !== mac) {
    throw authError('EAUTH_SESSION_INVALID', 'Bearer token signature mismatch');
  }
  return { ...session };
}

/**
 * Logout invalidates session.
 *
 * @param {BearerSessionStore} store
 * @param {string | null | undefined} token
 * @returns {boolean}
 */
function logoutBearer(store, token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw authError('EAUTH_SESSION_MISSING', 'Bearer token missing');
  }
  return store.delete(token.trim());
}

module.exports = {
  BearerSessionStore,
  issueBearerSession,
  validateBearer,
  logoutBearer,
  DEFAULT_BEARER_TTL_MS,
};
