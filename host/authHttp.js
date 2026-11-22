'use strict';

/**
 * Identity HTTP edge (EDGE-01/02) — `/auth/*` on the same host process as `/health`.
 * U1: this module · U2: /auth/{challenge,verify,session,logout,bootstrap}
 *
 * Production keyMap (arch-08): SUPABASE_URL, SUPABASE_SECRET_KEY
 * (+ optional SUPABASE_SERVICE_ROLE_KEY alias), CAPY_BEARER_SECRET.
 * Missing classes → fail-closed on identity routes only (AC-I05: health stays open).
 *
 * Bootstrap (EDGE-02 / AC-I04): pool + parent proofs; defaults from distinct
 * CAPY_POOL_ADDRESS / PARENT_ADDRESS; familyId generated when omitted (U4).
 * MembershipStore in-memory residual (redeploy → re-bootstrap; EDGE-04 pointer).
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
  bootstrapPoolAndFounder,
  authError,
} = require('../packages/core/src/auth');
const { MembershipStore } = require('../packages/core/src/membership');

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
 *   membershipStore?: import('../packages/core/src/membership/MembershipStore'),
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
    membershipStore: opts.membershipStore || new MembershipStore(),
    nowMs: opts.nowMs,
  };
}

/**
 * Resolve pool/parent addresses: body overrides, else distinct env fields.
 * Does not merge CAPY_POOL_ADDRESS into PARENT_ADDRESS (AC-I04 / AC-A06).
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {Record<string, unknown>} body
 * @returns {{ poolAddress: string | undefined, parentAddress: string | undefined }}
 */
function resolveBootstrapAddresses(env, body) {
  const bag = env || {};
  const poolFromBody =
    typeof body.poolAddress === 'string' && body.poolAddress.trim()
      ? body.poolAddress.trim()
      : undefined;
  const parentFromBody =
    typeof body.parentAddress === 'string' && body.parentAddress.trim()
      ? body.parentAddress.trim()
      : undefined;
  const poolFromEnv =
    typeof bag.CAPY_POOL_ADDRESS === 'string' && bag.CAPY_POOL_ADDRESS.trim()
      ? bag.CAPY_POOL_ADDRESS.trim()
      : undefined;
  const parentFromEnv =
    typeof bag.PARENT_ADDRESS === 'string' && bag.PARENT_ADDRESS.trim()
      ? bag.PARENT_ADDRESS.trim()
      : undefined;
  return {
    poolAddress: poolFromBody || poolFromEnv,
    parentAddress: parentFromBody || parentFromEnv,
  };
}

/**
 * Accept AddressProof object or challengeId+signature pair (reuse EDGE-01 challenge store).
 *
 * @param {ReturnType<typeof createAuthRuntime>} runtime
 * @param {Record<string, unknown>} body
 * @param {'pool' | 'parent'} kind
 * @returns {object}
 */
function resolveBootstrapProof(runtime, body, kind) {
  const proofKey = kind === 'pool' ? 'poolProof' : 'parentProof';
  const challengeKey = kind === 'pool' ? 'poolChallengeId' : 'parentChallengeId';
  const signatureKey = kind === 'pool' ? 'poolSignature' : 'parentSignature';
  const proof = body[proofKey];
  if (proof && typeof proof === 'object' && !Array.isArray(proof)) {
    return proof;
  }
  const challengeId =
    typeof body[challengeKey] === 'string' ? body[challengeKey] : '';
  const signature =
    typeof body[signatureKey] === 'string' ? body[signatureKey] : '';
  if (challengeId && signature) {
    return verifyAddressProof(runtime.challenges, challengeId, signature, {
      nowMs: runtime.nowMs,
    });
  }
  throw authError(
    'EAUTH_BOOTSTRAP_MISSING_PROOF',
    `${proofKey} or ${challengeKey}+${signatureKey} required (AC-I04)`,
  );
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
  if (code === 'EAUTH_BOOTSTRAP_REPLAY') {
    return { status: 409, code, message };
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
  if (
    code === 'EAUTH_BOOTSTRAP_MISSING_PROOF' ||
    code === 'EAUTH_BOOTSTRAP_PROOF_MISMATCH'
  ) {
    return { status: 400, code, message };
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
    pathname === '/auth/logout/' ||
    pathname === '/auth/bootstrap' ||
    pathname === '/auth/bootstrap/'
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
        // EDGE-02 DP7-A: AddressProof for later POST /auth/bootstrap
        proof,
      });
      return true;
    }

    if (path === '/auth/bootstrap' && req.method === 'POST') {
      const config = requireRuntimeConfig(runtime);
      const body = await readJsonBody(req);
      const { poolAddress, parentAddress } = resolveBootstrapAddresses(
        runtime.env,
        body,
      );
      if (!poolAddress || !parentAddress) {
        throw authError(
          'EAUTH_BAD_PAYLOAD',
          'poolAddress/parentAddress required (body or CAPY_POOL_ADDRESS/PARENT_ADDRESS)',
        );
      }
      const poolProof = resolveBootstrapProof(runtime, body, 'pool');
      const parentProof = resolveBootstrapProof(runtime, body, 'parent');
      const familyId =
        typeof body.familyId === 'string' && body.familyId.trim()
          ? body.familyId.trim()
          : undefined;
      const result = await bootstrapPoolAndFounder(
        {
          membershipStore: runtime.membershipStore,
          authPort: runtime.authPort,
          config,
          familyId,
          poolAddress,
          parentAddress,
          poolProof,
          parentProof,
        },
        { nowMs: runtime.nowMs },
      );
      writeJson(res, 200, {
        ok: true,
        familyId: result.family.id,
        poolAddress: result.poolAddress,
        parentAddress: result.parentAddress,
        sameAddress: result.sameAddress,
        founderMembershipId: result.founderMembership.id,
        founderRole: result.founderMembership.role,
        userId: result.userLink.userId,
        bootstrapped: true,
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
  resolveBootstrapAddresses,
  resolveBootstrapProof,
  tryHandleAuthRequest,
  isAuthPath,
  extractBearerToken,
  readJsonBody,
  writeJson,
};
