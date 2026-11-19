'use strict';

const { expect } = require('chai');

const {
  MembershipStore,
  buildActorContext,
} = require('../../packages/core/src/membership');
const {
  CAPABILITIES,
  ROLE_MUTATION_CAPABILITY,
  ALLOW_BY_ROLE,
  decide,
  runWithRoleGate,
} = require('../../packages/core/src/roleGate');

function seedFamily() {
  const store = new MembershipStore();
  store.createFamily({ id: 'fam-a' });
  const p1 = store.addMembership({
    id: 'm-p1',
    familyId: 'fam-a',
    role: 'parent',
    address: '0xParentOne000000000000000000000000000001',
    userId: 'user-p1',
  });
  const p2 = store.addMembership({
    id: 'm-p2',
    familyId: 'fam-a',
    role: 'parent',
    address: '0xParentTwo000000000000000000000000000002',
    userId: 'user-p2',
  });
  const c1 = store.addMembership({
    id: 'm-c1',
    familyId: 'fam-a',
    role: 'child',
    address: '0xChildOne0000000000000000000000000000001',
    userId: 'user-c1',
  });
  const c2 = store.addMembership({
    id: 'm-c2',
    familyId: 'fam-a',
    role: 'child',
    address: '0xChildTwo0000000000000000000000000000002',
    userId: 'user-c2',
  });
  const family = store.listMembershipsByFamily('fam-a');
  return {
    store,
    family,
    parent1: buildActorContext(p1),
    parent2: buildActorContext(p2),
    child1: buildActorContext(c1),
    child2: buildActorContext(c2),
  };
}

