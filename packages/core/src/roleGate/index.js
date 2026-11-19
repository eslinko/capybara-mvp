'use strict';

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

module.exports = {
  CAPABILITIES,
  ROLE_MUTATION_CAPABILITY,
  ALLOW_BY_ROLE,
  isKnownCapability,
  isRoleMutationCapability,
  roleAllowsCapability,
  decide,
  runWithRoleGate,
};
