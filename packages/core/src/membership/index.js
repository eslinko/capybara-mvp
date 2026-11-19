'use strict';

const MembershipStore = require('./MembershipStore');
const { ROLES, ROLE_SET, isRole, assertRole } = require('./roles');
const { buildActorContext } = require('./actorContext');
const { allowedResourceSet } = require('./allowedResources');
const { normalizeAddress } = require('./normalize');

module.exports = {
  MembershipStore,
  ROLES,
  ROLE_SET,
  isRole,
  assertRole,
  buildActorContext,
  allowedResourceSet,
  normalizeAddress,
};
