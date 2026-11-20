'use strict';

const { expect } = require('chai');

const { MembershipStore } = require('../../packages/core/src/membership');
const {
  BearerSessionStore,
  issueBearerSession,
} = require('../../packages/core/src/auth');
const {
  InviteStore,
  createInvite,
} = require('../../packages/core/src/invite');

const FIXTURE_CONFIG = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'test-service-role-key',
  bearerSecret: 'test-bearer-signing-secret',
};

const PARENT_ADDR = '0xParentOne0000000000000000000000000000001';
const CHILD_INVITEE = '0xChildInvitee000000000000000000000000001';
const COPARENT_INVITEE = '0xCoParentInvitee00000000000000000000002';

function seedBootstrappedFamily(opts = {}) {
  const bootstrapped = opts.bootstrapped !== false;
  const store = new MembershipStore();
  store.createFamily({ id: 'fam-inv' });
  if (bootstrapped) {
    store.markBootstrapped('fam-inv');
  }
  const parent = store.addMembership({
    id: 'm-parent-1',
    familyId: 'fam-inv',
    role: 'parent',
    address: PARENT_ADDR,
  });
  return { store, parent };
}

function issueParentSession(membershipStore, parent, nowMs = 1_700_000_000_000) {
  const sessions = new BearerSessionStore();
  const session = issueBearerSession(
    sessions,
    { userId: 'supabase-uid-parent', address: parent.address },
    FIXTURE_CONFIG,
    { nowMs, ttlMs: 120_000 },
  );
  return {
    dualInput: {
      bearer: session.token,
      sessionStore: sessions,
      config: FIXTURE_CONFIG,
      membershipStore,
      familyId: 'fam-inv',
      membershipId: parent.id,
      nowMs,
    },
    sessions,
    session,
    nowMs,
  };
}

