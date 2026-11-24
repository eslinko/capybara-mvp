'use strict';

const crypto = require('crypto');

/**
 * In-memory SignTokenStore (WPROOF-01 shell + WPROOF-02 mint/result).
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
    /** @type {Map<string, string>} challengeId → signToken (active binding) */
    this._byChallengeId = new Map();
    /** Test/inject: next writeOkByChallengeId returns false without mutating */
    this._failNextWriteOk = false;
  }

  /**
   * @param {boolean} flag
   */
  setFailNextWriteOk(flag) {
    this._failNextWriteOk = Boolean(flag);
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
    const existingTok = this._byChallengeId.get(challengeId);
    if (existingTok) {
      const existing = this._byToken.get(existingTok);
      if (existing && existing.resultStatus !== 'ok') {
        const err = new Error(
          'SignTokenStore: challengeId already has an active signToken',
        );
        err.code = 'ESIGN_CHALLENGE_TOKEN_BOUND';
        throw err;
      }
    }
    const signToken = crypto.randomBytes(16).toString('hex');
    this._byToken.set(signToken, {
      challengeId,
      expiresAtMs,
      htmlConsumed: false,
      resultStatus: 'pending',
      clientEvents: [],
    });
    this._byChallengeId.set(challengeId, signToken);
    return signToken;
  }

  /**
   * @param {string} challengeId
   * @param {number} [nowMs]
   * @returns {null | string}
   */
  getTokenByChallengeId(challengeId, nowMs = Date.now()) {
    const cid = String(challengeId || '').trim();
    const tok = this._byChallengeId.get(cid);
    if (!tok) return null;
    const row = this.get(tok, nowMs);
    if (!row) return null;
    return tok;
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
   * Write result=ok then mark HTML consumed (arch-02 order steps 2–3).
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
   * Resolve token by challengeId and writeOk (verify-success hook).
   * @param {string} challengeId
   * @param {{ challengeId: string, address?: string }} result
   * @param {number} [nowMs]
   * @returns {boolean}
   */
  writeOkByChallengeId(challengeId, result, nowMs = Date.now()) {
    if (this._failNextWriteOk) {
      this._failNextWriteOk = false;
      return false;
    }
    const cid = String(challengeId || '').trim();
    const tok = this._byChallengeId.get(cid);
    if (!tok) return false;
    return this.writeOk(tok, result, nowMs);
  }

  /**
   * Mark HTML closed without changing /result (residual: mark after write).
   * @param {string} signToken
   * @param {number} [nowMs]
   * @returns {boolean}
   */
  markHtmlConsumed(signToken, nowMs = Date.now()) {
    const key = String(signToken || '').trim().toLowerCase();
    const stored = this._byToken.get(key);
    if (!stored) return false;
    if (nowMs > stored.expiresAtMs && stored.resultStatus !== 'ok') return false;
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
    // ok readable until expiresAt; then gone (4xx)
    if (nowMs > stored.expiresAtMs) return null;
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
