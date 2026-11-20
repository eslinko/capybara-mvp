'use strict';

const { isKnownCapability } = require('./capabilities');
const {
  CATALOG_ALIAS_SEED,
  CATALOG_NON_ALIASED,
  CATALOG_DENY_ALWAYS,
  CATALOG_UNMAPPED_EXPLICIT,
  isAdvanceUnmapped,
} = require('./catalogAliasSeed');

/**
 * @typedef {{
 *   kind: 'mapped' | 'passthrough' | 'unmapped' | 'deny-always' | 'non-aliased',
 *   coarseId?: string,
 *   inputId: string | null
 * }} CatalogAliasResult
 */

/**
 * CatalogAlias resolve — REQ-06 §3 / policy id → coarse RoleGate id | unmapped | deny-always.
 * Does **not** expand ALLOW_BY_ROLE. Deny-always mint/deploy checked before isKnownCapability.
 *
 * @param {unknown} capabilityId
 * @returns {CatalogAliasResult}
 */
function resolveCatalogAlias(capabilityId) {
  if (typeof capabilityId !== 'string' || !capabilityId.trim()) {
    return { kind: 'unmapped', inputId: null };
  }

  const id = capabilityId.trim();

  if (CATALOG_DENY_ALWAYS.has(id)) {
    return { kind: 'deny-always', inputId: id };
  }

  if (CATALOG_NON_ALIASED.has(id)) {
    return { kind: 'non-aliased', inputId: id };
  }

  if (CATALOG_UNMAPPED_EXPLICIT.has(id) || isAdvanceUnmapped(id)) {
    return { kind: 'unmapped', inputId: id };
  }

  if (Object.prototype.hasOwnProperty.call(CATALOG_ALIAS_SEED, id)) {
    const coarseId = CATALOG_ALIAS_SEED[id];
    if (coarseId === id && isKnownCapability(id)) {
      return { kind: 'passthrough', coarseId, inputId: id };
    }
    return { kind: 'mapped', coarseId, inputId: id };
  }

  // Coarse id already in CAPABILITIES → passthrough
  if (isKnownCapability(id)) {
    return { kind: 'passthrough', coarseId: id, inputId: id };
  }

  return { kind: 'unmapped', inputId: id };
}

/**
 * Coarse id for RoleGate when alias allows; null if unmapped / deny-always / non-aliased.
 *
 * @param {unknown} capabilityId
 * @returns {string | null}
 */
function resolveCoarseCapabilityId(capabilityId) {
  const result = resolveCatalogAlias(capabilityId);
  if (result.kind === 'mapped' || result.kind === 'passthrough') {
    return result.coarseId ?? null;
  }
  return null;
}

module.exports = {
  resolveCatalogAlias,
  resolveCoarseCapabilityId,
};
