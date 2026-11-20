'use strict';

/**
 * Stable capabilityId strings for REQ-03 §3 matrix rows only.
 * Full REQ-06 catalog is out of scope for ROLE-02.
 */

const CAPABILITIES = Object.freeze({
  POOL_BALANCE: 'pool.balance',
  CHILD_BALANCES: 'child.balances',
  PAYOUT_FIXED_EDU_DAILY: 'payout.fixed_edu_daily',
  EDUCATION_RECORDS: 'education.records',
  CAPY_RETURN_TO_PARENT: 'capy.return_to_parent',
  MULTI_CHILD_DEBIT: 'multi_child.debit',
  DEBT: 'debt',
  SANCTIONS: 'sanctions',
  CASHOUT_REQUEST: 'cashout.request',
  PROFILE_SELF: 'profile.self',
  FAMILY_MEMBERS_SETTINGS: 'family.members_settings',
  FAMILY_JOURNAL: 'family.journal',
});

/** Synthetic id — must always deny (AC-R08). */
const ROLE_MUTATION_CAPABILITY = 'membership.change_role';

/** Synthetic deny-always ids (AC-C05) — family product never allows mint/deploy. */
const TOKEN_MINT_CAPABILITY = 'token.mint';
const TOKEN_DEPLOY_CAPABILITY = 'token.deploy';

const CATALOG_DENY_ALWAYS_CAPABILITIES = Object.freeze(
  new Set([TOKEN_MINT_CAPABILITY, TOKEN_DEPLOY_CAPABILITY]),
);

/**
 * Role allow table for §3 rows.
 * `true` = role may invoke (resource scope still applies when ids present).
 * Child "N/A MVP" / "Нет" → false.
 */
const ALLOW_BY_ROLE = Object.freeze({
  [CAPABILITIES.POOL_BALANCE]: Object.freeze({ parent: true, child: false }),
  [CAPABILITIES.CHILD_BALANCES]: Object.freeze({ parent: true, child: true }),
  [CAPABILITIES.PAYOUT_FIXED_EDU_DAILY]: Object.freeze({ parent: true, child: true }),
  [CAPABILITIES.EDUCATION_RECORDS]: Object.freeze({ parent: true, child: true }),
  [CAPABILITIES.CAPY_RETURN_TO_PARENT]: Object.freeze({ parent: true, child: true }),
  [CAPABILITIES.MULTI_CHILD_DEBIT]: Object.freeze({ parent: true, child: false }),
  [CAPABILITIES.DEBT]: Object.freeze({ parent: true, child: true }),
  [CAPABILITIES.SANCTIONS]: Object.freeze({ parent: true, child: true }),
  [CAPABILITIES.CASHOUT_REQUEST]: Object.freeze({ parent: true, child: true }),
  [CAPABILITIES.PROFILE_SELF]: Object.freeze({ parent: true, child: true }),
  [CAPABILITIES.FAMILY_MEMBERS_SETTINGS]: Object.freeze({ parent: true, child: false }),
  [CAPABILITIES.FAMILY_JOURNAL]: Object.freeze({ parent: true, child: true }),
});

const KNOWN_CAPABILITY_SET = new Set(Object.values(CAPABILITIES));

/**
 * @param {string} capabilityId
 * @returns {boolean}
 */
function isKnownCapability(capabilityId) {
  return typeof capabilityId === 'string' && KNOWN_CAPABILITY_SET.has(capabilityId);
}

/**
 * @param {string} capabilityId
 * @returns {boolean}
 */
function isRoleMutationCapability(capabilityId) {
  return capabilityId === ROLE_MUTATION_CAPABILITY;
}

/**
 * @param {string} capabilityId
 * @returns {boolean}
 */
function isCatalogDenyAlwaysCapability(capabilityId) {
  return (
    typeof capabilityId === 'string' &&
    CATALOG_DENY_ALWAYS_CAPABILITIES.has(capabilityId)
  );
}

/**
 * @param {'parent'|'child'} role
 * @param {string} capabilityId
 * @returns {boolean}
 */
function roleAllowsCapability(role, capabilityId) {
  const row = ALLOW_BY_ROLE[capabilityId];
  if (!row) return false;
  return row[role] === true;
}

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
};
