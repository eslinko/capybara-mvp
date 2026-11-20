'use strict';

const { expect } = require('chai');

const {
  MembershipStore,
  buildActorContext,
} = require('../../packages/core/src/membership');
const {
  CAPABILITIES,
  ROLE_MUTATION_CAPABILITY,
  TOKEN_MINT_CAPABILITY,
  TOKEN_DEPLOY_CAPABILITY,
  ALLOW_BY_ROLE,
  isCatalogDenyAlwaysCapability,
  decide,
  resolveCatalogAlias,
  decideWithCatalogAlias,
  runWithCatalogAliasThenRoleGate,
} = require('../../packages/core/src/roleGate');

function seedFamily() {
  const store = new MembershipStore();
  store.createFamily({ id: 'fam-cat02' });
  const p1 = store.addMembership({
    id: 'm-p1',
    familyId: 'fam-cat02',
    role: 'parent',
    address: '0xParentOne000000000000000000000000000001',
    userId: 'user-p1',
  });
  const c1 = store.addMembership({
    id: 'm-c1',
    familyId: 'fam-cat02',
    role: 'child',
    address: '0xChildOne0000000000000000000000000000001',
    userId: 'user-c1',
  });
  return {
    family: store.listMembershipsByFamily('fam-cat02'),
    parent1: buildActorContext(p1),
    child1: buildActorContext(c1),
  };
}

describe('roleGate / deny-always mint-deploy + alias bind (CAT-02)', () => {
  describe('constants + alias kind (t01/t02)', () => {
    it('exposes token.mint / token.deploy deny-always constants', () => {
      expect(TOKEN_MINT_CAPABILITY).to.equal('token.mint');
      expect(TOKEN_DEPLOY_CAPABILITY).to.equal('token.deploy');
      expect(isCatalogDenyAlwaysCapability(TOKEN_MINT_CAPABILITY)).to.equal(true);
      expect(isCatalogDenyAlwaysCapability(TOKEN_DEPLOY_CAPABILITY)).to.equal(true);
      expect(ALLOW_BY_ROLE[TOKEN_MINT_CAPABILITY]).to.equal(undefined);
      expect(ALLOW_BY_ROLE[TOKEN_DEPLOY_CAPABILITY]).to.equal(undefined);
    });

    it('CatalogAlias returns deny-always before known-capability path', () => {
      expect(resolveCatalogAlias('token.mint')).to.deep.include({
        kind: 'deny-always',
        inputId: 'token.mint',
      });
      expect(resolveCatalogAlias('token.deploy').kind).to.equal('deny-always');
    });
  });

  describe('AC-C05 parent+child mint/deploy deny (t03/t07)', () => {
    it('parent + child + token.mint → deny via decide and alias bind', () => {
      const { parent1, child1 } = seedFamily();
      expect(decide({ actor: parent1, capabilityId: TOKEN_MINT_CAPABILITY })).to.deep.equal({
        outcome: 'deny',
        reason: 'deny_always',
      });
      expect(decide({ actor: child1, capabilityId: TOKEN_MINT_CAPABILITY }).reason).to.equal(
        'deny_always',
      );
      expect(
        decideWithCatalogAlias({ actor: parent1, capabilityId: 'token.mint' }).reason,
      ).to.equal('deny_always');
      expect(
        decideWithCatalogAlias({ actor: child1, capabilityId: 'token.mint' }).reason,
      ).to.equal('deny_always');
    });

    it('parent + child + token.deploy → deny via decide and alias bind', () => {
      const { parent1, child1 } = seedFamily();
      expect(decide({ actor: parent1, capabilityId: TOKEN_DEPLOY_CAPABILITY }).reason).to.equal(
        'deny_always',
      );
      expect(decide({ actor: child1, capabilityId: TOKEN_DEPLOY_CAPABILITY }).reason).to.equal(
        'deny_always',
      );
      expect(
        decideWithCatalogAlias({ actor: parent1, capabilityId: 'token.deploy' }).reason,
      ).to.equal('deny_always');
      expect(
        decideWithCatalogAlias({ actor: child1, capabilityId: 'token.deploy' }).reason,
      ).to.equal('deny_always');
    });

    it('runWithCatalogAliasThenRoleGate throws on mint without invoking fn', () => {
      const { parent1 } = seedFamily();
      let ran = false;
      expect(() =>
        runWithCatalogAliasThenRoleGate(
          { actor: parent1, capabilityId: 'token.mint' },
          () => {
            ran = true;
          },
        ),
      ).to.throw(/deny_always/);
      expect(ran).to.equal(false);
    });
  });

  describe('§3 pre-map + preserve mutation (t04/t05)', () => {
    it('mapped §3 id reaches RoleGate coarse path (not unknown before alias)', () => {
      const { parent1, child1 } = seedFamily();
      const parentOut = decideWithCatalogAlias({
        actor: parent1,
        capabilityId: 'family.invite_member',
      });
      expect(parentOut.alias.kind).to.equal('mapped');
      expect(parentOut.alias.coarseId).to.equal(CAPABILITIES.FAMILY_MEMBERS_SETTINGS);
      expect(parentOut.outcome).to.equal('allow');
      expect(parentOut.reason).to.equal('ok');

      const childOut = decideWithCatalogAlias({
        actor: child1,
        capabilityId: 'family.invite_member',
      });
      expect(childOut.alias.coarseId).to.equal(CAPABILITIES.FAMILY_MEMBERS_SETTINGS);
      expect(childOut.outcome).to.equal('deny');
      expect(childOut.reason).to.equal('role_denied');
      // bare decide without alias would treat invite_member as unknown
      expect(
        decide({ actor: parent1, capabilityId: 'family.invite_member' }).reason,
      ).to.equal('unknown_capability');
    });

    it('membership.change_role still deny after alias bind', () => {
      const { parent1, child1 } = seedFamily();
      expect(
        decide({ actor: parent1, capabilityId: ROLE_MUTATION_CAPABILITY }).reason,
      ).to.equal('role_mutation');
      expect(
        decideWithCatalogAlias({
          actor: child1,
          capabilityId: ROLE_MUTATION_CAPABILITY,
        }).reason,
      ).to.equal('role_mutation');
    });
  });
});
