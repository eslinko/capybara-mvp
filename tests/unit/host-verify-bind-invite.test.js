'use strict';

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { createHostServer } = require('../../host/server');
const { createAuthRuntime } = require('../../host/authHttp');
const { MembershipStore } = require('../../packages/core/src/membership');
const { InviteStore } = require('../../packages/core/src/invite');
const {
  createMemorySupabaseAuthDouble,
  issueChallenge,
} = require('../../packages/core/src/auth');
const { CAPABILITIES, decide } = require('../../packages/core/src/roleGate');
const { buildActorContext } = require('../../packages/core/src/membership');
const {
  assertInviteeNoFamilyCaps,
} = require('../../packages/core/src/invite');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-signing-secret',
};

const PARENT_ADDR = '0xparentverifybind000000000000000000000001';
const FAMILY_ID = 'fam-verify-bind';
const NOW = 1_700_000_000_000;

/**
 * @param {import('http').Server} server
 * @param {{ method?: string, path: string, headers?: Record<string, string>, body?: object }} opts
 */
function requestJson(server, opts) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = opts.body ? JSON.stringify(opts.body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: opts.path,
        method: opts.method || 'GET',
        headers: {
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
          ...(opts.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, raw: data, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function seedBootstrappedFamily() {
  const membershipStore = new MembershipStore();
  const inviteStore = new InviteStore();
  membershipStore.createFamily({ id: FAMILY_ID });
  membershipStore.markBootstrapped(FAMILY_ID);
  const parent = membershipStore.addMembership({
    id: 'm-parent-verify-bind',
    familyId: FAMILY_ID,
    role: 'parent',
    address: PARENT_ADDR,
    userId: 'uid-parent-verify-bind',
  });
  return { membershipStore, inviteStore, parent };
}

/**
 * @param {import('ethers').HDNodeWallet} wallet
 * @param {ReturnType<typeof createAuthRuntime>} runtime
 */
async function challengeAndSign(wallet, runtime) {
  const issued = issueChallenge(runtime.challenges, wallet.address, {
    nowMs: NOW,
    ttlMs: 120_000,
  });
  const signature = await wallet.signMessage(issued.message);
  return { challengeId: issued.challengeId, signature };
}

describe('host verify bind invite (INV-05 / G4)', () => {
  it('AC-G4-01: open invite + verify → Membership Invite.role + Auth userId + invite accepted', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { membershipStore, inviteStore, parent } = seedBootstrappedFamily();
    inviteStore.addInvite({
      id: 'inv-child-1',
      from: parent.address,
      to: wallet.address,
      role: 'child',
      familyId: FAMILY_ID,
      fromMembershipId: parent.id,
    });
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      nowMs: NOW,
      membershipStore,
      inviteStore,
      authPort: createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'uid-invitee-child',
      }),
    });
    const server = createHostServer({ env: FIXTURE_ENV, authRuntime: runtime, nowMs: NOW });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { challengeId, signature } = await challengeAndSign(wallet, runtime);
      const res = await requestJson(server, {
        method: 'POST',
        path: '/auth/verify',
        body: {
          challengeId,
          signature,
          role: 'parent', // client-claimed — must be ignored (AC-G4-05)
          familyId: FAMILY_ID,
        },
      });
      expect(res.status).to.equal(200);
      expect(res.json.ok).to.equal(true);
      expect(res.json.inviteAccepted).to.equal(true);
      expect(res.json.membershipRole).to.equal('child');
      expect(res.json.userId).to.equal('uid-invitee-child');
      expect(res.json.inviteStatus).to.equal('accepted');
      expect(res.json.inviteId).to.equal('inv-child-1');

      const memberships = membershipStore
        .listMembershipsByAddress(wallet.address)
        .filter((m) => m.familyId === FAMILY_ID);
      expect(memberships).to.have.length(1);
      expect(memberships[0].role).to.equal('child');
      expect(memberships[0].userId).to.equal('uid-invitee-child');
      expect(inviteStore.getInvite('inv-child-1').status).to.equal('accepted');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('AC-G4-02: no open invite → Auth-only (no silent membership)', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { membershipStore, inviteStore } = seedBootstrappedFamily();
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      nowMs: NOW,
      membershipStore,
      inviteStore,
      authPort: createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'uid-auth-only',
      }),
    });
    const server = createHostServer({ env: FIXTURE_ENV, authRuntime: runtime, nowMs: NOW });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { challengeId, signature } = await challengeAndSign(wallet, runtime);
      const res = await requestJson(server, {
        method: 'POST',
        path: '/auth/verify',
        body: { challengeId, signature },
      });
      expect(res.status).to.equal(200);
      expect(res.json.ok).to.equal(true);
      expect(res.json.inviteAccepted).to.equal(false);
      expect(res.json.userId).to.equal('uid-auth-only');
      expect(res.json.token).to.be.a('string');
      expect(res.json.membershipRole).to.equal(undefined);
      expect(
        membershipStore.listMembershipsByAddress(wallet.address).filter(
          (m) => m.familyId === FAMILY_ID,
        ),
      ).to.have.length(0);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('AC-G4-03: proof/to mismatch via inviteId → deny accept', async () => {
    const invitee = ethers.Wallet.createRandom();
    const other = ethers.Wallet.createRandom();
    const { membershipStore, inviteStore, parent } = seedBootstrappedFamily();
    inviteStore.addInvite({
      id: 'inv-mismatch',
      from: parent.address,
      to: invitee.address,
      role: 'child',
      familyId: FAMILY_ID,
      fromMembershipId: parent.id,
    });
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      nowMs: NOW,
      membershipStore,
      inviteStore,
      authPort: createMemorySupabaseAuthDouble(),
    });
    const server = createHostServer({ env: FIXTURE_ENV, authRuntime: runtime, nowMs: NOW });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      // Proof for `other`, but inviteId points at invite for invitee
      const { challengeId, signature } = await challengeAndSign(other, runtime);
      const res = await requestJson(server, {
        method: 'POST',
        path: '/auth/verify',
        body: {
          challengeId,
          signature,
          inviteId: 'inv-mismatch',
          familyId: FAMILY_ID,
        },
      });
      expect(res.status).to.equal(403);
      expect(res.json.ok).to.equal(false);
      expect(res.json.error).to.equal('EINVITE_PROOF_MISMATCH');
      expect(inviteStore.getInvite('inv-mismatch').status).to.equal('open');
      expect(
        membershipStore.listMembershipsByAddress(other.address).filter(
          (m) => m.familyId === FAMILY_ID,
        ),
      ).to.have.length(0);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('AC-G4-04: pre-accept open Invite alone → no family capability grant', async () => {
    const invitee = ethers.Wallet.createRandom();
    const { membershipStore, inviteStore, parent } = seedBootstrappedFamily();
    inviteStore.addInvite({
      id: 'inv-pre',
      from: parent.address,
      to: invitee.address,
      role: 'child',
      familyId: FAMILY_ID,
      fromMembershipId: parent.id,
    });
    expect(
      membershipStore.listMembershipsByAddress(invitee.address).filter(
        (m) => m.familyId === FAMILY_ID,
      ),
    ).to.have.length(0);

    const denied = assertInviteeNoFamilyCaps({
      membershipStore,
      toAddress: invitee.address,
      familyId: FAMILY_ID,
      capabilityId: CAPABILITIES.FAMILY_JOURNAL,
    });
    expect(denied.outcome).to.equal('deny');
    expect(denied.code).to.equal('EINVITE_PRE_ACCEPT_NO_CAPS');

    const decision = decide({
      actor: null,
      capabilityId: CAPABILITIES.FAMILY_JOURNAL,
      familyMemberships: membershipStore.listMembershipsByFamily(FAMILY_ID),
    });
    expect(decision.outcome).to.equal('deny');
  });

  it('AC-G4-05: client-claimed role ignored — membership role from Invite', async () => {
    const wallet = ethers.Wallet.createRandom();
    const { membershipStore, inviteStore, parent } = seedBootstrappedFamily();
    inviteStore.addInvite({
      id: 'inv-coparent',
      from: parent.address,
      to: wallet.address,
      role: 'parent',
      familyId: FAMILY_ID,
      fromMembershipId: parent.id,
    });
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      nowMs: NOW,
      membershipStore,
      inviteStore,
      authPort: createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'uid-coparent',
      }),
    });
    const server = createHostServer({ env: FIXTURE_ENV, authRuntime: runtime, nowMs: NOW });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { challengeId, signature } = await challengeAndSign(wallet, runtime);
      const res = await requestJson(server, {
        method: 'POST',
        path: '/auth/verify',
        body: {
          challengeId,
          signature,
          role: 'child', // claimed child — Invite says parent
          familyId: FAMILY_ID,
        },
      });
      expect(res.status).to.equal(200);
      expect(res.json.membershipRole).to.equal('parent');
      const m = membershipStore
        .listMembershipsByAddress(wallet.address)
        .find((x) => x.familyId === FAMILY_ID);
      expect(m.role).to.equal('parent');
      const actor = buildActorContext(m);
      expect(actor.role).to.equal('parent');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
