'use strict';

/**
 * MCP-02 — DualAuth → parent assert → CatalogAlias → RoleGate on MCP tool entry.
 * Soft≠Live · Action invoke OOS (MCP-03/04) · ≠ invent Live Pass / REQ-08 Accept / Phase 4 Done.
 * Live ACL Residual honesty → MCP-07.
 */

const {
  dualAuthGate,
  authError,
} = require('../../packages/core/src/auth');
const {
  runWithCatalogAliasThenRoleGate,
} = require('../../packages/core/src/roleGate');
const { extractBearerToken } = require('../authHttp');

/**
 * Error map Soft — align with capabilityProbe.mapProbeError (401/403/503).
 *
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string }}
 */
function mapMcpToolGateError(err) {
  const code = err && err.code ? String(err.code) : 'EMCP_GATE_INTERNAL';
  const message =
    err && err.message ? String(err.message) : 'MCP tool gate failed';
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
 * @param {ReturnType<typeof import('../authHttp').createAuthRuntime>} runtime
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
 * Authorize a privileged/mutating MCP tool call Soft.
 * Order: DualAuth → parent assert → CatalogAlias→RoleGate.
 * `clientClaimedRole` / body.role are voided (AC-M08) — never trust Skill text.
 *
 * @param {{
 *   req: import('http').IncomingMessage,
 *   runtime: ReturnType<typeof import('../authHttp').createAuthRuntime>,
 *   capabilityId: string,
 *   familyId?: string,
 *   clientClaimedRole?: string,
 * }} input
 * @returns {Promise<{
 *   ok: true,
 *   role: string,
 *   membershipId: string,
 *   familyId: string | undefined,
 *   userId: string,
 *   address: string,
 *   capabilityId: string,
 * }>}
 */
async function authorizeMcpToolCall(input) {
  const { req, runtime, capabilityId } = input;
  const config = requireRuntimeConfig(runtime);

  // AC-M08: never trust Skill / client-claimed role for ACL
  const clientClaimedRole =
    typeof input.clientClaimedRole === 'string'
      ? input.clientClaimedRole
      : undefined;
  void clientClaimedRole;

  const familyId =
    typeof input.familyId === 'string' && input.familyId.trim()
      ? input.familyId.trim()
      : undefined;

  const bearer = extractBearerToken(req);

  const allowed = await dualAuthGate({
    bearer,
    sessionStore: runtime.sessions,
    config,
    membershipStore: runtime.membershipStore,
    familyId: familyId || undefined,
    nowMs: runtime.nowMs,
    clientClaimedRole,
  });

  // AC-M03: in-scope MCP tools require parent membership SoT
  const membershipRole =
    allowed.membership && typeof allowed.membership.role === 'string'
      ? allowed.membership.role
      : '';
  if (membershipRole !== 'parent') {
    const err = new Error('MCP tools require parent membership');
    err.code = 'EROLEGATE_DENY';
    throw err;
  }

  const familyMemberships =
    typeof allowed.membership.familyId === 'string'
      ? await Promise.resolve(
          runtime.membershipStore.listMembershipsByFamily(
            allowed.membership.familyId,
          ),
        )
      : [];

  return runWithCatalogAliasThenRoleGate(
    {
      actor: allowed.actor,
      capabilityId,
      familyMemberships,
    },
    () => ({
      ok: true,
      capabilityId,
      membershipId: allowed.membership.id,
      role: allowed.actor.role,
      familyId: allowed.membership.familyId,
      userId: allowed.userId,
      address: allowed.session.address,
    }),
  );
}

module.exports = {
  authorizeMcpToolCall,
  mapMcpToolGateError,
};
