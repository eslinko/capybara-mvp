'use strict';

/**
 * TECH DEBT (ROLE-04 / DP3-B): WalletRegistry → Membership compatibility adapter.
 * Temporary bridge for CLI UX continuity while Membership persistence is Absent.
 * Removal date: Unknown (operator decision after identity runtime / Phase 2).
 * Do not treat as a permanent dual world (ungated CLI vs gated server).
 * WalletRegistry.resolve remains the address/key resolver — this module does not replace it.
 */

const MembershipStore = require('./MembershipStore');
const { buildActorContext } = require('./actorContext');
const { ROLES } = require('./roles');

const DEFAULT_FAMILY_ID = 'family-default-cli';
const ADAPTER_WALLETS = Object.freeze(['parent', 'tristan', 'bastian']);

const WALLET_TO_ROLE = Object.freeze({
  parent: ROLES.PARENT,
  tristan: ROLES.CHILD,
  bastian: ROLES.CHILD,
});

/**
 * Membership ids are adapter-prefixed — wallet names are NOT sole identity (AC-R02 bridge).
 * @param {string} walletName
 * @returns {string}
 */
function membershipIdForWallet(walletName) {
  return `m-adapter-${String(walletName).toLowerCase().trim()}`;
}

/**
 * @param {object} config
 * @param {string} walletName
 * @returns {string}
 */
function addressFromConfig(config, walletName) {
  const key = String(walletName).toLowerCase().trim();
  if (key === 'parent') {
    const address = config && config.parent && config.parent.address;
    if (!address) {
      const err = new Error('Config parent.address required for adapter seed');
      err.code = 'EADAPTER_CONFIG';
      throw err;
    }
    return address;
  }
  const wallet = config && config[key];
  if (!wallet || !wallet.address) {
    const err = new Error(`Config ${key}.address required for adapter seed`);
    err.code = 'EADAPTER_CONFIG';
    throw err;
  }
  return wallet.address;
}

/**
 * Seed one default family with parent/tristan/bastian Memberships from config addresses.
 *
 * @param {object} config
 * @param {MembershipStore} [store]
 * @returns {MembershipStore}
 */
function seedMembershipsFromWalletNames(config, store) {
  const s = store || new MembershipStore();
  if (!s.getFamily(DEFAULT_FAMILY_ID)) {
    s.createFamily({ id: DEFAULT_FAMILY_ID, label: 'CLI default family (adapter)' });
  }

  for (const name of ADAPTER_WALLETS) {
    const id = membershipIdForWallet(name);
    if (s.getMembership(id)) {
      continue;
    }
    s.addMembership({
      id,
      familyId: DEFAULT_FAMILY_ID,
      role: WALLET_TO_ROLE[name],
      address: addressFromConfig(config, name),
    });
  }
  return s;
}

/**
 * Resolve ActorContext for RoleGate.
 * Prefer Membership-backed `preferredActor` when Present; else adapter seed fallback.
 *
 * @param {{
 *   walletName: string,
 *   config: object,
 *   store?: MembershipStore,
 *   preferredActor?: object|null
 * }} input
 * @returns {ReturnType<typeof buildActorContext>}
 */
function resolveActorContextFromAdapter(input) {
  const preferred = input && input.preferredActor;
  if (
    preferred &&
    typeof preferred === 'object' &&
    typeof preferred.membershipId === 'string' &&
    preferred.membershipId.trim()
  ) {
    return preferred;
  }

  const walletName = String((input && input.walletName) || '')
    .toLowerCase()
    .trim();
  if (!ADAPTER_WALLETS.includes(walletName)) {
    const err = new Error(
      `Unknown adapter wallet "${input && input.walletName}". Known: ${ADAPTER_WALLETS.join(', ')}`
    );
    err.code = 'EADAPTER_UNKNOWN_WALLET';
    throw err;
  }

  const store = seedMembershipsFromWalletNames(input.config, input.store);
  const membership = store.getMembership(membershipIdForWallet(walletName));
  if (!membership) {
    const err = new Error(`Adapter membership missing for wallet "${walletName}"`);
    err.code = 'EADAPTER_MEMBERSHIP_MISSING';
    throw err;
  }
  return buildActorContext(membership);
}

/**
 * Convenience: CAPYBARA_WALLET env → ActorContext (unit / gated path helper).
 *
 * @param {{
 *   config: object,
 *   env?: NodeJS.ProcessEnv,
 *   store?: MembershipStore,
 *   preferredActor?: object|null
 * }} input
 * @returns {ReturnType<typeof buildActorContext>}
 */
function resolveActorContextFromEnvWallet(input) {
  const env = (input && input.env) || process.env;
  return resolveActorContextFromAdapter({
    walletName: env.CAPYBARA_WALLET,
    config: input.config,
    store: input.store,
    preferredActor: input.preferredActor,
  });
}

module.exports = {
  DEFAULT_FAMILY_ID,
  ADAPTER_WALLETS,
  WALLET_TO_ROLE,
  membershipIdForWallet,
  seedMembershipsFromWalletNames,
  resolveActorContextFromAdapter,
  resolveActorContextFromEnvWallet,
};
