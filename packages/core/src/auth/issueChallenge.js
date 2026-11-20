'use strict';

const crypto = require('crypto');
const { normalizeAddress } = require('../membership/normalize');
const { buildSiweClassMessage } = require('./buildSiweClassMessage');
const { authError } = require('./errors');

/** Default challenge TTL: 5 minutes. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Issue a one-time AuthChallenge bound to a normalized address.
 *
 * @param {import('./ChallengeStore').ChallengeStore} store
 * @param {unknown} address
 * @param {{
 *   nowMs?: number,
 *   ttlMs?: number,
 *   domain?: string,
 *   uri?: string,
 *   statement?: string,
 *   id?: string,
 *   nonce?: string
 * }} [opts]
 * @returns {{
 *   challengeId: string,
 *   address: string,
 *   nonce: string,
 *   message: string,
 *   issuedAt: string,
 *   expiresAt: string,
 *   expiresAtMs: number
 * }}
 */
function issueChallenge(store, address, opts = {}) {
  if (!store || typeof store.put !== 'function') {
    throw authError('EAUTH_BAD_PAYLOAD', 'ChallengeStore required');
  }

  const normalized = normalizeAddress(address);
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const ttlMs = Number.isFinite(opts.ttlMs) && opts.ttlMs > 0 ? opts.ttlMs : DEFAULT_TTL_MS;
  const expiresAtMs = nowMs + ttlMs;
  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(expiresAtMs).toISOString();
  const nonce = opts.nonce ?? crypto.randomBytes(16).toString('hex');
  const id = opts.id ?? crypto.randomBytes(16).toString('hex');

  const message = buildSiweClassMessage({
    address: normalized,
    nonce,
    issuedAt,
    expiresAt,
    domain: opts.domain,
    uri: opts.uri,
    statement: opts.statement,
  });

  const record = {
    id,
    address: normalized,
    nonce,
    message,
    issuedAt,
    expiresAt,
    expiresAtMs,
  };
  store.put(record);

  return {
    challengeId: id,
    address: normalized,
    nonce,
    message,
    issuedAt,
    expiresAt,
    expiresAtMs,
  };
}

module.exports = {
  issueChallenge,
  DEFAULT_TTL_MS,
};
