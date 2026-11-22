'use strict';

/**
 * Identity HTTP edge (EDGE-01) — `/auth/*` on the same host process as `/health`.
 * U1: this module · U2: /auth/{challenge,verify,session,logout}
 *
 * Production keyMap (arch-08): SUPABASE_URL, SUPABASE_SECRET_KEY
 * (+ optional SUPABASE_SERVICE_ROLE_KEY alias), CAPY_BEARER_SECRET.
 * Missing classes → fail-closed on identity routes only (AC-I05: health stays open).
 *
 * Live `@supabase/supabase-js` = REQ-09 residual; default Auth port = memory double.
 * Unit green ≠ Phase 2 Done (AC-I06).
 */

const {
  ChallengeStore,
  BearerSessionStore,
  issueChallenge,
  verifyAddressProof,
  loadAuthEnvConfig,
  createMemorySupabaseAuthDouble,
  bindAddressToAuthUser,
  issueBearerSession,
  validateBearer,
  logoutBearer,
  authError,
} = require('../packages/core/src/auth');

/** @type {{ supabaseUrl: string, supabaseKey: string, bearerSecret: string }} */
const PRODUCTION_AUTH_KEY_MAP = {
  supabaseUrl: 'SUPABASE_URL',
  supabaseKey: 'SUPABASE_SECRET_KEY',
  bearerSecret: 'CAPY_BEARER_SECRET',
};

/**
 * Apply optional SUPABASE_SERVICE_ROLE_KEY → supabaseKey alias (arch DP5-A).
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>}
 */
function withSupabaseKeyAlias(env) {
  const bag = { ...(env || {}) };
  const secret = typeof bag.SUPABASE_SECRET_KEY === 'string' ? bag.SUPABASE_SECRET_KEY.trim() : '';
  const alias =
    typeof bag.SUPABASE_SERVICE_ROLE_KEY === 'string'
      ? bag.SUPABASE_SERVICE_ROLE_KEY.trim()
      : '';
  if (!secret && alias) {
    bag.SUPABASE_SECRET_KEY = alias;
  }
  return bag;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{
 *   supabaseUrl: string,
 *   supabaseKey: string,
 *   bearerSecret: string
 * }} [keyMap]
 * @returns {import('../packages/core/src/auth/loadAuthEnvConfig').AuthEnvConfig}
 */
function loadHostAuthEnvConfig(env, keyMap = PRODUCTION_AUTH_KEY_MAP) {
  return loadAuthEnvConfig(withSupabaseKeyAlias(env), keyMap);
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{
 *   challengeStore?: import('../packages/core/src/auth/ChallengeStore').ChallengeStore,
 *   sessionStore?: import('../packages/core/src/auth/bearerSession').BearerSessionStore,
 *   authPort?: import('../packages/core/src/auth/supabaseAuthPort').SupabaseAuthPort,
 *   keyMap?: typeof PRODUCTION_AUTH_KEY_MAP,
 *   nowMs?: number
 * }} [opts]
 */
function createAuthRuntime(env = process.env, opts = {}) {
  let config = null;
  let configError = null;
  try {
    config = loadHostAuthEnvConfig(env, opts.keyMap || PRODUCTION_AUTH_KEY_MAP);
  } catch (err) {
    configError = err;
  }

  return {
    env,
    config,
    configError,
    challenges: opts.challengeStore || new ChallengeStore(),
    sessions: opts.sessionStore || new BearerSessionStore(),
    authPort: opts.authPort || createMemorySupabaseAuthDouble(),
    nowMs: opts.nowMs,
  };
}

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, unknown>} payload
 */
function writeJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(authError('EAUTH_BAD_PAYLOAD', 'JSON object body required'));
          return;
        }
        resolve(/** @type {Record<string, unknown>} */ (parsed));
      } catch {
        reject(authError('EAUTH_BAD_PAYLOAD', 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {string | null}
 */
function extractBearerToken(req) {
  const header = req.headers && req.headers.authorization;
  if (typeof header !== 'string') return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string }}
 */
function mapAuthError(err) {
  const code = err && err.code ? String(err.code) : 'EAUTH_INTERNAL';
  const message =
    err && err.message ? String(err.message) : 'Identity request failed';
  if (code === 'EAUTH_ENV_MISSING') {
    return { status: 503, code, message };
  }
  if (
    code === 'EAUTH_SESSION_MISSING' ||
    code === 'EAUTH_SESSION_INVALID' ||
    code === 'EAUTH_SESSION_EXPIRED' ||
    code === 'EAUTH_INVALID_SIGNATURE' ||
    code === 'EAUTH_WRONG_SIGNER' ||
    code === 'EAUTH_CHALLENGE_EXPIRED' ||
    code === 'EAUTH_BAD_PAYLOAD'
  ) {
    return { status: 401, code, message };
  }
  if (code === 'EAUTH_BIND_FAILED') {
    return { status: 502, code, message };
  }
  return { status: 400, code, message };
}

/**
 * Fail-closed: identity ops require auth env classes (no silent skip).
 *
 * @param {ReturnType<typeof createAuthRuntime>} runtime
 */
function requireRuntimeConfig(runtime) {
  if (runtime.configError) {
    throw runtime.configError;
  }
  if (!runtime.config) {
    throw authError('EAUTH_ENV_MISSING', 'Auth env config unavailable');
  }
  return runtime.config;
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isAuthPath(pathname) {
  return (
    pathname === '/auth/challenge' ||
    pathname === '/auth/challenge/' ||
    pathname === '/auth/verify' ||
    pathname === '/auth/verify/' ||
    pathname === '/auth/session' ||
    pathname === '/auth/session/' ||
    pathname === '/auth/logout' ||
    pathname === '/auth/logout/'
  );
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {ReturnType<typeof createAuthRuntime>} runtime
 * @returns {Promise<boolean>} true if path was an /auth/* route (handled)
 */
async function tryHandleAuthRequest(req, res, runtime) {
  const pathname =
    typeof req.url === 'string' ? req.url.split('?')[0] : '';
  if (!isAuthPath(pathname)) {
    return false;
  }

  const path = pathname.replace(/\/$/, '') || pathname;

  try {
    if (path === '/auth/challenge' && req.method === 'POST') {
      const config = requireRuntimeConfig(runtime);
      void config;
      const body = await readJsonBody(req);
      const issued = issueChallenge(runtime.challenges, body.address, {
        nowMs: runtime.nowMs,
      });
      writeJson(res, 200, {
        ok: true,
        challengeId: issued.challengeId,
        address: issued.address,
        nonce: issued.nonce,
        message: issued.message,
        issuedAt: issued.issuedAt,
        expiresAt: issued.expiresAt,
      });
      return true;
    }

    if (path === '/auth/verify' && req.method === 'POST') {
      const config = requireRuntimeConfig(runtime);
      const body = await readJsonBody(req);
      const challengeId =
        typeof body.challengeId === 'string' ? body.challengeId : '';
      const signature =
        typeof body.signature === 'string' ? body.signature : '';
      const proof = verifyAddressProof(
        runtime.challenges,
        challengeId,
        signature,
        { nowMs: runtime.nowMs },
      );
      const link = await bindAddressToAuthUser(
        { proof, authPort: runtime.authPort, config },
        { nowMs: runtime.nowMs },
      );
      const session = issueBearerSession(runtime.sessions, link, config, {
        nowMs: runtime.nowMs,
      });
      writeJson(res, 200, {
        ok: true,
        token: session.token,
        tokenType: 'Bearer',
        userId: session.userId,
        address: session.address,
        expiresAt: session.expiresAt,
      });
      return true;
    }

    if (path === '/auth/session' && req.method === 'GET') {
      const config = requireRuntimeConfig(runtime);
      const token = extractBearerToken(req);
      const session = validateBearer(runtime.sessions, token, config, {
        nowMs: runtime.nowMs,
      });
      writeJson(res, 200, {
        ok: true,
        userId: session.userId,
        address: session.address,
        expiresAt: session.expiresAt,
      });
      return true;
    }

    if (path === '/auth/logout' && (req.method === 'POST' || req.method === 'DELETE')) {
      const config = requireRuntimeConfig(runtime);
      void config;
      const token = extractBearerToken(req);
      logoutBearer(runtime.sessions, token);
      writeJson(res, 200, { ok: true, loggedOut: true });
      return true;
    }

    writeJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  } catch (err) {
    const mapped = mapAuthError(err);
    writeJson(res, mapped.status, {
      ok: false,
      error: mapped.code,
      message: mapped.message,
    });
    return true;
  }
}

module.exports = {
  PRODUCTION_AUTH_KEY_MAP,
  withSupabaseKeyAlias,
  loadHostAuthEnvConfig,
  createAuthRuntime,
  tryHandleAuthRequest,
  isAuthPath,
  extractBearerToken,
  readJsonBody,
  writeJson,
};
