'use strict';

const { assertRole } = require('./roles');
const { normalizeAddress, requireId } = require('./normalize');

/**
 * Build call-time ActorContext from a membership (logical contract).
 * optional userId slot unused until REQ-04.
 *
 * @param {{
 *   id: string,
 *   familyId: string,
 *   role: string,
 *   address: string,
 *   userId?: string
 * }} membership
 * @returns {{
 *   membershipId: string,
 *   role: 'parent' | 'child',
 *   address: string,
 *   familyId: string,
 *   userId?: string
 * }}
 */
function buildActorContext(membership) {
  if (!membership || typeof membership !== 'object') {
    const err = new Error('Membership required to build ActorContext');
    err.code = 'EMEMBERSHIP_ACTOR_INPUT';
    throw err;
  }

  const ctx = {
    membershipId: requireId(membership.id, 'membershipId'),
    role: assertRole(membership.role),
    address: normalizeAddress(membership.address),
    familyId: requireId(membership.familyId, 'familyId'),
  };

  // Optional slot reserved for REQ-04 — only copy if present; do not invent.
  if (typeof membership.userId === 'string' && membership.userId.trim()) {
    ctx.userId = membership.userId.trim();
  }

  return ctx;
}

module.exports = {
  buildActorContext,
};
