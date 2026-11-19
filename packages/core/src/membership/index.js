'use strict';

const MembershipStore = require('./MembershipStore');
const { ROLES, ROLE_SET, isRole, assertRole } = require('./roles');
const { buildActorContext } = require('./actorContext');
const { allowedResourceSet } = require('./allowedResources');
const { normalizeAddress } = require('./normalize');
const {
  buildAttributionPayload,
  resolveValidatedBy,
} = require('./attribution');

module.exports = {
  MembershipStore,
  ROLES,
  ROLE_SET,
  isRole,
  assertRole,
  buildActorContext,
  allowedResourceSet,
  normalizeAddress,
  buildAttributionPayload,
  resolveValidatedBy,
};
