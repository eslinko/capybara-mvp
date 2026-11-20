'use strict';

const { CAPABILITIES } = require('./capabilities');

/**
 * AC-C06 successor path: documented seed alias map (arch-01 / REQ §0).
 * Do **not** silent-guess outside this table. Export for tests/docs.
 *
 * @type {Readonly<Record<string, string>>}
 */
const CATALOG_ALIAS_SEED = Object.freeze({
  // identity
  [CAPABILITIES.PROFILE_SELF]: CAPABILITIES.PROFILE_SELF,

  // family
  'family.invite_member': CAPABILITIES.FAMILY_MEMBERS_SETTINGS,
  'family.settings': CAPABILITIES.FAMILY_MEMBERS_SETTINGS,

  // pool / ledger
  'pool.view': CAPABILITIES.POOL_BALANCE,
  'pool.payout_out': CAPABILITIES.PAYOUT_FIXED_EDU_DAILY,
  'charge.single': CAPABILITIES.MULTI_CHILD_DEBIT,
  'charge.group': CAPABILITIES.MULTI_CHILD_DEBIT,
  'transfer.child_to_pool': CAPABILITIES.CAPY_RETURN_TO_PARENT,
  'academic.record': CAPABILITIES.EDUCATION_RECORDS,

  // debt / sanctions / cashout / history
  'debt.create': CAPABILITIES.DEBT,
  'debt.forgive': CAPABILITIES.DEBT,
  'debt.fine': CAPABILITIES.DEBT,
  'debt.limits': CAPABILITIES.DEBT,
  'debt.repay': CAPABILITIES.DEBT,
  'debt.view': CAPABILITIES.DEBT,
  'debt.sanction': CAPABILITIES.SANCTIONS,
  'cashout.create': CAPABILITIES.CASHOUT_REQUEST,
  'cashout.fulfill': CAPABILITIES.CASHOUT_REQUEST,
  'cashout.view_own': CAPABILITIES.CASHOUT_REQUEST,
  'cashout.view_family': CAPABILITIES.CASHOUT_REQUEST,
  'history.family': CAPABILITIES.FAMILY_JOURNAL,
  'history.self': CAPABILITIES.FAMILY_JOURNAL,
});

/**
 * Ids that must never be aliased into RoleGate (AUTH bootstrap flow).
 * @type {ReadonlySet<string>}
 */
const CATALOG_NON_ALIASED = Object.freeze(
  new Set(['bootstrap.pool_and_founder']),
);

/**
 * Deny-always ids (AC-C05) — kind reserved; wire in CAT-02.
 * @type {ReadonlySet<string>}
 */
const CATALOG_DENY_ALWAYS = Object.freeze(
  new Set(['token.mint', 'token.deploy']),
);

/**
 * Explicit unmapped deny (fail-closed until product decides).
 * Prefix match for advance.*.
 * @type {ReadonlySet<string>}
 */
const CATALOG_UNMAPPED_EXPLICIT = Object.freeze(
  new Set(['family.overview']),
);

/**
 * @param {string} capabilityId
 * @returns {boolean}
 */
function isAdvanceUnmapped(capabilityId) {
  return (
    typeof capabilityId === 'string' &&
    (capabilityId === 'advance' || capabilityId.startsWith('advance.'))
  );
}

module.exports = {
  CATALOG_ALIAS_SEED,
  CATALOG_NON_ALIASED,
  CATALOG_DENY_ALWAYS,
  CATALOG_UNMAPPED_EXPLICIT,
  isAdvanceUnmapped,
};
