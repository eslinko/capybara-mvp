'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const {
  MembershipStore,
  buildActorContext,
} = require('../../packages/core/src/membership');
const { CAPABILITIES } = require('../../packages/core/src/roleGate');
const {
  BearerSessionStore,
  issueBearerSession,
  dualAuthGate,
  decideDualAuth,
  runWithDualAuthThenRoleGate,
  resolveMembershipForSession,
} = require('../../packages/core/src/auth');

const FIXTURE_CONFIG = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'test-service-role-key',
  bearerSecret: 'test-bearer-signing-secret',
};

function seedFamily() {
  const store = new MembershipStore();
  store.createFamily({ id: 'fam-a' });
  const parent = store.addMembership({
    id: 'm-p1',
    familyId: 'fam-a',
    role: 'parent',
    address: '0xparentone000000000000000000000000000001',
  });
  const child = store.addMembership({
    id: 'm-c1',
    familyId: 'fam-a',
    role: 'child',
    address: '0xchildone0000000000000000000000000000001',
    userId: 'user-child-1',
  });
  return { store, parent, child, family: store.listMembershipsByFamily('fam-a') };
}

function issueSessionFor(link, nowMs = 1_700_000_000_000) {
  const sessions = new BearerSessionStore();
  const session = issueBearerSession(sessions, link, FIXTURE_CONFIG, {
    nowMs,
    ttlMs: 120_000,
  });
  return { sessions, session, nowMs };
}

describe('auth / DualAuthGate before RoleGate (AUTH-03)', () => {
  describe('resolve + bind membership.userId (t03)', () => {
    it('binds userId onto membership found by address', async () => {
      const { store, parent } = seedFamily();
      expect(parent.userId).to.equal(undefined);
      const linked = await resolveMembershipForSession({
        membershipStore: store,
        userId: 'supabase-uid-parent',
        address: parent.address,
        familyId: 'fam-a',
      });
      expect(linked.userId).to.equal('supabase-uid-parent');
      expect(store.getMembership(parent.id).userId).to.equal('supabase-uid-parent');
      expect(store.listMembershipsByUserId('supabase-uid-parent')).to.have.length(1);
    });
  });

  describe('DualAuthGate API fail-closed (t01)', () => {
    it('denies missing / invalid bearer (AC-A01)', async () => {
      const { store } = seedFamily();
      const sessions = new BearerSessionStore();
      const missing = await decideDualAuth({
        bearer: null,
        sessionStore: sessions,
        config: FIXTURE_CONFIG,
        membershipStore: store,
      });
      expect(missing.outcome).to.equal('deny');
      expect(missing.reason).to.match(/MISSING|INVALID/i);

            let _err;
      try {
        await dualAuthGate({
          bearer: 'not-a-token',
          sessionStore: sessions,
          config: FIXTURE_CONFIG,
          membershipStore: store,
        });
      } catch (e) { _err = e; }
      expect(_err).to.exist;
      expect(String(_err && _err.message || _err)).to.match(/DualAuthGate deny/);
      expect(_err).to.satisfy((e) => e.code === 'EAUTH_DUAL_DENY');

    });
  });

  describe('ActorContext after allow (t04) + harness (t05)', () => {
    it('allow path builds ActorContext with userId; role from membership only (AC-A03)', async () => {
      const { store, parent, family } = seedFamily();
      const { sessions, session, nowMs } = issueSessionFor({
        userId: 'supabase-uid-parent',
        address: parent.address,
      });

      let sideEffect = 0;
      const result = await runWithDualAuthThenRoleGate(
        {
          bearer: session.token,
          sessionStore: sessions,
          config: FIXTURE_CONFIG,
          membershipStore: store,
          familyId: 'fam-a',
          nowMs,
          clientClaimedRole: 'child', // must be ignored
        },
        {
          capabilityId: CAPABILITIES.POOL_BALANCE,
          familyMemberships: family,
          clientClaimedRole: 'child',
          actor: buildActorContext({
            ...parent,
            role: 'child',
            userId: 'spoof',
          }),
        },
        () => {
          sideEffect += 1;
          return 'ok-pool';
        },
      );

      expect(result).to.equal('ok-pool');
      expect(sideEffect).to.equal(1);

      const allowed = await dualAuthGate({
        bearer: session.token,
        sessionStore: sessions,
        config: FIXTURE_CONFIG,
        membershipStore: store,
        familyId: 'fam-a',
        nowMs,
        clientClaimedRole: 'child',
      });
      expect(allowed.actor.role).to.equal('parent');
      expect(allowed.actor.userId).to.equal('supabase-uid-parent');
      expect(allowed.userId).to.equal('supabase-uid-parent');
    });

    it('denies gated capability without dual-auth (AC-A01 harness)', async () => {
      const { store, family } = seedFamily();
      const sessions = new BearerSessionStore();
      let sideEffect = 0;
      let _err;
      try {
        await runWithDualAuthThenRoleGate(
          {
            bearer: '',
            sessionStore: sessions,
            config: FIXTURE_CONFIG,
            membershipStore: store,
          },
          {
            capabilityId: CAPABILITIES.POOL_BALANCE,
            familyMemberships: family,
          },
          () => {
            sideEffect += 1;
            return 'should-not-run';
          },
        );
      } catch (e) {
        _err = e;
      }
      expect(_err).to.exist;
      expect(String(_err && _err.message || _err)).to.match(/DualAuthGate deny/);
      expect(_err).to.satisfy((e) => e.code === 'EAUTH_DUAL_DENY');
      expect(sideEffect).to.equal(0);
    });

    it('child membership cannot use parent-only capability after dual-auth allow', async () => {
      const { store, child, family } = seedFamily();
      const { sessions, session, nowMs } = issueSessionFor({
        userId: 'user-child-1',
        address: child.address,
      });
      let _err;
      try {
        await runWithDualAuthThenRoleGate(
          {
            bearer: session.token,
            sessionStore: sessions,
            config: FIXTURE_CONFIG,
            membershipStore: store,
            familyId: 'fam-a',
            nowMs,
          },
          {
            capabilityId: CAPABILITIES.POOL_BALANCE,
            familyMemberships: family,
          },
          () => 'nope',
        );
      } catch (e) {
        _err = e;
      }
      expect(_err).to.exist;
      expect(String(_err && _err.message || _err)).to.match(/RoleGate deny/);
    });
  });

  describe('RoleGate remains separate (t02) + CLI residual note (t06)', () => {
    it('does not put dual-auth into capabilities.js', async () => {
      const capsPath = path.join(
        __dirname,
        '../../packages/core/src/roleGate/capabilities.js',
      );
      const text = fs.readFileSync(capsPath, 'utf8');
      expect(text).to.not.match(/DualAuth|bearer|supabase/i);
    });

    it('documents CLI residual on DualAuthGate module', async () => {
      const gatePath = path.join(
        __dirname,
        '../../packages/core/src/auth/dualAuthGate.js',
      );
      const text = fs.readFileSync(gatePath, 'utf8');
      expect(text).to.match(/CLI residual/i);
      expect(text).to.match(/do not claim CLI dual-auth Done/i);
    });
  });
});
