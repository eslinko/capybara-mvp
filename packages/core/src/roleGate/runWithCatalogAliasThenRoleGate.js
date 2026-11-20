'use strict';

const { resolveCatalogAlias } = require('./catalogAlias');
const { decide } = require('./decide');
const { isRoleMutationCapability } = require('./capabilities');

/**
 * Bind order (arch-02): CatalogAlias → RoleGate.decide on coarse id.
 * Does **not** merge aliases into ALLOW_BY_ROLE.
 *
 * @param {{
 *   actor: object | null | undefined,
 *   capabilityId: string,
 *   resourceScope?: { membershipId?: string, membershipIds?: string[] },
 *   familyMemberships?: object[]
 * }} input
 * @returns {{ outcome: 'allow'|'deny', reason: string, alias?: object }}
 */
function decideWithCatalogAlias(input) {
  const capabilityId = input && input.capabilityId;
  const alias = resolveCatalogAlias(capabilityId);

  if (alias.kind === 'deny-always') {
    return { outcome: 'deny', reason: 'deny_always', alias };
  }
  if (alias.kind === 'non-aliased') {
    return { outcome: 'deny', reason: 'non_aliased', alias };
  }
  if (alias.kind === 'unmapped') {
    // Synthetic mutation id is not in seed — still hit decide (preserve role_mutation).
    if (
      typeof capabilityId === 'string' &&
      isRoleMutationCapability(capabilityId.trim())
    ) {
      const decision = decide({ ...input, capabilityId: capabilityId.trim() });
      return { ...decision, alias };
    }
    return { outcome: 'deny', reason: 'unmapped_capability', alias };
  }

  const decision = decide({
    ...input,
    capabilityId: alias.coarseId,
  });
  return { ...decision, alias };
}

/**
 * Thin harness: alias bind then RoleGate allow → fn; deny → throw (no side effects).
 *
 * @param {{
 *   actor: object | null | undefined,
 *   capabilityId: string,
 *   resourceScope?: object,
 *   familyMemberships?: object[]
 * }} gateInput
 * @param {() => any} fn
 * @returns {any}
 */
function runWithCatalogAliasThenRoleGate(gateInput, fn) {
  if (typeof fn !== 'function') {
    const err = new Error('runWithCatalogAliasThenRoleGate requires a function');
    err.code = 'EROLEGATE_HARNESS';
    throw err;
  }

  const decision = decideWithCatalogAlias(gateInput);
  if (decision.outcome !== 'allow') {
    const err = new Error(`RoleGate deny: ${decision.reason}`);
    err.code = 'EROLEGATE_DENY';
    err.decision = decision;
    throw err;
  }

  return fn();
}

module.exports = {
  decideWithCatalogAlias,
  runWithCatalogAliasThenRoleGate,
};
