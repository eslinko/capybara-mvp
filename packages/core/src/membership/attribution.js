'use strict';

const { assertRole } = require('./roles');
const { normalizeAddress, requireId } = require('./normalize');

/**
 * Minimal attribution payload (AC-R05 / DP7).
 * membershipId + role + address — no dual-auth invent.
 *
 * @param {{
 *   membershipId?: string,
 *   role?: string,
 *   address?: string,
 *   id?: string
 * } | null | undefined} actor
 * @returns {{ membershipId: string, role: 'parent'|'child', address: string }}
 */
function buildAttributionPayload(actor) {
  if (!actor || typeof actor !== 'object') {
    const err = new Error('ActorContext required for attribution payload');
    err.code = 'EATTRIBUTION_ACTOR_REQUIRED';
    throw err;
  }

  const membershipId = requireId(
    actor.membershipId != null ? actor.membershipId : actor.id,
    'membershipId'
  );
  const role = assertRole(actor.role);
  const address = normalizeAddress(actor.address);

  return { membershipId, role, address };
}

/**
 * Resolve journal `validatedBy` for ActivityPayout.
 * Legacy (no actor): literal `'parent'`.
 * Gated/attributed: concrete payload object (not role-name alone).
 *
 * @param {object | null | undefined} actor
 * @returns {string | { membershipId: string, role: string, address: string }}
 */
function resolveValidatedBy(actor) {
  if (!actor) {
    return 'parent';
  }
  return buildAttributionPayload(actor);
}

module.exports = {
  buildAttributionPayload,
  resolveValidatedBy,
};