describe('RoleGate enforcement (ROLE-02)', () => {
  describe('capability allow table REQ-03 §3 (t01)', () => {
    it('exposes stable ids for §3 rows only (not WalletRegistry names)', () => {
      const ids = Object.values(CAPABILITIES);
      expect(ids).to.have.length(12);
      expect(ids).to.include(CAPABILITIES.DEBT);
      expect(ids).to.include(CAPABILITIES.POOL_BALANCE);
      expect(ALLOW_BY_ROLE[CAPABILITIES.MULTI_CHILD_DEBIT].child).to.equal(false);
      expect(ALLOW_BY_ROLE[CAPABILITIES.FAMILY_MEMBERS_SETTINGS].child).to.equal(
        false
      );
      const blob = JSON.stringify(CAPABILITIES);
      expect(blob).to.not.match(/tristan|bastian/i);
    });
  });

  describe('parent vs child matrix (AC-R03/R09)', () => {
    it('allows parent and denies child for pool.balance and multi_child.debit', () => {
      const { parent1, child1 } = seedFamily();
      expect(
        decide({ actor: parent1, capabilityId: CAPABILITIES.POOL_BALANCE }).outcome
      ).to.equal('allow');
      expect(
        decide({ actor: child1, capabilityId: CAPABILITIES.POOL_BALANCE }).outcome
      ).to.equal('deny');
      expect(
        decide({
          actor: parent1,
          capabilityId: CAPABILITIES.MULTI_CHILD_DEBIT,
        }).outcome
      ).to.equal('allow');
      expect(
        decide({
          actor: child1,
          capabilityId: CAPABILITIES.MULTI_CHILD_DEBIT,
        }).outcome
      ).to.equal('deny');
    });

    it('allows both roles for debt at role×capability layer', () => {
      const { parent1, child1 } = seedFamily();
      expect(
        decide({ actor: parent1, capabilityId: CAPABILITIES.DEBT }).outcome
      ).to.equal('allow');
      expect(
        decide({ actor: child1, capabilityId: CAPABILITIES.DEBT }).outcome
      ).to.equal('allow');
    });
  });

  describe('missing ActorContext → deny (t03)', () => {
    it('denies null/undefined actor without invoking action fn', () => {
      expect(decide({ actor: null, capabilityId: CAPABILITIES.DEBT })).to.deep.equal({
        outcome: 'deny',
        reason: 'missing_actor',
      });
      expect(decide({ actor: undefined, capabilityId: CAPABILITIES.DEBT }).reason).to.equal(
        'missing_actor'
      );

      let called = false;
      expect(() =>
        runWithRoleGate({ actor: null, capabilityId: CAPABILITIES.DEBT }, () => {
          called = true;
          return 'ran';
        })
      ).to.throw(/RoleGate deny/);
      expect(called).to.equal(false);
    });
  });

  describe('scope check AC-R04 (t04)', () => {
    it('denies child targeting a foreign membership id', () => {
      const { child1, family } = seedFamily();
      const decision = decide({
        actor: child1,
        capabilityId: CAPABILITIES.CHILD_BALANCES,
        resourceScope: { membershipId: 'm-c2' },
        familyMemberships: family,
      });
      expect(decision.outcome).to.equal('deny');
      expect(decision.reason).to.equal('scope_denied');
    });

    it('allows child targeting self membership id', () => {
      const { child1, family } = seedFamily();
      expect(
        decide({
          actor: child1,
          capabilityId: CAPABILITIES.CHILD_BALANCES,
          resourceScope: { membershipId: 'm-c1' },
          familyMemberships: family,
        }).outcome
      ).to.equal('allow');
    });

    it('allows parent targeting any family child membership id', () => {
      const { parent1, family } = seedFamily();
      expect(
        decide({
          actor: parent1,
          capabilityId: CAPABILITIES.CHILD_BALANCES,
          resourceScope: { membershipId: 'm-c2' },
          familyMemberships: family,
        }).outcome
      ).to.equal('allow');
    });
  });

  describe('role-mutation capability (AC-R08 / t05)', () => {
    it('denies synthetic membership.change_role for parent and child', () => {
      const { parent1, child1 } = seedFamily();
      expect(
        decide({ actor: parent1, capabilityId: ROLE_MUTATION_CAPABILITY }).reason
      ).to.equal('role_mutation');
      expect(
        decide({ actor: child1, capabilityId: ROLE_MUTATION_CAPABILITY }).reason
      ).to.equal('role_mutation');
    });
  });

  describe('equal parents (AC-R03 / t06)', () => {
    it('gives two parents identical allow outcomes on §3 sample rows', () => {
      const { parent1, parent2 } = seedFamily();
      const samples = [
        CAPABILITIES.POOL_BALANCE,
        CAPABILITIES.DEBT,
        CAPABILITIES.FAMILY_MEMBERS_SETTINGS,
        CAPABILITIES.MULTI_CHILD_DEBIT,
        CAPABILITIES.PROFILE_SELF,
      ];
      for (const capabilityId of samples) {
        const a = decide({ actor: parent1, capabilityId });
        const b = decide({ actor: parent2, capabilityId });
        expect(a).to.deep.equal(b);
        expect(a.outcome).to.equal('allow');
      }
    });
  });

  describe('thin harness one action path (t07)', () => {
    it('invokes Action stub only after allow; deny has no side effects', () => {
      const { parent1, child1, family } = seedFamily();
      let ran = 0;
      const out = runWithRoleGate(
        {
          actor: parent1,
          capabilityId: CAPABILITIES.DEBT,
          resourceScope: { membershipId: 'm-c1' },
          familyMemberships: family,
        },
        () => {
          ran += 1;
          return { ok: true, action: 6 };
        }
      );
      expect(out).to.deep.equal({ ok: true, action: 6 });
      expect(ran).to.equal(1);

      expect(() =>
        runWithRoleGate(
          {
            actor: child1,
            capabilityId: CAPABILITIES.POOL_BALANCE,
          },
          () => {
            ran += 1;
            return { ok: true };
          }
        )
      )
        .to.throw(/RoleGate deny/)
        .with.property('code', 'EROLEGATE_DENY');
      expect(ran).to.equal(1);
    });

    it('CapybaraActionsManager.action6DebtLedgerGated uses runWithRoleGate', () => {
      const { runWithRoleGate: harness } = require('../../packages/core/src/roleGate');
      const { CapybaraActionsManager } = require('../../packages/core/src/actions');
      expect(typeof harness).to.equal('function');
      expect(CapybaraActionsManager.prototype.action6DebtLedgerGated).to.be.a(
        'function'
      );

      const { child1 } = seedFamily();
      const manager = Object.create(CapybaraActionsManager.prototype);
      let debtCalled = false;
      manager.action6DebtLedger = async () => {
        debtCalled = true;
        return { gated: true };
      };

      return manager
        .action6DebtLedgerGated({
          actor: child1,
          capabilityId: CAPABILITIES.POOL_BALANCE,
        })
        .then(
          () => {
            throw new Error('expected deny');
          },
          (err) => {
            expect(err.code).to.equal('EROLEGATE_DENY');
            expect(debtCalled).to.equal(false);
          }
        );
    });
  });

  describe('unknown capability fail-closed', () => {
    it('denies ids outside §3 table', () => {
      const { parent1 } = seedFamily();
      expect(
        decide({ actor: parent1, capabilityId: 'advance.issue' }).reason
      ).to.equal('unknown_capability');
    });
  });
});
