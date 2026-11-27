'use strict';

/**
 * Identity HTTP edge (EDGE-01/02/11) — `/auth/*` on the same host process as `/health`.
 * U1: this module · U2: /auth/{challenge,verify,session,logout,bootstrap}
 *
 * EDGE-11 / AC-I08: Connector CORS allowlist on `/auth/challenge|verify` only —
 * local `http://127.0.0.1:8080` / `http://localhost:8080` + optional
 * `CAPY_CONNECTOR_CORS_ORIGINS` (comma-separated exact Origins, e.g. Railway HTTPS).
 * Echo allowed Origin (not `*`) · OPTIONS preflight · unknown Origin fail-closed.
 * Soft≠Live: unit green ≠ invent Live Connector Pass. No body-contract invent.
 *
 * Production keyMap (arch-08): SUPABASE_URL, SUPABASE_SECRET_KEY
 * (+ optional SUPABASE_SERVICE_ROLE_KEY alias), CAPY_BEARER_SECRET.
 * Missing classes → fail-closed on identity routes only (AC-I05: health stays open).
 *
 * Bootstrap (EDGE-02 / AC-I04): pool + parent proofs; defaults from distinct
 * CAPY_POOL_ADDRESS / PARENT_ADDRESS; familyId generated when omitted (U4).
 * MembershipStore in-memory residual (redeploy → re-bootstrap; EDGE-04 pointer).
 * InviteStore mounted for INV-04 host createInvite (in-memory).
 * EDGE-08 / G8: membership+invite durability across Railway redeploy = Absent /
 * Residual continued (no invent Phase 3 DDL Done this wave).
 * INV-05: after valid proof, open Invite for `to` → core `bindInviteeAndAccept`
 * (role from Invite; client-claimed role ignored). No open invite → Auth-only.
 *
 * Auth port selection (SBPORT-02 / AC-S01/S03): config Present → live port;
 * missing → fail-closed on identity; no silent memory when config Present
 * (unit tests inject `opts.authPort`). Soft: SBPORT-03 packages `@supabase/supabase-js`.
 * Unit green ≠ Phase 2 / REQ-09 Done (AC-I06 / AC-S05).
 */

const {
  ChallengeStore,
  BearerSessionStore,
  issueChallenge,
  verifyAddressProof,
  loadAuthEnvConfig,
  createLiveSupabaseAuthPort,
  bindAddressToAuthUser,
  issueBearerSession,
  validateBearer,
  logoutBearer,
  bootstrapPoolAndFounder,
  authError,
} = require('../packages/core/src/auth');
const { MembershipStore } = require('../packages/core/src/membership');
const {
  InviteStore,
  findOpenInviteByTo,
  bindInviteeAndAccept,
  assertInviteeNoFamilyCaps,
} = require('../packages/core/src/invite');

/** @type {{ supabaseUrl: string, supabaseKey: string, bearerSecret: string }} */
const PRODUCTION_AUTH_KEY_MAP = {
  supabaseUrl: 'SUPABASE_URL',
  supabaseKey: 'SUPABASE_SECRET_KEY',
  bearerSecret: 'CAPY_BEARER_SECRET',
};

/** Default Connector signing Origins (PAUTH-09 §3 / arch-08/04 §2) — exact match only. */
const DEFAULT_CONNECTOR_CORS_ORIGINS = Object.freeze([
  'http://127.0.0.1:8080',
  'http://localhost:8080',
]);

/**
 * Resolve Connector CORS allowlist: defaults + optional `CAPY_CONNECTOR_CORS_ORIGINS`.
 * Never includes `*`.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
function resolveConnectorCorsAllowlist(env = process.env) {
  const extrasRaw =
    env && typeof env.CAPY_CONNECTOR_CORS_ORIGINS === 'string'
      ? env.CAPY_CONNECTOR_CORS_ORIGINS
      : '';
  const extras = extrasRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((o) => o !== '*');
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const origin of [...DEFAULT_CONNECTOR_CORS_ORIGINS, ...extras]) {
    if (!seen.has(origin)) {
      seen.add(origin);
      out.push(origin);
    }
  }
  return out;
}

/**
 * @param {string} path normalized (no trailing slash)
 * @returns {boolean}
 */
