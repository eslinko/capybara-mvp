'use strict';

/**
 * RoleGate + CatalogAlias (CAT-01).
 * Coarse CAPABILITIES / ALLOW_BY_ROLE remain ROLE-02 SSOT.
 * Full REQ-06 §3 expand = out of CAT-01; deny-always mint/deploy wire = CAT-02.
 */

const {
  CAPABILITIES,
  ROLE_MUTATION_CAPABILITY,
  ALLOW_BY_ROLE,
  isKnownCapability,
  isRoleMutationCapability,
  roleAllowsCapability,
} = require('./capabilities');
const { decide } = require('./decide');
const { runWithRoleGate } = require('./runWithRoleGate');
const {
  resolveCatalogAlias,
  resolveCoarseCapabilityId,
} = require('./catalogAlias');
const {
  CATALOG_ALIAS_SEED,
  CATALOG_NON_ALIASED,
  CATALOG_DENY_ALWAYS,
  CATALOG_UNMAPPED_EXPLICIT,
} = require('./catalogAliasSeed');

module.exports = {
  CAPABILITIES,
  ROLE_MUTATION_CAPABILITY,
  ALLOW_BY_ROLE,
  isKnownCapability,
  isRoleMutationCapability,
  roleAllowsCapability,
  decide,
  runWithRoleGate,
  resolveCatalogAlias,
  resolveCoarseCapabilityId,
  CATALOG_ALIAS_SEED,
  CATALOG_NON_ALIASED,
  CATALOG_DENY_ALWAYS,
  CATALOG_UNMAPPED_EXPLICIT,
};
