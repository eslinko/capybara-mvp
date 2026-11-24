'use strict';

const crypto = require('crypto');

/**
 * Minimal in-memory SignTokenStore (WPROOF-01 shell; mint API = WPROOF-02).
 * Token opens challenge only while pending. Redeploy residual: cleared.
 */

class SignTokenStore {
  constructor() {
    /** @type {Map<string, {
     *   challengeId: string,
     *   expiresAtMs: number,
     *   htmlConsumed: boolean,
     *   resultStatus: 'pending'|'ok',
     *   result?: { challengeId: string, address?: string },
     *   clientEvents: Array<{ type: string, atMs: number }>
     * }>} */
    this._byToken = new Map();
  }

  /**
   * @param {{ challengeId: string, expiresAtMs: number }} opts
   * @returns {string} signToken hex
   */
  create(opts) {
    const challengeId = String(opts.challengeId || '').trim();
    const expiresAtMs = Number(opts.expiresAtMs);
    if (!challengeId) {
      throw new Error('SignTokenStore.create requires challengeId');
    }
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
      throw new Error('SignTokenStore.create requires expiresAtMs');
    }
    const signToken = crypto.randomBytes(16).toString('hex');
    this._byToken.set(signToken, {
      challengeId,
      expiresAtMs,
      htmlConsumed: false,
      resultStatus: 'pending',
      clientEvents: [],
    });
    return signToken;
  }

  /**
   * @param {string} signToken
   * @param {number} [nowMs]
   * @returns {null | object}
   */
  get(signToken, nowMs = Date.now()) {
    const key = String(signToken || '').trim().toLowerCase();
    const row = this._byToken.get(key);
    if (!row) return null;
    if (nowMs > row.expiresAtMs) return null;
    return { signToken: key, ...row };
  }

  /**
   * @param {string} signToken
   * @param {{ type: string }} event
   * @param {number} [nowMs]
   * @returns {boolean}
   */
  recordClientEvent(signToken, event, nowMs = Date.now()) {
    const row = this.get(signToken, nowMs);
    if (!row) return false;
    if (row.resultStatus === 'ok') return true; // no-op after ok
    const stored = this._byToken.get(row.signToken);
    stored.clientEvents.push({
      type: String(event && event.type ? event.type : ''),
      atMs: nowMs,
    });
    // wallet_reject must NOT terminalize /result
    return true;
  }

  /**
   * @param {string} signToken
   * @param {{ challengeId: string, address?: string }} result
   * @param {number} [nowMs]
   * @returns {boolean}
   */
  writeOk(signToken, result, nowMs = Date.now()) {
    const row = this.get(signToken, nowMs);
    if (!row) return false;
    const stored = this._byToken.get(row.signToken);
    stored.resultStatus = 'ok';
    stored.result = {
      challengeId: String(result.challengeId || ''),
      address: result.address ? String(result.address) : undefined,
    };
    stored.htmlConsumed = true;
    return true;
  }

  /**
   * @param {string} signToken
   * @param {number} [nowMs]
   * @returns {null | { status: string, challengeId?: string, address?: string }}
   */
  getResult(signToken, nowMs = Date.now()) {
    const key = String(signToken || '').trim().toLowerCase();
    const stored = this._byToken.get(key);
    if (!stored) return null;
    if (nowMs > stored.expiresAtMs && stored.resultStatus !== 'ok') return null;
    if (nowMs > stored.expiresAtMs && stored.resultStatus === 'ok') return null;
    if (stored.resultStatus === 'ok') {
      return {
        status: 'ok',
        challengeId: stored.result && stored.result.challengeId,
        address: stored.result && stored.result.address,
      };
    }
    return { status: 'pending' };
  }
}

module.exports = { SignTokenStore };
