'use strict';

const { expect } = require('chai');

const {
  CAPABILITIES,
  isKnownCapability,
  decide,
  resolveCatalogAlias,
  resolveCoarseCapabilityId,
  CATALOG_ALIAS_SEED,
  CATALOG_DENY_ALWAYS,
} = require('../../packages/core/src/roleGate');

describe('roleGate / CatalogAlias seed map (CAT-01)', () => {
  describe('resolve API (t01)', () => {
    it('empty / non-string → unmapped fail-closed', () => {
      expect(resolveCatalogAlias(null).kind).to.equal('unmapped');
      expect(resolveCatalogAlias('').kind).to.equal('unmapped');
      expect(resolveCatalogAlias('   ').kind).to.equal('unmapped');
      expect(resolveCoarseCapabilityId(undefined)).to.equal(null);
    });
  });

  describe('seed map + family / pool / debt bridges (t02–t06) — AC-C01', () => {
    it('family.invite_member / family.settings → family.members_settings', () => {
      const invite = resolveCatalogAlias('family.invite_member');
      expect(invite.kind).to.equal('mapped');
      expect(invite.coarseId).to.equal(CAPABILITIES.FAMILY_MEMBERS_SETTINGS);
      expect(isKnownCapability(invite.coarseId)).to.equal(true);

      const settings = resolveCatalogAlias('family.settings');
      expect(settings.kind).to.equal('mapped');
      expect(settings.coarseId).to.equal(CAPABILITIES.FAMILY_MEMBERS_SETTINGS);
    });

    it('pool / charge / transfer / academic bridges', () => {
      expect(resolveCatalogAlias('pool.view').coarseId).to.equal(
        CAPABILITIES.POOL_BALANCE,
      );
      expect(resolveCatalogAlias('pool.payout_out').coarseId).to.equal(
        CAPABILITIES.PAYOUT_FIXED_EDU_DAILY,
      );
      expect(resolveCatalogAlias('charge.single').coarseId).to.equal(
        CAPABILITIES.MULTI_CHILD_DEBIT,
      );
      expect(resolveCatalogAlias('charge.group').coarseId).to.equal(
        CAPABILITIES.MULTI_CHILD_DEBIT,
      );
      expect(resolveCatalogAlias('transfer.child_to_pool').coarseId).to.equal(
        CAPABILITIES.CAPY_RETURN_TO_PARENT,
      );
      expect(resolveCatalogAlias('academic.record').coarseId).to.equal(
        CAPABILITIES.EDUCATION_RECORDS,
      );
    });

    it('debt / cashout / history bridges', () => {
      for (const id of [
        'debt.create',
        'debt.forgive',
        'debt.fine',
        'debt.limits',
        'debt.repay',
        'debt.view',
      ]) {
        expect(resolveCatalogAlias(id).coarseId).to.equal(CAPABILITIES.DEBT);
      }
      expect(resolveCatalogAlias('debt.sanction').coarseId).to.equal(
        CAPABILITIES.SANCTIONS,
      );
      expect(resolveCatalogAlias('cashout.create').coarseId).to.equal(
        CAPABILITIES.CASHOUT_REQUEST,
      );
      expect(resolveCatalogAlias('history.family').coarseId).to.equal(
        CAPABILITIES.FAMILY_JOURNAL,
      );
      expect(resolveCatalogAlias('history.self').coarseId).to.equal(
        CAPABILITIES.FAMILY_JOURNAL,
      );
    });
  });

  describe('passthrough + unmapped + non-aliased (t03/t07)', () => {
    it('coarse ids passthrough unchanged', () => {
      const profile = resolveCatalogAlias(CAPABILITIES.PROFILE_SELF);
      expect(profile.kind).to.be.oneOf(['passthrough', 'mapped']);
      expect(profile.coarseId).to.equal(CAPABILITIES.PROFILE_SELF);

      const debt = resolveCatalogAlias(CAPABILITIES.DEBT);
      expect(debt.kind).to.equal('passthrough');
      expect(debt.coarseId).to.equal(CAPABILITIES.DEBT);

      const journal = resolveCatalogAlias(CAPABILITIES.FAMILY_JOURNAL);
      expect(journal.kind).to.equal('passthrough');
      expect(journal.coarseId).to.equal(CAPABILITIES.FAMILY_JOURNAL);
    });

    it('unmapped family.overview / advance.* → deny fail-closed', () => {
      expect(resolveCatalogAlias('family.overview').kind).to.equal('unmapped');
      expect(resolveCoarseCapabilityId('family.overview')).to.equal(null);
      expect(resolveCatalogAlias('advance.create').kind).to.equal('unmapped');
      expect(resolveCatalogAlias('advance.settle').kind).to.equal('unmapped');

      const decision = decide({
        actor: {
          membershipId: 'm1',
          role: 'parent',
          address: '0xabc',
          familyId: 'f1',
        },
        capabilityId: 'family.overview',
      });
      expect(decision.outcome).to.equal('deny');
      expect(decision.reason).to.equal('unknown_capability');
    });

    it('bootstrap.pool_and_founder not aliased into RoleGate', () => {
      const r = resolveCatalogAlias('bootstrap.pool_and_founder');
      expect(r.kind).to.equal('non-aliased');
      expect(resolveCoarseCapabilityId('bootstrap.pool_and_founder')).to.equal(
        null,
      );
    });

    it('token.mint / token.deploy → deny-always kind (CAT-02 wire reserved)', () => {
      expect(CATALOG_DENY_ALWAYS.has('token.mint')).to.equal(true);
      expect(resolveCatalogAlias('token.mint').kind).to.equal('deny-always');
      expect(resolveCatalogAlias('token.deploy').kind).to.equal('deny-always');
      expect(resolveCoarseCapabilityId('token.mint')).to.equal(null);
    });
  });

  describe('AC-C06 successor path (t08)', () => {
    it('exports CATALOG_ALIAS_SEED as documented successor (not chat text)', () => {
      expect(CATALOG_ALIAS_SEED).to.be.an('object');
      expect(CATALOG_ALIAS_SEED['family.invite_member']).to.equal(
        CAPABILITIES.FAMILY_MEMBERS_SETTINGS,
      );
      expect(Object.keys(CATALOG_ALIAS_SEED).length).to.be.greaterThan(10);
    });
  });
});