function isConnectorCorsAuthPath(path) {
  return path === '/auth/challenge' || path === '/auth/verify';
}

/**
 * Exact-match allowlist. Unknown / missing Origin → null (fail-closed, no `*`).
 *
 * @param {import('http').IncomingMessage} req
 * @param {string[]} allowlist
 * @returns {string | null}
 */
function resolveAllowedConnectorOrigin(req, allowlist) {
  const raw = req && req.headers ? req.headers.origin : undefined;
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const origin = raw.trim();
  if (origin === '*' || !allowlist.includes(origin)) {
    return null;
  }
  return origin;
}

/**
 * CORS response headers for allowed Origin only (never `*`).
 *
 * @param {string | null} allowedOrigin
 * @returns {Record<string, string>}
 */
function connectorCorsResponseHeaders(allowedOrigin) {
  if (!allowedOrigin) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    Vary: 'Origin',
  };
}

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
 * Residual-safe presence flags for auth env classes (no secret values).
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {typeof PRODUCTION_AUTH_KEY_MAP} [keyMap]
 * @returns {{
 *   authEnvOk: boolean,
 *   supabaseUrl: 'set' | 'missing',
 *   supabaseKey: 'set' | 'missing',
 *   bearerSecret: 'set' | 'missing',
 *   line: string
 * }}
 */
function describeAuthEnvPresence(env = process.env, keyMap = PRODUCTION_AUTH_KEY_MAP) {
  const bag = withSupabaseKeyAlias(env || {});
  const flag = (keyName) => {
    const v = bag[keyName];
    return typeof v === 'string' && v.trim() ? 'set' : 'missing';
  };
  const supabaseUrl = flag(keyMap.supabaseUrl);
  const supabaseKey = flag(keyMap.supabaseKey);
  const bearerSecret = flag(keyMap.bearerSecret);
  const authEnvOk =
    supabaseUrl === 'set' && supabaseKey === 'set' && bearerSecret === 'set';
  const line = [
    `auth_env_ok=${authEnvOk}`,
    `supabaseUrl=${supabaseUrl}`,
    `supabaseKey=${supabaseKey}`,
    `bearerSecret=${bearerSecret}`,
  ].join(' ');
  return { authEnvOk, supabaseUrl, supabaseKey, bearerSecret, line };
}

/**
 * Optional runtime load of supabase-js (SBPORT-03 packaging). Absent → fail-closed live stub.
 * @returns {Function | null}
 */
