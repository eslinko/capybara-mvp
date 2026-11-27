'use strict';

/**
 * INV-04 — Host HTTP createInvite on the same process as `/auth/*`.
 * Path stamp: `POST /auth/invite` (namespace under identity `/auth/*`; no opaque token).
 * Order: DualAuthGate → RoleGate `family.members_settings` via core `createInvite`.
 * Unit green alone ≠ family onboarding Done (AC-G3-05).
 */

const {
  createInvite,
  findOpenInviteByTo,
  inviteError,
} = require('../packages/core/src/invite');
const {
  extractBearerToken,
  readJsonBody,
  writeJson,
  requireRuntimeConfig,
} = require('./authHttp');

const CREATE_INVITE_PATH = '/auth/invite';

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isInvitePath(pathname) {
  return (
    pathname === CREATE_INVITE_PATH || pathname === `${CREATE_INVITE_PATH}/`
  );
}

/**
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string }}
 */
function mapInviteError(err) {
  const code = err && err.code ? String(err.code) : 'EINVITE_INTERNAL';
  const message =
    err && err.message ? String(err.message) : 'Invite request failed';
  if (code === 'EAUTH_ENV_MISSING') {
    return { status: 503, code, message };
  }
  if (
    code === 'EAUTH_DUAL_DENY' ||
    code === 'EAUTH_SESSION_MISSING' ||
    code === 'EAUTH_SESSION_INVALID' ||
    code === 'EAUTH_SESSION_EXPIRED'
  ) {
    return { status: 401, code, message };
  }
  if (code === 'EROLEGATE_DENY' || code === 'EROLEGATE_HARNESS') {
    return { status: 403, code, message };
  }
  if (
    code === 'EINVITE_NOT_BOOTSTRAPPED' ||
    code === 'EINVITE_UNKNOWN_FAMILY'
  ) {
    return { status: 403, code, message };
  }
  if (
    code === 'EINVITE_ADDRESS_ROLE_CONFLICT' ||
    code === 'EINVITE_OPEN_CONFLICT' ||
    code === 'EINVITE_EXISTS'
  ) {
    return { status: 409, code, message };
  }
  if (
    code === 'EINVITE_EMPTY_TO' ||
    code === 'EINVITE_INVALID_ROLE' ||
    code === 'EINVITE_BAD_PAYLOAD'
  ) {
    return { status: 400, code, message };
  }
  return { status: 400, code, message };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {ReturnType<typeof import('./authHttp').createAuthRuntime>} runtime
 * @returns {Promise<boolean>}
 */
async function tryHandleInviteRequest(req, res, runtime) {
  const pathname =
    typeof req.url === 'string' ? req.url.split('?')[0] : '';
  if (!isInvitePath(pathname)) {
    return false;
  }

  const path = pathname.replace(/\/$/, '') || pathname;
  if (path !== CREATE_INVITE_PATH) {
    writeJson(res, 404, { ok: false, error: 'unknown_invite_path' });
    return true;
  }

  if (req.method !== 'POST') {
    writeJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  try {
    if (!runtime.inviteStore || typeof runtime.inviteStore.addInvite !== 'function') {
      throw inviteError(
        'EINVITE_BAD_PAYLOAD',
        'inviteStore is required on host runtime (INV-04)',
      );
    }

    const config = requireRuntimeConfig(runtime);
    const body = await readJsonBody(req);
    const familyId =
      typeof body.familyId === 'string' && body.familyId.trim()
        ? body.familyId.trim()
        : '';
    if (!familyId) {
      throw inviteError('EINVITE_BAD_PAYLOAD', 'familyId is required');
    }

    const to = typeof body.to === 'string' ? body.to : '';
    const role = typeof body.role === 'string' ? body.role : '';
    const displayName =
      typeof body.displayName === 'string' ? body.displayName : undefined;
    const membershipId =
      typeof body.membershipId === 'string' && body.membershipId.trim()
        ? body.membershipId.trim()
        : undefined;

    // Ignore client-claimed role (never feeds DualAuth actor)
    void body.clientClaimedRole;
    void body.claimedRole;

    const bearer = extractBearerToken(req);

    const invite = await createInvite({
      inviteStore: runtime.inviteStore,
      membershipStore: runtime.membershipStore,
      dualInput: {
        bearer,
        sessionStore: runtime.sessions,
        config,
        membershipStore: runtime.membershipStore,
        familyId,
        membershipId,
        nowMs: runtime.nowMs,
      },
      to,
      role,
      familyId,
      displayName,
    });

    // AC-G3-04: open invite visible for later accept by `to` (feeds INV-05)
    const openForTo = await findOpenInviteByTo(
      runtime.inviteStore,
      invite.to,
      invite.familyId,
    );

    writeJson(res, 200, {
      ok: true,
      invite: {
        id: invite.id,
        from: invite.from,
        to: invite.to,
        role: invite.role,
        familyId: invite.familyId,
        status: invite.status,
        displayName: invite.displayName,
      },
      openForToId: openForTo && openForTo.id ? openForTo.id : null,
    });
    return true;
  } catch (err) {
    const mapped = mapInviteError(err);
    writeJson(res, mapped.status, {
      ok: false,
      error: mapped.code,
      message: mapped.message,
    });
    return true;
  }
}

module.exports = {
  CREATE_INVITE_PATH,
  isInvitePath,
  tryHandleInviteRequest,
  mapInviteError,
};
