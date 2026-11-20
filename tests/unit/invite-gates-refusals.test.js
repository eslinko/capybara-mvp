'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const { MembershipStore } = require('../../packages/core/src/membership');
const { CAPABILITIES } = require('../../packages/core/src/roleGate');
const {
  BearerSessionStore,
  issueBearerSession,
} = require('../../packages/core/src/auth');
const {
  InviteStore,
  createInvite,
  assertInviteeNoFamilyCaps,
  INVITE_CLI_RESIDUAL_NOTE,
} = require('../../packages/core/src/invite');

const FIXTURE_CONFIG = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'test-service-role-key',
  bearerSecret: 'test-bearer-signing-secret',
};

const PARENT_ADDR = '0xParentRefuse000000000000000000000000001';
const CHILD_ADDR = '0xChildRefuse0000000000000000000000000001';
const INVITEE = '0xInviteeRefuse0000000000000000000000001';
const FAMILY_ID = 'fam-refuse';

function seedBootstrapped(opts = {}) {
  const bootstrapped = opts.bootstrapped !== false;
  const store = new MembershipStore();
  store.createFamily({ id: FAMILY_ID });
  if (bootstrapped) store.markBootstrapped(FAMILY_ID);
  const parent = store.addMembership({
    id: 'm-parent-refuse',
    familyId: FAMILY_ID,
    role: 'parent',
    address: PARENT_ADDR,
  });
  return { store, parent };
}

function issueSession(membershipStore, member, userId, nowMs = 1_700_000_000_000) {
  const sessions = new BearerSessionStore();
  const session = issueBearerSession(
    sessions,
    { userId, address: member.address },
    FIXTURE_CONFIG,
    { nowMs, ttlMs: 120_000 },
  );
  return {
    dualInput: {
      bearer: session.token,
      sessionStore: sessions,
      config: FIXTURE_CONFIG,
      membershipStore,
      familyId: FAMILY_ID,
      membershipId: member.id,
      nowMs,
    },
  };
}