function tryLoadSupabaseCreateClient() {
  try {
    const mod = require('@supabase/supabase-js');
    return typeof mod.createClient === 'function' ? mod.createClient : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} reason
 * @returns {import('../packages/core/src/auth/supabaseAuthPort').SupabaseAuthPort}
 */
function createUnavailableLiveAuthPort(reason) {
  return {
    kind: 'live-supabase-js',
    residual: false,
    createOrLinkUser() {
      throw authError('EAUTH_BIND_FAILED', reason);
    },
  };
}

/**
 * @returns {import('../packages/core/src/auth/supabaseAuthPort').SupabaseAuthPort}
 */
function createConfigMissingAuthPort() {
  return {
    kind: 'live-supabase-js',
    residual: false,
    createOrLinkUser() {
      throw authError('EAUTH_ENV_MISSING', 'Auth env config unavailable');
    },
  };
}

/**
 * Selection rule (arch-02): inject → use; config ok → live; missing → fail-closed stub.
 * Forbidden: config Present + default memory without inject.
 *
 * @param {import('../packages/core/src/auth/loadAuthEnvConfig').AuthEnvConfig | null} config
 * @param {{
 *   authPort?: import('../packages/core/src/auth/supabaseAuthPort').SupabaseAuthPort,
 *   admin?: object,
 *   createClient?: Function
 * }} opts
 */
function resolveAuthPort(config, opts = {}) {
  if (opts.authPort) {
    return opts.authPort;
  }
  if (!config) {
    return createConfigMissingAuthPort();
  }
  if (opts.admin || typeof opts.createClient === 'function') {
    return createLiveSupabaseAuthPort({
      admin: opts.admin,
      createClient: opts.createClient,
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.supabaseKey,
    });
  }
  const createClient = tryLoadSupabaseCreateClient();
  if (typeof createClient === 'function') {
    return createLiveSupabaseAuthPort({
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.supabaseKey,
      createClient,
    });
  }
  return createUnavailableLiveAuthPort(
    'Live Supabase Auth client unavailable (@supabase/supabase-js); inject createClient/admin or complete SBPORT-03 packaging',
  );
}

/**
 * Redact known secret values from public auth error messages (AC-S04).
 *
 * @param {string} message
 * @param {import('../packages/core/src/auth/loadAuthEnvConfig').AuthEnvConfig | null | undefined} config
 * @returns {string}
 */
function sanitizePublicAuthMessage(message, config) {
  let msg = String(message || '');
  if (!config) return msg;
  for (const value of [
    config.supabaseKey,
    config.bearerSecret,
    config.supabaseUrl,
  ]) {
    if (typeof value === 'string' && value.length >= 4 && msg.includes(value)) {
      msg = msg.split(value).join('[redacted]');
    }
  }
  return msg;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {{
 *   challengeStore?: import('../packages/core/src/auth/ChallengeStore').ChallengeStore,
 *   sessionStore?: import('../packages/core/src/auth/bearerSession').BearerSessionStore,
 *   authPort?: import('../packages/core/src/auth/supabaseAuthPort').SupabaseAuthPort,
 *   admin?: object,
 *   createClient?: Function,
 *   membershipStore?: import('../packages/core/src/membership/MembershipStore'),
 *   inviteStore?: import('../packages/core/src/invite/InviteStore'),
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
    authPort: resolveAuthPort(config, opts),
    membershipStore: opts.membershipStore || new MembershipStore(),
    inviteStore: opts.inviteStore || new InviteStore(),
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
/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 * @param {Record<string, string>} [extraHeaders]
 */
function writeJson(res, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...(extraHeaders || {}),
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
  // INV-05 invite accept errors on verify path
  if (code === 'EINVITE_PROOF_MISMATCH') {
    return { status: 403, code, message };
  }
  if (
    code === 'EINVITE_AMBIGUOUS' ||
    code === 'EINVITE_ALREADY_ACCEPTED' ||
    code === 'EINVITE_OPEN_CONFLICT' ||
    code === 'EINVITE_EXISTS'
  ) {
    return { status: 409, code, message };
  }
  if (code === 'EINVITE_PRE_ACCEPT_NO_CAPS') {
    return { status: 403, code, message };
  }
  if (typeof code === 'string' && code.startsWith('EINVITE_')) {
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

  /** EDGE-11: CORS only on challenge/verify — Soft≠Live. */
  const corsPath = isConnectorCorsAuthPath(path);
  const corsAllowlist = corsPath
    ? resolveConnectorCorsAllowlist(runtime.env)
    : [];
  const allowedOrigin = corsPath
    ? resolveAllowedConnectorOrigin(req, corsAllowlist)
    : null;
  const corsHeaders = connectorCorsResponseHeaders(allowedOrigin);

  if (corsPath && req.method === 'OPTIONS') {
    // Preflight: 204 with methods/headers; ACAO only when Origin allowlisted.
    res.writeHead(204, {
      'Content-Length': 0,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      Vary: 'Origin',
      ...corsHeaders,
    });
    res.end();
    return true;
  }

  /**
   * @param {number} status
   * @param {unknown} payload
   */
  const writeAuthJson = (status, payload) =>
    writeJson(res, status, payload, corsPath ? corsHeaders : undefined);

  try {
    if (path === '/auth/challenge' && req.method === 'POST') {
      const config = requireRuntimeConfig(runtime);
      void config;
      const body = await readJsonBody(req);
      const issued = issueChallenge(runtime.challenges, body.address, {
        nowMs: runtime.nowMs,
      });
      writeAuthJson(200, {
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
      // Client-claimed role ignored (AC-G4-05) — capture then discard; role from Invite only
      const clientClaimedRole =
        typeof body.role === 'string' ? body.role : undefined;
      const familyId =
        typeof body.familyId === 'string' && body.familyId.trim()
          ? body.familyId.trim()
          : undefined;
      const inviteId =
        typeof body.inviteId === 'string' && body.inviteId.trim()
          ? body.inviteId.trim()
          : undefined;
      const proof = verifyAddressProof(
        runtime.challenges,
        challengeId,
        signature,
        { nowMs: runtime.nowMs },
      );

      let link;
      let inviteAccepted = false;
      let inviteMeta = null;

      const inviteStore = runtime.inviteStore;
      let openInvite = null;
      if (inviteStore && !inviteId) {
        openInvite = findOpenInviteByTo(inviteStore, proof.address, familyId);
      }

      if (inviteStore && (inviteId || openInvite)) {
        // AC-M06 / AC-G4-04: open Invite alone never grants family caps (pre-accept)
        const preFamilyId =
          (openInvite && openInvite.familyId) || familyId || undefined;
        if (preFamilyId) {
          assertInviteeNoFamilyCaps({
            membershipStore: runtime.membershipStore,
            toAddress: proof.address,
            familyId: preFamilyId,
          });
        }
        const accepted = await bindInviteeAndAccept({
          inviteStore,
          membershipStore: runtime.membershipStore,
          proof,
          authPort: runtime.authPort,
          config,
          familyId,
          inviteId,
          clientClaimedRole,
          nowMs: runtime.nowMs,
        });
        link = accepted.link;
        inviteAccepted = true;
        inviteMeta = {
          inviteId: accepted.invite.id,
          inviteStatus: accepted.invite.status,
          membershipId: accepted.membership.id,
          membershipRole: accepted.membership.role,
          familyId: accepted.membership.familyId,
        };
      } else {
        // AC-G4-02: no open invite → Auth+session only (no silent membership)
        link = await bindAddressToAuthUser(
          { proof, authPort: runtime.authPort, config },
          { nowMs: runtime.nowMs },
        );
      }

      const session = issueBearerSession(runtime.sessions, link, config, {
        nowMs: runtime.nowMs,
      });
      // WPROOF-02: after challenge consume — write result=ok (arch-02 order).
      // Write failure must not undo login; /result stays pending (fail-closed POC).
      if (runtime.signTokens && typeof runtime.signTokens.writeOkByChallengeId === 'function') {
        try {
          runtime.signTokens.writeOkByChallengeId(
            challengeId,
            { challengeId, address: session.address },
            runtime.nowMs,
          );
        } catch (_) {
          // residual: host log only — login already done
        }
      }
      writeAuthJson(200, {
        ok: true,
        token: session.token,
        tokenType: 'Bearer',
        userId: session.userId,
        address: session.address,
        expiresAt: session.expiresAt,
        // EDGE-02 DP7-A: AddressProof for later POST /auth/bootstrap
        proof,
        inviteAccepted,
        ...(inviteMeta || {}),
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
      writeAuthJson(200, {
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
      writeAuthJson(200, {
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
      writeAuthJson(200, { ok: true, loggedOut: true });
      return true;
    }

    writeAuthJson(405, { ok: false, error: 'method_not_allowed' });
    return true;
  } catch (err) {
    const mapped = mapAuthError(err);
    const publicMessage = sanitizePublicAuthMessage(
      mapped.message,
      runtime.config,
    );
    if (mapped.code === 'EAUTH_ENV_MISSING') {
      const presence = describeAuthEnvPresence(runtime.env);
      console.error(
        `${req.method || 'UNKNOWN'} ${path} ${mapped.status} ${mapped.code} ${publicMessage} ${presence.line}`,
      );
    }
    writeAuthJson(mapped.status, {
      ok: false,
      error: mapped.code,
      message: publicMessage,
    });
    return true;
  }
}

module.exports = {
  PRODUCTION_AUTH_KEY_MAP,
  DEFAULT_CONNECTOR_CORS_ORIGINS,
  withSupabaseKeyAlias,
  loadHostAuthEnvConfig,
  describeAuthEnvPresence,
  resolveAuthPort,
  sanitizePublicAuthMessage,
  createAuthRuntime,
  requireRuntimeConfig,
  resolveBootstrapAddresses,
  resolveBootstrapProof,
  resolveConnectorCorsAllowlist,
  isConnectorCorsAuthPath,
  resolveAllowedConnectorOrigin,
  connectorCorsResponseHeaders,
  tryHandleAuthRequest,
  isAuthPath,
  extractBearerToken,
  readJsonBody,
  writeJson,
  mapAuthError,
};
