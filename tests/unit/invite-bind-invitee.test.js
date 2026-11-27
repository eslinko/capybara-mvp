'use strict';

const { expect } = require('chai');
const { ethers } = require('ethers');

const {
  MembershipStore,
  buildActorContext,
} = require('../../packages/core/src/membership');
const { CAPABILITIES, decide } = require('../../packages/core/src/roleGate');
const {
  ChallengeStore,
  issueChallenge,
  verifyAddressProof,
  createMemorySupabaseAuthDouble,
  BearerSessionStore,
  issueBearerSession,
  dualAuthGate,
  runWithDualAuthThenRoleGate,
} = require('../../packages/core/src/auth');
const {
  InviteStore,
  findOpenInviteByTo,
  bindInviteeAndAccept,
  assertInviteeNoFamilyCaps,
} = require('../../packages/core/src/invite');

const FIXTURE_CONFIG = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseKey: 'test-service-role-key',
  bearerSecret: 'test-bearer-signing-secret',
};

const PARENT_ADDR = '0xParentBind000000000000000000000000000001';
const FAMILY_ID = 'fam-bind';

/**
 * @param {import('ethers').HDNodeWallet} wallet
 * @param {number} nowMs
 */
async function makeProof(wallet, nowMs = 1_700_000_000_000) {
  const store = new ChallengeStore();
  const issued = issueChallenge(store, wallet.address, { nowMs, ttlMs: 120_000 });
  const signature = await wallet.signMessage(issued.message);
  return verifyAddressProof(store, issued.challengeId, signature, { nowMs });
}

function seedFamilyWithOpenInvite(inviteeAddress, role = 'child') {
  const membershipStore = new MembershipStore();
  membershipStore.createFamily({ id: FAMILY_ID });
  membershipStore.markBootstrapped(FAMILY_ID);
  const parent = membershipStore.addMembership({
    id: 'm-parent-bind',
    familyId: FAMILY_ID,
    role: 'parent',
    address: PARENT_ADDR,
    userId: 'supabase-uid-parent',
  });
  const inviteStore = new InviteStore();
  const invite = inviteStore.addInvite({
    id: 'inv-open-1',
    from: parent.address,
    to: inviteeAddress,
    role,
    familyId: FAMILY_ID,
    fromMembershipId: parent.id,
  });
  return { membershipStore, inviteStore, parent, invite };
}

