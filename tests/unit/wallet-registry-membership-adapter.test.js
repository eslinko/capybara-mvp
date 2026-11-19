'use strict';

const { expect } = require('chai');

const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const {
  MembershipStore,
  buildActorContext,
  seedMembershipsFromWalletNames,
  resolveActorContextFromAdapter,
  resolveActorContextFromEnvWallet,
  membershipIdForWallet,
  DEFAULT_FAMILY_ID,
  ADAPTER_WALLETS,
} = require('../../packages/core/src/membership');
const {
  CAPABILITIES,
  decide,
  runWithRoleGate,
} = require('../../packages/core/src/roleGate');

describe('WalletRegistry membership adapter (ROLE-04)', () => {
  const config = {
    parent: {
      address: '0xParentCfg000000000000000000000000000001',
      privateKey: '0x' + 'c'.repeat(64),
    },
    tristan: {
      address: '0xTristanCfg00000000000000000000000000001',
      privateKey: '0x' + 'a'.repeat(64),
    },
    bastian: {
      address: '0xBastianCfg00000000000000000000000000001',
      privateKey: '0x' + 'b'.repeat(64),
    },
  };

  describe('seed Memberships from wallet names (t01)', () => {
    it('maps parent/tristan/bastian → roles with config addresses', () => {
      const store = seedMembershipsFromWalletNames(config);
      expect(store.getFamily(DEFAULT_FAMILY_ID)).to.not.equal(null);

      const parent = store.getMembership(membershipIdForWallet('parent'));
      const tristan = store.getMembership(membershipIdForWallet('tristan'));
      const bastian = store.getMembership(membershipIdForWallet('bastian'));

      expect(parent.role).to.equal('parent');
      expect(tristan.role).to.equal('child');
      expect(bastian.role).to.equal('child');
      expect(parent.address).to.match(/^0xparentcfg/);
      expect(tristan.address).to.match(/^0xtristancfg/);
      expect(bastian.address).to.match(/^0xbastiancfg/);

      // Wallet names are bridge labels — membership ids are adapter-prefixed (AC-R02).
      expect(parent.id).to.equal('m-adapter-parent');
      expect(tristan.id).to.not.equal('tristan');
    });
  });

  describe('ActorContext + prefer Membership-backed (t02/t03)', () => {
    it('builds ActorContext from adapter when no preferred actor', () => {
      const actor = resolveActorContextFromAdapter({
        walletName: 'parent',
        config,
      });
      expect(actor.membershipId).to.equal('m-adapter-parent');
      expect(actor.role).to.equal('parent');
      expect(actor.familyId).to.equal(DEFAULT_FAMILY_ID);
    });

    it('prefers Membership-backed preferredActor over wallet seed', () => {
      const store = new MembershipStore();
      store.createFamily({ id: 'fam-real' });
      const m = store.addMembership({
        id: 'm-real-p1',
        familyId: 'fam-real',
        role: 'parent',
        address: '0xRealParent00000000000000000000000000001',
      });
      const preferred = buildActorContext(m);
      const actor = resolveActorContextFromAdapter({
        walletName: 'parent',
        config,
        preferredActor: preferred,
      });
      expect(actor.membershipId).to.equal('m-real-p1');
      expect(actor.familyId).to.equal('fam-real');
    });

    it('resolveActorContextFromEnvWallet reads CAPYBARA_WALLET', () => {
      const actor = resolveActorContextFromEnvWallet({
        config,
        env: { CAPYBARA_WALLET: 'bastian' },
      });
      expect(actor.membershipId).to.equal('m-adapter-bastian');
      expect(actor.role).to.equal('child');
    });
  });

  describe('WalletRegistry.resolve unchanged (t04)', () => {
    it('still resolves address/privateKey for known names', () => {
      const registry = new WalletRegistry(config);
      const parent = registry.resolve('parent');
      expect(parent.address).to.equal(config.parent.address);
      expect(parent.privateKey).to.equal(config.parent.privateKey);
      expect(registry.listKnownWallets()).to.deep.equal([
        'tristan',
        'bastian',
        'parent',
      ]);
      expect(registry.listChildren()).to.deep.equal(['tristan', 'bastian']);
      expect(ADAPTER_WALLETS).to.include.members(['parent', 'tristan', 'bastian']);
    });
  });

  describe('adapter → RoleGate unit path (t05/t07)', () => {
    it('RoleGate accepts adapter ActorContext without Membership persistence invent', () => {
      const actor = resolveActorContextFromAdapter({
        walletName: 'tristan',
        config,
      });
      const decision = decide({
        actor,
        capabilityId: CAPABILITIES.CHILD_BALANCES,
        resourceScope: { membershipId: actor.membershipId },
        familyMemberships: seedMembershipsFromWalletNames(config).listMembershipsByFamily(
          DEFAULT_FAMILY_ID
        ),
      });
      expect(decision.outcome).to.equal('allow');

      let ran = false;
      runWithRoleGate(
        {
          actor: resolveActorContextFromAdapter({ walletName: 'parent', config }),
          capabilityId: CAPABILITIES.DEBT,
        },
        () => {
          ran = true;
          return 'ok';
        }
      );
      expect(ran).to.equal(true);
    });

    it('AC-R02: model still allows ≥2 parents/children beyond literal wallet names', () => {
      const store = seedMembershipsFromWalletNames(config);
      store.addMembership({
        id: 'm-extra-p',
        familyId: DEFAULT_FAMILY_ID,
        role: 'parent',
        address: '0xExtraParent000000000000000000000000001',
      });
      store.addMembership({
        id: 'm-extra-c',
        familyId: DEFAULT_FAMILY_ID,
        role: 'child',
        address: '0xExtraChild0000000000000000000000000001',
      });
      const members = store.listMembershipsByFamily(DEFAULT_FAMILY_ID);
      expect(members.filter((m) => m.role === 'parent')).to.have.length(2);
      expect(members.filter((m) => m.role === 'child')).to.have.length(3);
      const blob = JSON.stringify(members);
      // Extra members are not forced to WalletRegistry literal names as sole id.
      expect(members.some((m) => m.id === 'm-extra-p')).to.equal(true);
      expect(blob).to.match(/m-adapter-tristan/);
    });
  });
});
