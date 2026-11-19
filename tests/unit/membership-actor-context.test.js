'use strict';

const { expect } = require('chai');

const {
  MembershipStore,
  ROLES,
  isRole,
  assertRole,
  buildActorContext,
  allowedResourceSet,
} = require('../../packages/core/src/membership');

describe('membership / ActorContext domain (ROLE-01)', () => {
  describe('roles (AC-R01)', () => {
    it('allows only parent|child', () => {
      expect(isRole('parent')).to.equal(true);
      expect(isRole('child')).to.equal(true);
      expect(isRole('admin')).to.equal(false);
      expect(isRole('tristan')).to.equal(false);
      expect(assertRole(ROLES.PARENT)).to.equal('parent');
      expect(() => assertRole('guardian')).to.throw(/Invalid role/);
    });
  });

  describe('MembershipStore fixtures (AC-R02)', () => {
    it('supports ≥2 parent + ≥2 child without hardcoded display names', () => {
      const store = new MembershipStore();
      store.createFamily({ id: 'fam-a' });

      const parents = [
        store.addMembership({
          id: 'm-p1',
          familyId: 'fam-a',
          role: 'parent',
          address: '0xParentOne000000000000000000000000000001',
          userId: 'user-p1',
        }),
        store.addMembership({
          id: 'm-p2',
          familyId: 'fam-a',
          role: 'parent',
          address: '0xParentTwo000000000000000000000000000002',
          userId: 'user-p2',
        }),
      ];
      const children = [
        store.addMembership({
          id: 'm-c1',
          familyId: 'fam-a',
          role: 'child',
          address: '0xChildOne0000000000000000000000000000001',
          userId: 'user-c1',
        }),
        store.addMembership({
          id: 'm-c2',
          familyId: 'fam-a',
          role: 'child',
          address: '0xChildTwo0000000000000000000000000000002',
          userId: 'user-c2',
        }),
      ];

      const members = store.listMembershipsByFamily('fam-a');
      expect(members.filter((m) => m.role === 'parent')).to.have.length(2);
      expect(members.filter((m) => m.role === 'child')).to.have.length(2);
      // Model identity is ids/addresses — not WalletRegistry wallet names.
      const blob = JSON.stringify(members);
      expect(blob).to.not.match(/tristan|bastian/i);
      expect(members.every((m) => typeof m.id === 'string' && m.id.startsWith('m-'))).to.equal(
        true
      );
      expect(parents[0].id).to.equal('m-p1');
      expect(children[1].address).to.match(/^0xchildtwo/);
    });

    it('rejects unknown family and duplicate membership id', () => {
      const store = new MembershipStore();
      expect(() =>
        store.addMembership({
          id: 'm1',
          familyId: 'missing',
          role: 'child',
          address: '0x1',
        })
      ).to.throw(/Unknown familyId/);

      store.createFamily({ id: 'fam-a' });
      store.addMembership({
        id: 'm1',
        familyId: 'fam-a',
        role: 'child',
        address: '0x1',
      });
      expect(() =>
        store.addMembership({
          id: 'm1',
          familyId: 'fam-a',
          role: 'child',
          address: '0x2',
        })
      ).to.throw(/already exists/);
    });
  });

  describe('multi-family (AC-R06)', () => {
    it('same userId can have several Memberships in different families', () => {
      const store = new MembershipStore();
      store.createFamily({ id: 'fam-a' });
      store.createFamily({ id: 'fam-b' });

      store.addMembership({
        id: 'm-a',
        familyId: 'fam-a',
        role: 'parent',
        address: '0xSameParent0000000000000000000000000001',
        userId: 'user-shared',
      });
      store.addMembership({
        id: 'm-b',
        familyId: 'fam-b',
        role: 'parent',
        address: '0xSameParent0000000000000000000000000001',
        userId: 'user-shared',
      });

      const list = store.listMembershipsByUserId('user-shared');
      expect(list).to.have.length(2);
      expect(list.map((m) => m.familyId).sort()).to.deep.equal(['fam-a', 'fam-b']);
    });
  });

  describe('address → one role globally (AC-R07)', () => {
    it('rejects assigning a different role to an existing address', () => {
      const store = new MembershipStore();
      store.createFamily({ id: 'fam-a' });
      store.createFamily({ id: 'fam-b' });
      store.addMembership({
        id: 'm-a',
        familyId: 'fam-a',
        role: 'parent',
        address: '0xConflict000000000000000000000000000001',
      });

      expect(() =>
        store.addMembership({
          id: 'm-b',
          familyId: 'fam-b',
          role: 'child',
          address: '0xConflict000000000000000000000000000001',
        })
      )
        .to.throw(/already bound to role "parent"/)
        .with.property('code', 'EMEMBERSHIP_ADDRESS_ROLE_CONFLICT');

      expect(store.getRoleForAddress('0xConflict000000000000000000000000000001')).to.equal(
        'parent'
      );
    });
  });

  describe('role immutable / no change API (AC-R08)', () => {
    it('changeRole and setRole throw; capability absent', () => {
      const store = new MembershipStore();
      expect(() => store.changeRole()).to.throw(/not supported/);
      expect(() => store.setRole()).to.throw(/not supported/);
      expect(typeof store.changeRole).to.equal('function');
      // No silent mutate helpers beyond the intentional throw stubs.
      expect(store).to.not.have.property('updateRole');
      expect(Object.getOwnPropertyNames(MembershipStore.prototype)).to.not.include(
        'updateRole'
      );
    });
  });

  describe('ActorContext builder', () => {
    it('builds membershipId, role, address, familyId; optional userId', () => {
      const store = new MembershipStore();
      store.createFamily({ id: 'fam-a' });
      const m = store.addMembership({
        id: 'm1',
        familyId: 'fam-a',
        role: 'child',
        address: '0xActor00000000000000000000000000000001',
        userId: 'u-1',
      });
      const ctx = buildActorContext(m);
      expect(ctx).to.deep.equal({
        membershipId: 'm1',
        role: 'child',
        address: '0xactor00000000000000000000000000000001',
        familyId: 'fam-a',
        userId: 'u-1',
      });

      const withoutUser = buildActorContext({
        id: 'm2',
        familyId: 'fam-a',
        role: 'parent',
        address: '0xActorParent00000000000000000000000002',
      });
      expect(withoutUser).to.not.have.property('userId');
    });
  });

  describe('allowed resource set helper (AC-R04 prep, no RoleGate)', () => {
    it('child=self; parent=family members', () => {
      const store = new MembershipStore();
      store.createFamily({ id: 'fam-a' });
      const parent = store.addMembership({
        id: 'm-p',
        familyId: 'fam-a',
        role: 'parent',
        address: '0xP000000000000000000000000000000000001',
      });
      const child = store.addMembership({
        id: 'm-c',
        familyId: 'fam-a',
        role: 'child',
        address: '0xC000000000000000000000000000000000001',
      });
      const sibling = store.addMembership({
        id: 'm-c2',
        familyId: 'fam-a',
        role: 'child',
        address: '0xC000000000000000000000000000000000002',
      });
      const family = store.listMembershipsByFamily('fam-a');

      const childSet = allowedResourceSet(child, family);
      expect(childSet.membershipIds).to.deep.equal(['m-c']);
      expect(childSet.addresses).to.deep.equal([child.address]);

      const parentSet = allowedResourceSet(parent, family);
      expect(parentSet.membershipIds.sort()).to.deep.equal(
        ['m-c', 'm-c2', 'm-p'].sort()
      );
      expect(parentSet.addresses).to.include(sibling.address);
    });
  });
});
