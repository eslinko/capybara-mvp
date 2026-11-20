'use strict';

const { runWithRoleGate } = require('../roleGate');
const { dualAuthGate } = require('./dualAuthGate');
const { authError } = require('./errors');

/**
 * Thin order helper: DualAuthGate **before** RoleGate → action.
 * Does **not** put dual-auth into roleGate/capabilities.js.
 *
 * CLI residual: ungated CLI coexistence is out of this helper — see dualAuthGate.js.
 *
 * @param {Parameters<typeof dualAuthGate>[0]} dualInput
 * @param {{
 *   capabilityId: string,
 *   resourceScope?: object,
 *   familyMemberships?: object[],
 *   clientClaimedRole?: string,
 *   actor?: object
 * }} roleInput — clientClaimedRole / actor ignored (AC-A03); actor from DualAuthGate
 * @param {() => any} fn
 * @returns {any}
 */
function runWithDualAuthThenRoleGate(dualInput, roleInput, fn) {
  if (typeof fn !== 'function') {
    throw authError('EAUTH_BAD_PAYLOAD', 'runWithDualAuthThenRoleGate requires a function');
  }

  // DualAuth first — fail-closed unauth (AC-A01)
  const allowed = dualAuthGate({
    ...dualInput,
    clientClaimedRole: dualInput?.clientClaimedRole ?? roleInput?.clientClaimedRole,
  });

  // RoleGate second — membership role on actor; ignore any client-claimed actor/role
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
