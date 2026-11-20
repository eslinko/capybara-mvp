'use strict';

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

const {
  MembershipStore,
  buildActorContext,
} = require('../../packages/core/src/membership');
const {
  CAPABILITIES,
  ALLOW_BY_ROLE,
  decideWithCatalogAlias,
  resolveCatalogAlias,
} = require('../../packages/core/src/roleGate');

const CORE_SRC = path.join(__dirname, '../../packages/core/src');

function seedFamily() {
  const store = new MembershipStore();
  store.createFamily({ id: 'fam-cat03' });
  const p1 = store.addMembership({
    id: 'm-p1',
    familyId: 'fam-cat03',
    role: 'parent',
    address: '0xParentOne000000000000000000000000000001',
    userId: 'user-p1',
  });
  const c1 = store.addMembership({
    id: 'm-c1',
    familyId: 'fam-cat03',
    role: 'child',
    address: '0xChildOne0000000000000000000000000000001',
    userId: 'user-c1',
  });
  return {
    parent1: buildActorContext(p1),
    child1: buildActorContext(c1),
  };
}

describe('roleGate / alias role cases + coexistence (CAT-03)', () => {
  describe('harness invite / advance / debt / history / payout (t01–t05)', () => {
    it('child + family.invite_member → deny via alias → members_settings', () => {
      const { child1 } = seedFamily();
      const out = decideWithCatalogAlias({
        actor: child1,
        capabilityId: 'family.invite_member',
      });
      expect(out.alias.kind).to.equal('mapped');
      expect(out.alias.coarseId).to.equal(CAPABILITIES.FAMILY_MEMBERS_SETTINGS);
      expect(ALLOW_BY_ROLE[CAPABILITIES.FAMILY_MEMBERS_SETTINGS].child).to.equal(
        false,
      );
      expect(out.outcome).to.equal('deny');
      expect(out.reason).to.equal('role_denied');
    });

    it('child + advance.create / advance.* → unmapped deny', () => {
      const { child1 } = seedFamily();
      const create = decideWithCatalogAlias({
        actor: child1,
        capabilityId: 'advance.create',
      });
      expect(create.alias.kind).to.equal('unmapped');
      expect(create.outcome).to.equal('deny');
      expect(create.reason).to.equal('unmapped_capability');

      const any = decideWithCatalogAlias({
        actor: child1,
        capabilityId: 'advance.issue',
      });
      expect(any.reason).to.equal('unmapped_capability');
    });

    it('child + debt.repay → allow on coarse debt (AC-C03 role only)', () => {
      const { child1 } = seedFamily();
      const out = decideWithCatalogAlias({
        actor: child1,
        capabilityId: 'debt.repay',
      });
      expect(out.alias.kind).to.equal('mapped');
      expect(out.alias.coarseId).to.equal(CAPABILITIES.DEBT);
      expect(out.outcome).to.equal('allow');
      expect(out.reason).to.equal('ok');
      // balance / subject rules = REQ-01 OOS — role surface only
    });

    it('child + history.self → allow on family.journal (AC-C04 role only)', () => {
      const { child1 } = seedFamily();
      const out = decideWithCatalogAlias({
        actor: child1,
        capabilityId: 'history.self',
      });
      expect(out.alias.kind).to.equal('mapped');
      expect(out.alias.coarseId).to.equal(CAPABILITIES.FAMILY_JOURNAL);
      expect(out.outcome).to.equal('allow');
      expect(out.reason).to.equal('ok');
    });

    it('parent + pool.payout_out → coarse payout allow', () => {
      const { parent1 } = seedFamily();
      const out = decideWithCatalogAlias({
        actor: parent1,
        capabilityId: 'pool.payout_out',
      });
      expect(out.alias.kind).to.equal('mapped');
      expect(out.alias.coarseId).to.equal(CAPABILITIES.PAYOUT_FIXED_EDU_DAILY);
      expect(out.outcome).to.equal('allow');
      expect(out.reason).to.equal('ok');
    });
  });

  describe('honesty residual AC-C02 (t06) — incomplete fine child-deny', () => {
    it('documents residual: child + debt.create still allow under coarse debt', () => {
      const { child1 } = seedFamily();
      // Fine id debt.create aliases to debt; ALLOW_BY_ROLE[debt].child === true
      // → alias alone does NOT enforce fine child-deny. No selective expand.
      expect(ALLOW_BY_ROLE[CAPABILITIES.DEBT].child).to.equal(true);
      const out = decideWithCatalogAlias({
        actor: child1,
        capabilityId: 'debt.create',
      });
      expect(out.alias.coarseId).to.equal(CAPABILITIES.DEBT);
      expect(out.outcome).to.equal('allow');
      expect(out.reason).to.equal('ok');
      // Honesty: full AC-C02 Done must NOT be claimed from this residual surface.
    });

    it('documents residual: child + pool.payout_out allow under child-true payout coarse', () => {
      const { child1 } = seedFamily();
      expect(ALLOW_BY_ROLE[CAPABILITIES.PAYOUT_FIXED_EDU_DAILY].child).to.equal(
        true,
      );
      const out = decideWithCatalogAlias({
        actor: child1,
        capabilityId: 'pool.payout_out',
      });
      expect(out.alias.coarseId).to.equal(CAPABILITIES.PAYOUT_FIXED_EDU_DAILY);
      expect(out.outcome).to.equal('allow');
      // Incomplete fine child-deny for pool-out under coarse-only — residual locked.
    });
  });

  describe('coexistence callers (t07)', () => {
    it('createInvite stays on FAMILY_MEMBERS_SETTINGS (no mandatory rename)', () => {
      const src = fs.readFileSync(
        path.join(CORE_SRC, 'invite/createInvite.js'),
        'utf8',
      );
      expect(src).to.match(/runWithRoleGate/);
      expect(src).to.match(
        /capabilityId:\s*CAPABILITIES\.FAMILY_MEMBERS_SETTINGS/,
      );
      // Gate call uses coarse id — not §3 invite_member as capabilityId.
      expect(src).to.not.match(
        /capabilityId:\s*['"]family\.invite_member['"]/,
      );
    });

    it('actions index keeps coarse runWithRoleGate callers', () => {
      const src = fs.readFileSync(path.join(CORE_SRC, 'actions/index.js'), 'utf8');
      expect(src).to.match(/runWithRoleGate/);
      expect(src).to.match(/CAPABILITIES\.PAYOUT_FIXED_EDU_DAILY/);
      expect(src).to.match(/CAPABILITIES\.DEBT/);
    });
  });

  describe('verify surfaces note (t08)', () => {
    it('unit path = decideWithCatalogAlias; same in-process RoleGate as CLI/actions', () => {
      const { parent1 } = seedFamily();
      // Unit harness exercises the same CatalogAlias → decide bind as production helper.
      const alias = resolveCatalogAlias('family.invite_member');
      expect(alias.kind).to.equal('mapped');
      const out = decideWithCatalogAlias({
        actor: parent1,
        capabilityId: 'family.invite_member',
      });
      expect(out.outcome).to.equal('allow');
      // Packaging / MCP edge = N/A for this story (arch-03 verify surfaces).
      expect(typeof decideWithCatalogAlias).to.equal('function');
    });
  });
});
