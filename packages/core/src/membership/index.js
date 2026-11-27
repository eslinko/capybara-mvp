'use strict';

const MembershipStore = require('./MembershipStore');
const PostgresMembershipStore = require('./PostgresMembershipStore');
const FailClosedMembershipStore = require('./FailClosedMembershipStore');
const { ROLES, ROLE_SET, isRole, assertRole } = require('./roles');
const { buildActorContext } = require('./actorContext');
const { allowedResourceSet } = require('./allowedResources');
const { normalizeAddress } = require('./normalize');
const {
  buildAttributionPayload,
  resolveValidatedBy,
} = require('./attribution');
const {
  DEFAULT_FAMILY_ID,
  ADAPTER_WALLETS,
  WALLET_TO_ROLE,
  membershipIdForWallet,
  seedMembershipsFromWalletNames,
  resolveActorContextFromAdapter,
  resolveActorContextFromEnvWallet,
} = require('./walletRegistryAdapter');

module.exports = {
  MembershipStore,
  PostgresMembershipStore,
  FailClosedMembershipStore,
  ROLES,
  ROLE_SET,
  isRole,
  assertRole,
  buildActorContext,
  allowedResourceSet,
  normalizeAddress,
  buildAttributionPayload,
  resolveValidatedBy,
  DEFAULT_FAMILY_ID,
  ADAPTER_WALLETS,
  WALLET_TO_ROLE,
  membershipIdForWallet,
  seedMembershipsFromWalletNames,
  resolveActorContextFromAdapter,
  resolveActorContextFromEnvWallet,
};
