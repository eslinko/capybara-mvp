'use strict';

const { assertRole, ROLES } = require('./roles');
const { requireId } = require('./normalize');

/**
 * Pure domain helper (AC-R04 prep). No RoleGate wiring.
 *
 * Child → self only (membership id + address).
 * Parent → all memberships in the same familyId.
 *
 * @param {object} actorMembership
 * @param {object[]} familyMemberships
 * @returns {{
 *   role: 'parent' | 'child',
 *   familyId: string,
 *   membershipIds: string[],
 *   addresses: string[]
 * }}
 */
function allowedResourceSet(actorMembership, familyMemberships) {
  if (!actorMembership || typeof actorMembership !== 'object') {
    const err = new Error('actorMembership required');
    err.code = 'EMEMBERSHIP_RESOURCE_INPUT';
    throw err;
  }
  if (!Array.isArray(familyMemberships)) {
    const err = new Error('familyMemberships must be an array');
    err.code = 'EMEMBERSHIP_RESOURCE_INPUT';
    throw err;
  }

  const role = assertRole(actorMembership.role);
  const familyId = requireId(actorMembership.familyId, 'familyId');
  const selfId = requireId(actorMembership.id, 'membershipId');

  if (role === ROLES.CHILD) {
    return {
      role,
      familyId,
      membershipIds: [selfId],
      addresses: [actorMembership.address],
    };
  }

  const inFamily = familyMemberships.filter(
    (m) => m && m.familyId === familyId
  );
  return {
    role,
    familyId,
    membershipIds: inFamily.map((m) => m.id),
    addresses: inFamily.map((m) => m.address),
  };
}

module.exports = {
  allowedResourceSet,
};
