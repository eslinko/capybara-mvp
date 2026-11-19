'use strict';

const { decide } = require('./decide');

/**
 * Thin harness: invoke Action (or any fn) only after RoleGate allow.
 * Deny → throw, no side effects from fn.
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
function runWithRoleGate(gateInput, fn) {
  if (typeof fn !== 'function') {
    const err = new Error('runWithRoleGate requires a function');
    err.code = 'EROLEGATE_HARNESS';
    throw err;
  }

  const decision = decide(gateInput);
  if (decision.outcome !== 'allow') {
    const err = new Error(`RoleGate deny: ${decision.reason}`);
    err.code = 'EROLEGATE_DENY';
    err.decision = decision;
    throw err;
  }

  return fn();
}

module.exports = {
  runWithRoleGate,
};
