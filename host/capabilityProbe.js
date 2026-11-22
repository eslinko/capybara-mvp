'use strict';

/**
 * EDGE-03 — gated capability probe `profile.self` on the same host as `/auth/*`.
 * Path stamp: `/v1/capabilities/profile.self`
 * Order: DualAuthGate → CatalogAlias → RoleGate (no trust client role).
 * Minimal membership/role echo only — not Express CRUD.
 * Unit green ≠ Phase 2 Done (AC-I06).
 */

const {
  dualAuthGate,
  authError,
} = require('../packages/core/src/auth');
const {
  CAPABILITIES,
  runWithCatalogAliasThenRoleGate,
} = require('../packages/core/src/roleGate');
const {
  extractBearerToken,
  readJsonBody,
  writeJson,
} = require('./authHttp');

const PROFILE_SELF_PATH = '/v1/capabilities/profile.self';
const PROFILE_SELF_ID = CAPABILITIES.PROFILE_SELF;

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isCapabilityProbePath(pathname) {
  return (
    pathname === PROFILE_SELF_PATH ||
    pathname === `${PROFILE_SELF_PATH}/`
  );
}

/**
 * @param {ReturnType<typeof import('./authHttp').createAuthRuntime>} runtime
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
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string }}
 */
function mapProbeError(err) {
  const code = err && err.code ? String(err.code) : 'EPROBE_INTERNAL';
  const message =
    err && err.message ? String(err.message) : 'Capability probe failed';
  if (code === 'EAUTH_ENV_MISSING') {
    return { status: 503, code, message };
  }
  if (code === 'EAUTH_DUAL_DENY') {
    return { status: 401, code, message };
  }
  if (code === 'EROLEGATE_DENY' || code === 'EROLEGATE_HARNESS') {
    return { status: 403, code, message };
  }
  return { status: 400, code, message };
}

/**
 * Optional JSON body — only for proving clientClaimedRole is ignored.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
async function optionalJsonBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return {};
  }
  try {
    return await readJsonBody(req);
  } catch {
    return {};
  }
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {ReturnType<typeof import('./authHttp').createAuthRuntime>} runtime
 * @returns {Promise<boolean>}
 */
async function tryHandleCapabilityProbe(req, res, runtime) {
  const pathname =
    typeof req.url === 'string' ? req.url.split('?')[0] : '';
  if (!isCapabilityProbePath(pathname)) {
    return false;
  }

  const path = pathname.replace(/\/$/, '') || pathname;
  if (path !== PROFILE_SELF_PATH) {
    writeJson(res, 404, { ok: false, error: 'unknown_capability_path' });
    return true;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    writeJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  try {
    const config = requireRuntimeConfig(runtime);
    const body = await optionalJsonBody(req);
    // AC: client-claimed role ignored (never feeds DualAuth/RoleGate actor)
    const clientClaimedRole =
      typeof body.role === 'string'
        ? body.role
        : typeof body.clientClaimedRole === 'string'
          ? body.clientClaimedRole
          : undefined;
    void clientClaimedRole;

    const familyId =
      typeof body.familyId === 'string' && body.familyId.trim()
        ? body.familyId.trim()
        : typeof req.url === 'string' && req.url.includes('familyId=')
          ? new URL(req.url, 'http://localhost').searchParams.get('familyId') ||
            undefined
          : undefined;

    const bearer = extractBearerToken(req);

    const allowed = dualAuthGate({
      bearer,
      sessionStore: runtime.sessions,
      config,
      membershipStore: runtime.membershipStore,
      familyId: familyId || undefined,
      nowMs: runtime.nowMs,
      clientClaimedRole,
    });

    const familyMemberships =
      typeof allowed.membership.familyId === 'string'
        ? runtime.membershipStore.listMembershipsByFamily(
            allowed.membership.familyId,
          )
        : [];

    const echo = runWithCatalogAliasThenRoleGate(
      {
        actor: allowed.actor,
        capabilityId: PROFILE_SELF_ID,
        familyMemberships,
      },
      () => ({
        ok: true,
        capabilityId: PROFILE_SELF_ID,
        membershipId: allowed.membership.id,
        role: allowed.actor.role,
        familyId: allowed.membership.familyId,
        userId: allowed.userId,
        address: allowed.session.address,
      }),
    );

    writeJson(res, 200, echo);
    return true;
  } catch (err) {
    const mapped = mapProbeError(err);
    writeJson(res, mapped.status, {
      ok: false,
      error: mapped.code,
      message: mapped.message,
    });
    return true;
  }
}

module.exports = {
  PROFILE_SELF_PATH,
  PROFILE_SELF_ID,
  isCapabilityProbePath,
  tryHandleCapabilityProbe,
  mapProbeError,
};
