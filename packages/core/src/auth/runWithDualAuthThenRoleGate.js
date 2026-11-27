'use strict';

const { runWithRoleGate } = require('../roleGate');
const { dualAuthGate } = require('./dualAuthGate');
const { authError } = require('./errors');

/**
 * Thin order helper: DualAuthGate **before** RoleGate → action.
 * Async-aware for Postgres membership adapters (PGDUR-02).
 *
 * @param {Parameters<typeof dualAuthGate>[0]} dualInput
 * @param {{
 *   capabilityId: string,
 *   resourceScope?: object,
 *   familyMemberships?: object[],
 *   clientClaimedRole?: string,
 *   actor?: object
 * }} roleInput
 * @param {() => any} fn
 * @returns {Promise<any>}
 */
async function runWithDualAuthThenRoleGate(dualInput, roleInput, fn) {
  if (typeof fn !== 'function') {
    throw authError('EAUTH_BAD_PAYLOAD', 'runWithDualAuthThenRoleGate requires a function');
  }

  const allowed = await dualAuthGate({
    ...dualInput,
    clientClaimedRole: dualInput?.clientClaimedRole ?? roleInput?.clientClaimedRole,
  });

  void roleInput?.actor;
  void roleInput?.clientClaimedRole;

  return runWithRoleGate(
    {
      actor: allowed.actor,
      capabilityId: roleInput?.capabilityId,
      resourceScope: roleInput?.resourceScope,
      familyMemberships: roleInput?.familyMemberships,
    },
    fn,
  );
}

module.exports = {
  runWithDualAuthThenRoleGate,
};
