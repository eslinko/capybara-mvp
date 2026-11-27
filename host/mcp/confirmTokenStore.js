'use strict';

/**
 * MCP-05 Soft — ConfirmTokenStore RAM TTL (AC-M06 / invent-risk C12).
 * In-memory Map only · wipe on process restart OK · Soft≠Live · ≠ invent Redis/DB / Phase 4 Done.
 */

const crypto = require('crypto');

/** OP lock deepen pick — 300 seconds. */
const DEFAULT_TTL_MS = 300_000;

/** Soft lock: durable backends must never be configured Soft≠Live. */
const FORBIDDEN_DURABLE_BACKENDS = Object.freeze([
  'redis',
  'postgres',
  'mongodb',
  'sqlite',
  'disk',
  'file',
]);

/**
 * @typedef {{
 *   toolId: string,
 *   previewHash: string,
 *   actorMembershipId: string,
 *   expiresAtMs: number,
 * }} ConfirmTokenRecord
 */

class ConfirmTokenStore {
  /**
   * @param {{
   *   ttlMs?: number,
   *   nowFn?: () => number,
   *   idFn?: () => string,
   *   backend?: string,
   * }} [options]
   */
  constructor(options = {}) {
    const backend = String(options.backend ?? 'ram').trim().toLowerCase() || 'ram';
    if (backend !== 'ram') {
      throw Object.assign(
        new Error(
          `ConfirmTokenStore Soft≠Live: durable backend forbidden (${backend}). RAM only.`,
        ),
        { code: 'EMCP_CONFIRM_DURABLE_FORBIDDEN' },
      );
    }
    /** @type {Map<string, ConfirmTokenRecord>} */
    this._map = new Map();
    this.ttlMs =
      typeof options.ttlMs === 'number' && options.ttlMs > 0
        ? options.ttlMs
        : DEFAULT_TTL_MS;
    this._nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
    this._idFn =
      typeof options.idFn === 'function'
        ? options.idFn
        : () => crypto.randomBytes(24).toString('hex');
    /** Soft assert surface — always 'ram'. */
    this.backend = 'ram';
  }

  /**
   * Soft: store is RAM-only; no durable invent.
   * @returns {boolean}
   */
  assertRamOnly() {
    if (this.backend !== 'ram') return false;
    for (const forbidden of FORBIDDEN_DURABLE_BACKENDS) {
      if (this.backend === forbidden) return false;
    }
    if (typeof this._map?.set !== 'function' || typeof this._map?.get !== 'function') {
      return false;
    }
    return true;
  }

  /**
   * @returns {number}
   */
  size() {
    return this._map.size;
  }

  /**
   * Soft test helper — clear all tokens.
   */
  clear() {
    this._map.clear();
  }

  /**
   * Mint one-shot token Soft.
   *
   * @param {{
   *   toolId: string,
   *   previewHash: string,
   *   actorMembershipId: string,
   * }} input
   * @returns {string}
   */
  mint(input) {
    const toolId = String(input.toolId ?? '').trim();
    const previewHash = String(input.previewHash ?? '').trim();
    const actorMembershipId = String(input.actorMembershipId ?? '').trim();
    if (!toolId || !previewHash || !actorMembershipId) {
      throw Object.assign(
        new Error('ConfirmTokenStore.mint requires toolId, previewHash, actorMembershipId'),
        { code: 'EMCP_CONFIRM_MINT_INVALID' },
      );
    }
    const token = this._idFn();
    const expiresAtMs = this._nowFn() + this.ttlMs;
    this._map.set(token, {
      toolId,
      previewHash,
      actorMembershipId,
      expiresAtMs,
    });
    return token;
  }

  /**
   * Peek without consume Soft.
   *
   * @param {string} token
   * @returns {ConfirmTokenRecord | null}
   */
  peek(token) {
    const key = String(token ?? '').trim();
    if (!key) return null;
    const record = this._map.get(key);
    if (!record) return null;
    if (record.expiresAtMs <= this._nowFn()) {
      this._map.delete(key);
      return null;
    }
    return { ...record };
  }

  /**
   * Validate + one-shot consume Soft.
   *
   * @param {string} token
   * @param {{
   *   toolId: string,
   *   previewHash: string,
   *   actorMembershipId: string,
   * }} expect
   * @returns {{
   *   ok: true,
   *   record: ConfirmTokenRecord,
   * } | {
   *   ok: false,
   *   code: string,
   *   message: string,
   * }}
   */
  consume(token, expect) {
    const key = String(token ?? '').trim();
    if (!key) {
      return {
        ok: false,
        code: 'EMCP_CONFIRM_TOKEN_MISSING',
        message: 'confirm_token missing Soft',
      };
    }
    const record = this._map.get(key);
    if (!record) {
      return {
        ok: false,
        code: 'EMCP_CONFIRM_TOKEN_UNKNOWN',
        message: 'confirm_token unknown or already consumed Soft',
      };
    }
    if (record.expiresAtMs <= this._nowFn()) {
      this._map.delete(key);
      return {
        ok: false,
        code: 'EMCP_CONFIRM_TOKEN_EXPIRED',
        message: 'confirm_token expired Soft',
      };
    }
    const toolId = String(expect.toolId ?? '').trim();
    const previewHash = String(expect.previewHash ?? '').trim();
    const actorMembershipId = String(expect.actorMembershipId ?? '').trim();
    if (record.toolId !== toolId || record.previewHash !== previewHash) {
      return {
        ok: false,
        code: 'EMCP_CONFIRM_TOKEN_MISMATCH',
        message: 'confirm_token preview/tool mismatch Soft',
      };
    }
    if (record.actorMembershipId !== actorMembershipId) {
      return {
        ok: false,
        code: 'EMCP_CONFIRM_TOKEN_WRONG_ACTOR',
        message: 'confirm_token wrong actor Soft',
      };
    }
    // One-shot consume Soft
    this._map.delete(key);
    return { ok: true, record: { ...record } };
  }
}

/** Process-local default Soft store (wipe on redeploy). */
const defaultConfirmTokenStore = new ConfirmTokenStore();

/**
 * @param {{
 *   toolId: string,
 *   isolatedEnv: Record<string, string>,
 * }} input
 * @returns {string}
 */
function hashPreviewPayload(input) {
  const toolId = String(input.toolId ?? '');
  const env = input.isolatedEnv && typeof input.isolatedEnv === 'object'
    ? input.isolatedEnv
    : {};
  const keys = Object.keys(env).sort();
  const body = JSON.stringify({
    toolId,
    env: keys.map((k) => [k, env[k]]),
  });
  return crypto.createHash('sha256').update(body).digest('hex');
}

module.exports = {
  DEFAULT_TTL_MS,
  FORBIDDEN_DURABLE_BACKENDS,
  ConfirmTokenStore,
  defaultConfirmTokenStore,
  hashPreviewPayload,
};