describe('invite / createInvite (INV-01)', () => {
  describe('InviteStore + normalize (t01–t02)', () => {
    it('stores open invite with from/to/role/familyId; normalizes addresses', () => {
      const invites = new InviteStore();
      const row = invites.addInvite({
        id: 'inv-1',
        from: PARENT_ADDR,
        to: CHILD_INVITEE,
        role: 'child',
        familyId: 'fam-inv',
        displayName: 'Kid',
        fromMembershipId: 'm-parent-1',
      });
      expect(row.status).to.equal('open');
      expect(row.from).to.equal(PARENT_ADDR.toLowerCase());
      expect(row.to).to.equal(CHILD_INVITEE.toLowerCase());
      expect(row.role).to.equal('child');
      expect(row.familyId).to.equal('fam-inv');
      expect(row.displayName).to.equal('Kid');
      expect(invites.listOpenByToInFamily('fam-inv', CHILD_INVITEE)).to.have.length(1);
    });

    it('rejects empty to on store add; role mutation API absent (AC-M07)', () => {
      const invites = new InviteStore();
      expect(() =>
        invites.addInvite({
          id: 'inv-empty',
          from: PARENT_ADDR,
          to: '',
          role: 'child',
          familyId: 'fam-inv',
        }),
      )
        .to.throw(/to/)
        .and.satisfy((e) => e.code === 'EINVITE_EMPTY_TO');

      expect(() => invites.changeRole())
        .to.throw(/frozen|immutable/i)
        .and.satisfy((e) => e.code === 'EINVITE_ROLE_IMMUTABLE');
      expect(() => invites.setRole())
        .to.throw()
        .and.satisfy((e) => e.code === 'EINVITE_ROLE_IMMUTABLE');
    });
  });

  describe('createInvite happy paths (t03–t04, t06) — AC-M01/M02/M04', () => {
    it('parent createInvite → Invite with from,to,role,familyId (AC-M01/M02)', () => {
      const { store, parent } = seedBootstrappedFamily();
      const invites = new InviteStore();
      const { dualInput } = issueParentSession(store, parent);

      const invite = createInvite({
        inviteStore: invites,
        membershipStore: store,
        dualInput,
        to: CHILD_INVITEE,
        role: 'child',
        familyId: 'fam-inv',
        inviteId: 'inv-child-1',
        displayName: 'Bastian',
      });

      expect(invite.id).to.equal('inv-child-1');
      expect(invite.from).to.equal(parent.address);
      expect(invite.to).to.equal(CHILD_INVITEE.toLowerCase());
      expect(invite.role).to.equal('child');
      expect(invite.familyId).to.equal('fam-inv');
      expect(invite.status).to.equal('open');
      expect(invite.fromMembershipId).to.equal(parent.id);
      expect(invite.displayName).to.equal('Bastian');
    });

    it('co-parent invite role=parent same path (AC-M04)', () => {
      const { store, parent } = seedBootstrappedFamily();
      const invites = new InviteStore();
      const { dualInput } = issueParentSession(store, parent);

      const invite = createInvite({
        inviteStore: invites,
        membershipStore: store,
        dualInput,
        to: COPARENT_INVITEE,
        role: 'parent',
        familyId: 'fam-inv',
        inviteId: 'inv-coparent-1',
      });

      expect(invite.role).to.equal('parent');
      expect(invite.to).to.equal(COPARENT_INVITEE.toLowerCase());
      expect(invite.from).to.equal(parent.address);
    });
  });

  describe('preconditions + refusals (t04–t05, t06)', () => {
    it('empty to → reject (AC-M02)', () => {
      const { store, parent } = seedBootstrappedFamily();
      const invites = new InviteStore();
      const { dualInput } = issueParentSession(store, parent);

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput,
          to: '   ',
          role: 'child',
          familyId: 'fam-inv',
        }),
      )
        .to.throw(/to/)
        .and.satisfy((e) => e.code === 'EINVITE_EMPTY_TO');
    });

    it('non-bootstrapped family → deny (AC-M05)', () => {
      const { store, parent } = seedBootstrappedFamily({ bootstrapped: false });
      const invites = new InviteStore();
      const { dualInput } = issueParentSession(store, parent);

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput,
          to: CHILD_INVITEE,
          role: 'child',
          familyId: 'fam-inv',
        }),
      )
        .to.throw(/bootstrapped/i)
        .and.satisfy((e) => e.code === 'EINVITE_NOT_BOOTSTRAPPED');
    });

    it('missing DualAuth bearer → DualAuth deny before write', () => {
      const { store } = seedBootstrappedFamily();
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
            familyId: 'fam-inv',
          },
          to: CHILD_INVITEE,
          role: 'child',
          familyId: 'fam-inv',
        }),
      )
        .to.throw(/DualAuthGate deny/)
        .and.satisfy((e) => e.code === 'EAUTH_DUAL_DENY');

      expect(invites.listByFamily('fam-inv')).to.have.length(0);
    });

    it('child actor lacks family.members_settings → RoleGate deny', () => {
      const { store } = seedBootstrappedFamily();
      const child = store.addMembership({
        id: 'm-child-actor',
        familyId: 'fam-inv',
        role: 'child',
        address: '0xChildActor000000000000000000000000000001',
      });
      const invites = new InviteStore();
      const sessions = new BearerSessionStore();
      const nowMs = 1_700_000_000_000;
      const session = issueBearerSession(
        sessions,
        { userId: 'supabase-uid-child', address: child.address },
        FIXTURE_CONFIG,
        { nowMs, ttlMs: 120_000 },
      );

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput: {
            bearer: session.token,
            sessionStore: sessions,
            config: FIXTURE_CONFIG,
            membershipStore: store,
            familyId: 'fam-inv',
            membershipId: child.id,
            nowMs,
          },
          to: CHILD_INVITEE,
          role: 'child',
          familyId: 'fam-inv',
        }),
      )
        .to.throw(/parent_required|RoleGate deny/)
        .and.satisfy((e) => e.code === 'EROLEGATE_DENY');
    });

    it('address already bound to conflicting role → deny (FR-M03)', () => {
      const { store, parent } = seedBootstrappedFamily();
      store.addMembership({
        id: 'm-other-child',
        familyId: 'fam-inv',
        role: 'child',
        address: CHILD_INVITEE,
      });
      const invites = new InviteStore();
      const { dualInput } = issueParentSession(store, parent);

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput,
          to: CHILD_INVITEE,
          role: 'parent',
          familyId: 'fam-inv',
        }),
      )
        .to.throw(/conflict|already/i)
        .and.satisfy((e) => e.code === 'EINVITE_ADDRESS_ROLE_CONFLICT');
    });

    it('open invite conflict for same to/family → deny', () => {
      const { store, parent } = seedBootstrappedFamily();
      const invites = new InviteStore();
      const { dualInput } = issueParentSession(store, parent);

      createInvite({
        inviteStore: invites,
        membershipStore: store,
        dualInput,
        to: CHILD_INVITEE,
        role: 'child',
        familyId: 'fam-inv',
        inviteId: 'inv-first',
      });

      expect(() =>
        createInvite({
          inviteStore: invites,
          membershipStore: store,
          dualInput,
          to: CHILD_INVITEE,
          role: 'child',
          familyId: 'fam-inv',
          inviteId: 'inv-second',
        }),
      )
        .to.throw(/Open invite/)
        .and.satisfy((e) => e.code === 'EINVITE_OPEN_CONFLICT');
    });

    it('Invite role immutable after create (AC-M07)', () => {
      const { store, parent } = seedBootstrappedFamily();
      const invites = new InviteStore();
      const { dualInput } = issueParentSession(store, parent);

      const invite = createInvite({
        inviteStore: invites,
        membershipStore: store,
        dualInput,
        to: CHILD_INVITEE,
        role: 'child',
        familyId: 'fam-inv',
        inviteId: 'inv-frozen',
      });

      expect(invite.role).to.equal('child');
      expect(() => invites.changeRole()).to.throw().and.satisfy((e) => e.code === 'EINVITE_ROLE_IMMUTABLE');
      expect(invites.getInvite('inv-frozen').role).to.equal('child');
    });
  });
});