describe('invite / bind invitee (INV-02)', () => {
  describe('findOpenInviteByTo (t01)', () => {
    it('finds open Invite by to address', async () => {
      const invitee = '0xInviteeLookup0000000000000000000000001';
      const { inviteStore, invite } = seedFamilyWithOpenInvite(invitee);
      const found = await findOpenInviteByTo(inviteStore, invitee);
      expect(found).to.not.equal(null);
      expect(found.id).to.equal(invite.id);
      expect(found.to).to.equal(invitee.toLowerCase());
      expect(found.status).to.equal('open');
    });

    it('returns null for wrong address; familyId disambiguates', async () => {
      const invitee = '0xInviteeLookup0000000000000000000000002';
      const { inviteStore } = seedFamilyWithOpenInvite(invitee);
      expect(await findOpenInviteByTo(inviteStore, '0xDeadBeef000000000000000000000000000001')).to.equal(
        null,
      );
      expect(
        (await findOpenInviteByTo(inviteStore, invitee, FAMILY_ID)).familyId,
      ).to.equal(FAMILY_ID);
      expect(await findOpenInviteByTo(inviteStore, invitee, 'other-fam')).to.equal(null);
    });
  });

  describe('pre-accept deny family caps (t04) — AC-M06', () => {
    it('before accept, invitee cannot pass family capability path', async () => {
      const invitee = '0xInviteePreAccept0000000000000000000001';
      const { membershipStore, inviteStore } = seedFamilyWithOpenInvite(invitee);

      expect(await findOpenInviteByTo(inviteStore, invitee)).to.not.equal(null);
      expect(
        membershipStore.listMembershipsByAddress(invitee).filter((m) => m.familyId === FAMILY_ID),
      ).to.have.length(0);

      const denied = await assertInviteeNoFamilyCaps({
        membershipStore,
        toAddress: invitee,
        familyId: FAMILY_ID,
        capabilityId: CAPABILITIES.FAMILY_JOURNAL,
      });
      expect(denied.outcome).to.equal('deny');
      expect(denied.code).to.equal('EINVITE_PRE_ACCEPT_NO_CAPS');

      // Also: no DualAuth membership → DualAuthGate deny
      const sessions = new BearerSessionStore();
            let _err;
      try {
        await dualAuthGate({
          bearer: null,
          sessionStore: sessions,
          config: FIXTURE_CONFIG,
          membershipStore,
          familyId: FAMILY_ID,
        });
      } catch (e) { _err = e; }
      expect(_err).to.exist;
      expect(String(_err && _err.message || _err)).to.match(/DualAuthGate deny/);

    });
  });

  describe('bind → Membership + ActorContext (t02/t03/t05/t06) — AC-M03', () => {
    it('dual-auth on Invite.to → Membership with Invite.role; ActorContext userId', async () => {
      const wallet = ethers.Wallet.createRandom();
      const { membershipStore, inviteStore, invite } = seedFamilyWithOpenInvite(
        wallet.address,
        'child',
      );
      const proof = await makeProof(wallet);
      const authPort = createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'supabase-uid-invitee',
      });

      const result = await bindInviteeAndAccept({
        inviteStore,
        membershipStore,
        proof,
        authPort,
        config: FIXTURE_CONFIG,
        familyId: FAMILY_ID,
        membershipId: 'm-invitee-1',
        clientClaimedRole: 'parent', // must be ignored
      });

      expect(result.membership.role).to.equal('child');
      expect(result.membership.role).to.equal(invite.role);
      expect(result.membership.address).to.equal(wallet.address.toLowerCase());
      expect(result.membership.userId).to.equal('supabase-uid-invitee');
      expect(result.invite.status).to.equal('accepted');
      expect(result.actor.userId).to.equal('supabase-uid-invitee');
      expect(result.actor.role).to.equal('child');
      expect(await findOpenInviteByTo(inviteStore, wallet.address)).to.equal(null);

      const actor = buildActorContext(result.membership);
      expect(actor.userId).to.equal('supabase-uid-invitee');
      expect(actor.role).to.equal('child');
    });

    it('co-parent invite role=parent activates parent membership', async () => {
      const wallet = ethers.Wallet.createRandom();
      const { membershipStore, inviteStore } = seedFamilyWithOpenInvite(
        wallet.address,
        'parent',
      );
      const proof = await makeProof(wallet);
      const authPort = createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'supabase-uid-coparent',
      });

      const result = await bindInviteeAndAccept({
        inviteStore,
        membershipStore,
        proof,
        authPort,
        config: FIXTURE_CONFIG,
        familyId: FAMILY_ID,
      });

      expect(result.membership.role).to.equal('parent');
      expect(result.actor.role).to.equal('parent');
    });

    it('wrong signer address → no match / proof mismatch', async () => {
      const invited = ethers.Wallet.createRandom();
      const wrong = ethers.Wallet.createRandom();
      const { membershipStore, inviteStore } = seedFamilyWithOpenInvite(
        invited.address,
      );
      const wrongProof = await makeProof(wrong);
      const authPort = createMemorySupabaseAuthDouble();

      try {
        await bindInviteeAndAccept({
          inviteStore,
          membershipStore,
          proof: wrongProof,
          authPort,
          config: FIXTURE_CONFIG,
          familyId: FAMILY_ID,
          inviteId: 'inv-open-1',
        });
        expect.fail('should throw');
      } catch (e) {
        expect(e.code).to.equal('EINVITE_PROOF_MISMATCH');
      }
      expect(inviteStore.getInvite('inv-open-1').status).to.equal('open');
    });

    it('after accept, DualAuth + RoleGate allow family capability for invitee', async () => {
      const wallet = ethers.Wallet.createRandom();
      const { membershipStore, inviteStore } = seedFamilyWithOpenInvite(
        wallet.address,
        'child',
      );
      const proof = await makeProof(wallet);
      const authPort = createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'supabase-uid-after',
      });

      const { membership } = await bindInviteeAndAccept({
        inviteStore,
        membershipStore,
        proof,
        authPort,
        config: FIXTURE_CONFIG,
        familyId: FAMILY_ID,
        membershipId: 'm-after-1',
      });

      const sessions = new BearerSessionStore();
      const nowMs = 1_700_000_000_000;
      const session = issueBearerSession(
        sessions,
        { userId: membership.userId, address: membership.address },
        FIXTURE_CONFIG,
        { nowMs, ttlMs: 120_000 },
      );

      let ran = false;
      await runWithDualAuthThenRoleGate(
        {
          bearer: session.token,
          sessionStore: sessions,
          config: FIXTURE_CONFIG,
          membershipStore,
          familyId: FAMILY_ID,
          membershipId: membership.id,
          nowMs,
        },
        {
          capabilityId: CAPABILITIES.PROFILE_SELF,
          familyMemberships: membershipStore.listMembershipsByFamily(FAMILY_ID),
        },
        () => {
          ran = true;
        },
      );
      expect(ran).to.equal(true);

      const gate = decide({
        actor: buildActorContext(membership),
        capabilityId: CAPABILITIES.PROFILE_SELF,
        familyMemberships: membershipStore.listMembershipsByFamily(FAMILY_ID),
      });
      expect(gate.outcome).to.equal('allow');
    });
  });
});
