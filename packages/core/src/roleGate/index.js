'use strict';

/**
 * RoleGate + CatalogAlias (CAT-01/02).
 * Coarse CAPABILITIES / ALLOW_BY_ROLE remain ROLE-02 SSOT — do not merge §3 aliases into the table.
 * Bind order: CatalogAlias → decide (CAT-02).
 */

const {
  CAPABILITIES,
  ROLE_MUTATION_CAPABILITY,
  TOKEN_MINT_CAPABILITY,
  TOKEN_DEPLOY_CAPABILITY,
  CATALOG_DENY_ALWAYS_CAPABILITIES,
  ALLOW_BY_ROLE,
  isKnownCapability,
  isRoleMutationCapability,
  isCatalogDenyAlwaysCapability,
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
const {
  decideWithCatalogAlias,
  runWithCatalogAliasThenRoleGate,
} = require('./runWithCatalogAliasThenRoleGate');

module.exports = {
  CAPABILITIES,
  ROLE_MUTATION_CAPABILITY,
  TOKEN_MINT_CAPABILITY,
  TOKEN_DEPLOY_CAPABILITY,
  CATALOG_DENY_ALWAYS_CAPABILITIES,
  ALLOW_BY_ROLE,
  isKnownCapability,
  isRoleMutationCapability,
  isCatalogDenyAlwaysCapability,
  roleAllowsCapability,
  decide,
  runWithRoleGate,
  resolveCatalogAlias,
  resolveCoarseCapabilityId,
  CATALOG_ALIAS_SEED,
  CATALOG_NON_ALIASED,
  CATALOG_DENY_ALWAYS,
  CATALOG_UNMAPPED_EXPLICIT,
  decideWithCatalogAlias,
  runWithCatalogAliasThenRoleGate,
};
