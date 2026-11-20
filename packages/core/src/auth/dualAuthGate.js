'use strict';

const { buildActorContext } = require('../membership/actorContext');
const { validateBearer } = require('./bearerSession');
const { requireAuthEnvClasses } = require('./loadAuthEnvConfig');
const { resolveMembershipForSession } = require('./resolveMembershipForSession');
const { authError } = require('./errors');

/**
 * DualAuthGate — fail-closed before RoleGate / family capability.
 *
 * **CLI residual:** product AC-A01 is claimed on host/modules under test.
 * CLI paths that skip DualAuthGate remain ungated coexistence residual —
 * do not claim CLI dual-auth Done.
 *
 * Client-claimed role is ignored (AC-A03); role comes from membership only.
 *
 * @typedef {{
 *   outcome: 'allow'|'deny',
 *   reason: string,
 *   actor?: object,
 *   session?: object,
 *   membership?: object
 * }} DualAuthDecision
 */

/**
 * @param {{
 *   bearer: string | null | undefined,
 *   sessionStore: import('./bearerSession').BearerSessionStore,
 *   config: import('./loadAuthEnvConfig').AuthEnvConfig,
 *   membershipStore: import('../membership/MembershipStore'),
 *   familyId?: string,
 *   membershipId?: string,
 *   clientClaimedRole?: string,
 *   nowMs?: number,
 *   bindUserIdIfMissing?: boolean
 * }} input
 * @returns {DualAuthDecision}
 */
function decideDualAuth(input) {
  // Explicitly ignore client role claim (AC-A03) — do not read into actor.
  void input?.clientClaimedRole;

  try {
    requireAuthEnvClasses(input?.config);
  } catch (err) {
    return { outcome: 'deny', reason: err?.code || 'EAUTH_ENV_MISSING' };
  }

  if (!input?.sessionStore || typeof input.sessionStore.get !== 'function') {
    return { outcome: 'deny', reason: 'missing_session_store' };
  }
  if (!input?.membershipStore) {
    return { outcome: 'deny', reason: 'missing_membership_store' };
  }

  let session;
  try {
    session = validateBearer(
      input.sessionStore,
      input.bearer,
      input.config,
      { nowMs: input.nowMs },
    );
  } catch (err) {
    const code = err?.code || 'EAUTH_SESSION_INVALID';
    return { outcome: 'deny', reason: code };
  }

  let membership;
  try {
    membership = resolveMembershipForSession({
      membershipStore: input.membershipStore,
      userId: session.userId,
      address: session.address,
      familyId: input.familyId,
      membershipId: input.membershipId,
      bindUserIdIfMissing: input.bindUserIdIfMissing,
    });
  } catch (err) {
    return {
      outcome: 'deny',
      reason: err?.code || 'EAUTH_MEMBERSHIP_UNRESOLVED',
    };
  }

  let actor;
  try {
    actor = buildActorContext(membership);
  } catch (err) {
    return { outcome: 'deny', reason: err?.code || 'actor_build_failed' };
  }

  return {
    outcome: 'allow',
    reason: 'dual_auth_ok',
    actor,
    session,
    membership,
  };
}

/**
 * DualAuthGate API: allow → context; deny → throw EAUTH_DUAL_DENY.
 *
 * @param {Parameters<typeof decideDualAuth>[0]} input
 * @returns {{ actor: object, session: object, membership: object, userId: string }}
 */
function dualAuthGate(input) {
  const decision = decideDualAuth(input);
  if (decision.outcome !== 'allow') {
    throw authError(
      'EAUTH_DUAL_DENY',
      `DualAuthGate deny: ${decision.reason}`,
    );
  }
  return {
    actor: decision.actor,
    session: decision.session,
    membership: decision.membership,
    userId: decision.session.userId,
  };
}

module.exports = {
  decideDualAuth,
  dualAuthGate,
};
