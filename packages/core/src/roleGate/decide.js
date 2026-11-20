'use strict';

const { allowedResourceSet } = require('../membership/allowedResources');
const {
  isKnownCapability,
  isRoleMutationCapability,
  isCatalogDenyAlwaysCapability,
  roleAllowsCapability,
} = require('./capabilities');

/**
 * @typedef {{ outcome: 'allow'|'deny', reason: string }} RoleGateDecision
 */

/**
 * Shared RoleGate (DP1-B): fail-closed before Action.
 *
 * @param {{
 *   actor: object | null | undefined,
 *   capabilityId: string,
 *   resourceScope?: { membershipId?: string, membershipIds?: string[] },
 *   familyMemberships?: object[]
 * }} input
 * @returns {RoleGateDecision}
 */
function decide(input) {
  const actor = input && input.actor;
  const capabilityId = input && input.capabilityId;
  const resourceScope = (input && input.resourceScope) || {};
  const familyMemberships = input && input.familyMemberships;

  if (!actor || typeof actor !== 'object') {
    return { outcome: 'deny', reason: 'missing_actor' };
  }
  if (typeof capabilityId !== 'string' || !capabilityId.trim()) {
    return { outcome: 'deny', reason: 'missing_capability' };
  }

  if (isRoleMutationCapability(capabilityId)) {
    return { outcome: 'deny', reason: 'role_mutation' };
  }

  if (isCatalogDenyAlwaysCapability(capabilityId)) {
    return { outcome: 'deny', reason: 'deny_always' };
  }

  if (!isKnownCapability(capabilityId)) {
    return { outcome: 'deny', reason: 'unknown_capability' };
  }

  const role = actor.role;
  if (role !== 'parent' && role !== 'child') {
    return { outcome: 'deny', reason: 'invalid_role' };
  }

  if (!roleAllowsCapability(role, capabilityId)) {
    return { outcome: 'deny', reason: 'role_denied' };
  }

  const membershipIds = [];
  if (typeof resourceScope.membershipId === 'string' && resourceScope.membershipId.trim()) {
    membershipIds.push(resourceScope.membershipId.trim());
  }
  if (Array.isArray(resourceScope.membershipIds)) {
    for (const id of resourceScope.membershipIds) {
      if (typeof id === 'string' && id.trim()) membershipIds.push(id.trim());
    }
  }

  if (membershipIds.length > 0) {
    if (!Array.isArray(familyMemberships)) {
      return { outcome: 'deny', reason: 'missing_family_memberships' };
    }
    if (
      typeof actor.membershipId !== 'string' ||
      typeof actor.familyId !== 'string' ||
      typeof actor.address !== 'string'
    ) {
      return { outcome: 'deny', reason: 'incomplete_actor' };
    }

    let allowed;
    try {
      allowed = allowedResourceSet(
        {
          id: actor.membershipId,
          familyId: actor.familyId,
          role: actor.role,
          address: actor.address,
        },
        familyMemberships
      );
    } catch {
      return { outcome: 'deny', reason: 'scope_input_invalid' };
    }

    const allowedSet = new Set(allowed.membershipIds);
    for (const id of membershipIds) {
      if (!allowedSet.has(id)) {
        return { outcome: 'deny', reason: 'scope_denied' };
      }
    }
  }

  return { outcome: 'allow', reason: 'ok' };
}

module.exports = {
  decide,
};