describe('invite / gates and refusals (INV-03)', () => {
  describe('refusal matrix (t01–t04, t06)', () => {
    it('non-parent → deny createInvite (AC-M01)', () => {
      const { store } = seedBootstrapped();
      const child = store.addMembership({
        id: 'm-child-refuse',
        familyId: FAMILY_ID,
        role: 'child',
        address: CHILD_ADDR,
      });
      const invites = new InviteStore();
      const { dualInput } = issueSession(store, child, 'uid-child');

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput,
          to: INVITEE,
          role: 'child',
          familyId: FAMILY_ID,
        }),
      )
        .to.throw(/parent_required|RoleGate deny/)
        .and.satisfy((e) => e.code === 'EROLEGATE_DENY');
      expect(invites.listByFamily(FAMILY_ID)).to.have.length(0);
    });

    it('missing DualAuth → deny createInvite (AC-M01)', () => {
      const { store } = seedBootstrapped();
      const invites = new InviteStore();
      const sessions = new BearerSessionStore();

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput: {
            bearer: null,
            sessionStore: sessions,
            config: FIXTURE_CONFIG,
            membershipStore: store,
            familyId: FAMILY_ID,
          },
          to: INVITEE,
          role: 'child',
          familyId: FAMILY_ID,
        }),
      )
        .to.throw(/DualAuthGate deny/)
        .and.satisfy((e) => e.code === 'EAUTH_DUAL_DENY');
    });

    it('address role conflict → deny (FR-M03)', () => {
      const { store, parent } = seedBootstrapped();
      store.addMembership({
        id: 'm-existing-child',
        familyId: FAMILY_ID,
        role: 'child',
        address: INVITEE,
      });
      const invites = new InviteStore();
      const { dualInput } = issueSession(store, parent, 'uid-parent');

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput,
          to: INVITEE,
          role: 'parent',
          familyId: FAMILY_ID,
        }),
      )
        .to.throw(/conflict|already/i)
        .and.satisfy((e) => e.code === 'EINVITE_ADDRESS_ROLE_CONFLICT');
    });

    it('duplicate open invite same to+family → deny (FR-M03)', () => {
      const { store, parent } = seedBootstrapped();
      const invites = new InviteStore();
      const { dualInput } = issueSession(store, parent, 'uid-parent');

      createInvite({
        inviteStore: invites,
        membershipStore: store,
        dualInput,
        to: INVITEE,
        role: 'child',
        familyId: FAMILY_ID,
        inviteId: 'inv-first-refuse',
      });

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput,
          to: INVITEE,
          role: 'child',
          familyId: FAMILY_ID,
          inviteId: 'inv-dup-refuse',
        }),
      )
        .to.throw(/Open invite/)
        .and.satisfy((e) => e.code === 'EINVITE_OPEN_CONFLICT');
    });

    it('open Invite → family capability deny for to (AC-M06)', () => {
      const { store, parent } = seedBootstrapped();
      const invites = new InviteStore();
      const { dualInput } = issueSession(store, parent, 'uid-parent');
      createInvite({
        inviteStore: invites,
        membershipStore: store,
        dualInput,
        to: INVITEE,
        role: 'child',
        familyId: FAMILY_ID,
        inviteId: 'inv-open-caps',
      });

      expect(
        store.listMembershipsByAddress(INVITEE).filter((m) => m.familyId === FAMILY_ID),
      ).to.have.length(0);

      const denied = assertInviteeNoFamilyCaps({
        membershipStore: store,
        toAddress: INVITEE,
        familyId: FAMILY_ID,
        capabilityId: CAPABILITIES.FAMILY_JOURNAL,
      });
      expect(denied.outcome).to.equal('deny');
      expect(denied.code).to.equal('EINVITE_PRE_ACCEPT_NO_CAPS');
    });

    it('cannot change Invite.role after create (AC-M07)', () => {
      const invites = new InviteStore();
      invites.addInvite({
        id: 'inv-immutable',
        from: PARENT_ADDR,
        to: INVITEE,
        role: 'child',
        familyId: FAMILY_ID,
      });
      expect(() => invites.changeRole())
        .to.throw(/frozen|immutable/i)
        .and.satisfy((e) => e.code === 'EINVITE_ROLE_IMMUTABLE');
      expect(() => invites.setRole())
        .to.throw()
        .and.satisfy((e) => e.code === 'EINVITE_ROLE_IMMUTABLE');
      expect(invites.getInvite('inv-immutable').role).to.equal('child');

      const { store } = seedBootstrapped();
      expect(() => store.changeRole())
        .to.throw(/not supported|immutable/i)
        .and.satisfy((e) => e.code === 'EMEMBERSHIP_ROLE_IMMUTABLE');
      expect(() => store.setRole())
        .to.throw()
        .and.satisfy((e) => e.code === 'EMEMBERSHIP_ROLE_IMMUTABLE');
    });

    it('post-bootstrap required for createInvite (AC-M05)', () => {
      const { store, parent } = seedBootstrapped({ bootstrapped: false });
      const invites = new InviteStore();
      const { dualInput } = issueSession(store, parent, 'uid-parent');

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput,
          to: INVITEE,
          role: 'child',
          familyId: FAMILY_ID,
        }),
      )
        .to.throw(/bootstrapped/i)
        .and.satisfy((e) => e.code === 'EINVITE_NOT_BOOTSTRAPPED');
    });
  });

  describe('CLI residual note (t05)', () => {
    it('exports INVITE_CLI_RESIDUAL_NOTE and documents coexistence in index', () => {
      expect(INVITE_CLI_RESIDUAL_NOTE).to.match(/modules under test/i);
      expect(INVITE_CLI_RESIDUAL_NOTE).to.match(/CLI/i);
      expect(INVITE_CLI_RESIDUAL_NOTE).to.match(/addMembership/i);

      const indexSrc = fs.readFileSync(
        path.join(__dirname, '../../packages/core/src/invite/index.js'),
        'utf8',
      );
      expect(indexSrc).to.match(/CLI residual/i);
      expect(indexSrc).to.match(/do \*\*not\*\* claim CLI invite Done/i);
    });
  });
});
