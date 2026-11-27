'use strict';

/**
 * WPROOF-10 — Connector launch via `DOGESTONIA_CONNECTOR_URL`.
 * Soft≠Live: Soft env wire ≠ invent Live Connector Pass.
 * No secrets in this module — base URL only.
 *
 * Launch query (arch-10/05 §2 · integrator guide):
 *   `{DOGESTONIA_CONNECTOR_URL}?mode=platform-auth&platform=capybara`
 * Address is typed on Connector — never placed in Capybara URL.
 */

const CONNECTOR_URL_ENV_KEY = 'DOGESTONIA_CONNECTOR_URL';
const LAUNCH_MODE = 'platform-auth';
const LAUNCH_PLATFORM = 'capybara';
const LAUNCH_PATH = '/connector/launch';

/**
 * Read Connector base URL from env (name only — no secret values).
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{ required?: boolean }} [opts]
 * @returns {string | null}
 */
function readDogestoniaConnectorUrl(env = process.env, opts = {}) {
  const required = opts.required === true;
  const raw =
    env && typeof env[CONNECTOR_URL_ENV_KEY] === 'string'
      ? env[CONNECTOR_URL_ENV_KEY].trim()
      : '';
  if (!raw) {
    if (required) {
      const err = new Error(
        `HOST fail-closed: ${CONNECTOR_URL_ENV_KEY} is required for Connector launch`,
      );
      err.code = 'ECONNECTOR_URL_REQUIRED';
      throw err;
    }
    return null;
  }
  try {
    const parsed = new URL(raw);
    if (!parsed.protocol || !parsed.host) {
      const err = new Error(
        `HOST fail-closed: ${CONNECTOR_URL_ENV_KEY} must be an absolute URL`,
      );
      err.code = 'ECONNECTOR_URL_INVALID';
      throw err;
    }
    // Normalize: origin without trailing slash junk on pathname-only bases
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')}`;
  } catch (e) {
    if (e && (e.code === 'ECONNECTOR_URL_REQUIRED' || e.code === 'ECONNECTOR_URL_INVALID')) {
      throw e;
    }
    const err = new Error(
      `HOST fail-closed: ${CONNECTOR_URL_ENV_KEY} must be an absolute URL`,
    );
    err.code = 'ECONNECTOR_URL_INVALID';
    throw err;
  }
}

/**
 * Build Connector platform-auth launch URL.
 *
 * @param {string} baseUrl — from readDogestoniaConnectorUrl
 * @returns {string}
 */
function buildConnectorPlatformAuthLaunchUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    const err = new Error('Connector launch base URL required');
    err.code = 'ECONNECTOR_URL_REQUIRED';
    throw err;
  }
  const u = new URL(baseUrl.trim());
  u.searchParams.set('mode', LAUNCH_MODE);
  u.searchParams.set('platform', LAUNCH_PLATFORM);
  return u.toString();
}

/**
 * Resolve launch URL from env (required → fail-closed).
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string}
 */
function resolveConnectorPlatformAuthLaunchUrl(env = process.env) {
  const base = readDogestoniaConnectorUrl(env, { required: true });
  return buildConnectorPlatformAuthLaunchUrl(base);
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
function isConnectorLaunchPath(req) {
  try {
    const path = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    return path === LAUNCH_PATH || path === `${LAUNCH_PATH}/`;
  } catch {
    return false;
  }
}

/**
 * GET /connector/launch — operator link + optional redirect.
 * Soft≠Live · fail-closed when env missing/invalid.
 *
 * Query: `redirect=1` → 302 Location launchUrl; else JSON `{ ok, launchUrl }`.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
function tryHandleConnectorLaunchRequest(req, res, env = process.env) {
  if (!isConnectorLaunchPath(req)) {
    return false;
  }
  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    const body = JSON.stringify({
      ok: false,
      error: 'EMETHOD',
      message: 'GET only',
    });
    res.writeHead(405, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      Allow: 'GET',
    });
    res.end(body);
    return true;
  }

  let launchUrl;
  try {
    launchUrl = resolveConnectorPlatformAuthLaunchUrl(env);
  } catch (e) {
    const code = e && e.code ? e.code : 'ECONNECTOR_URL_REQUIRED';
    const body = JSON.stringify({
      ok: false,
      error: code,
      message: e && e.message ? e.message : 'Connector URL unavailable',
    });
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
    return true;
  }

  let wantRedirect = false;
  try {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    wantRedirect = u.searchParams.get('redirect') === '1';
  } catch {
    wantRedirect = false;
  }

  if (wantRedirect) {
    res.writeHead(302, {
      Location: launchUrl,
      'Cache-Control': 'no-store',
    });
    res.end();
    return true;
  }

  const body = JSON.stringify({
    ok: true,
    launchUrl,
    mode: LAUNCH_MODE,
    platform: LAUNCH_PLATFORM,
  });
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
  return true;
}

module.exports = {
  CONNECTOR_URL_ENV_KEY,
  LAUNCH_MODE,
  LAUNCH_PLATFORM,
  LAUNCH_PATH,
  readDogestoniaConnectorUrl,
  buildConnectorPlatformAuthLaunchUrl,
  resolveConnectorPlatformAuthLaunchUrl,
  isConnectorLaunchPath,
  tryHandleConnectorLaunchRequest,
};
