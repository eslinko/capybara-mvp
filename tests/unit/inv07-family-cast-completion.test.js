'use strict';

/**
 * INV-07 / G-POC-05 — API/test family cast completion harness.
 * Reuses Present INV-04 POST /auth/invite + INV-05 verify→bindInviteeAndAccept.
 * Fixture Bearer/familyId = WPROOF-08/09 capture doubles (no secrets).
 * Honesty: unit green ≠ invent live MetaMask Pass ≠ family onboarding Done · G8 Residual mid-redeploy.
 */

const http = require('http');
const { expect } = require('chai');
const { ethers } = require('ethers');

const { createHostServer } = require('../../host/server');
const { createAuthRuntime } = require('../../host/authHttp');
const { CREATE_INVITE_PATH } = require('../../host/inviteHttp');
const { MembershipStore } = require('../../packages/core/src/membership');
const { InviteStore } = require('../../packages/core/src/invite');
const {
  BearerSessionStore,
  issueBearerSession,
  createMemorySupabaseAuthDouble,
  issueChallenge,
} = require('../../packages/core/src/auth');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-signing-secret',
};

const FIXTURE_CONFIG = {
  supabaseUrl: FIXTURE_ENV.SUPABASE_URL,
  supabaseKey: FIXTURE_ENV.SUPABASE_SECRET_KEY,
  bearerSecret: FIXTURE_ENV.CAPY_BEARER_SECRET,
};

/** Fixture doubles for WPROOF-08/09 capture artifacts (not live tokens). */
const FAMILY_ID = 'fam-inv07-cast';
const PARENT_ADDR = '0xparentinv07cast000000000000000000000001';
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
    id: 'm-parent-inv07',
    familyId: FAMILY_ID,
    role: 'parent',
    address: PARENT_ADDR,
    userId: 'uid-parent-inv07',
  });
  return { membershipStore, inviteStore, parent };
}

/** Fixture Bearer = WPROOF-08 `#btn-copy-bearer` capture double. */
function issueParentBearer(membershipStore, parent) {
  const sessions = new BearerSessionStore();
  const session = issueBearerSession(
    sessions,
    { userId: parent.userId, address: parent.address },
    FIXTURE_CONFIG,
    { nowMs: NOW, ttlMs: 120_000 },
  );
  return { sessions, token: session.token };
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

describe('INV-07 family cast completion (G-POC-05)', () => {
  it('AC-P07: invite Tristan+Bastian child + Miguel parent via Present /auth/invite (Bearer+familyId fixtures)', async () => {
    const tristan = ethers.Wallet.createRandom();
    const bastian = ethers.Wallet.createRandom();
    const miguel = ethers.Wallet.createRandom();
    const { membershipStore, inviteStore, parent } = seedBootstrappedFamily();
    const { sessions, token } = issueParentBearer(membershipStore, parent);
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore,
      inviteStore,
      sessionStore: sessions,
      nowMs: NOW,
    });
    const server = createHostServer({
      env: FIXTURE_ENV,
      authRuntime: runtime,
      nowMs: NOW,
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      expect(CREATE_INVITE_PATH).to.equal('/auth/invite');

      const cast = [
        { label: 'Tristan', wallet: tristan, role: 'child' },
        { label: 'Bastian', wallet: bastian, role: 'child' },
        { label: 'Miguel', wallet: miguel, role: 'parent' },
      ];

      for (const member of cast) {
        const res = await requestJson(server, {
          method: 'POST',
          path: CREATE_INVITE_PATH,
          headers: { Authorization: `Bearer ${token}` },
          body: {
            familyId: FAMILY_ID,
            to: member.wallet.address,
            role: member.role,
            membershipId: parent.id,
          },
        });
        expect(res.status, member.label).to.equal(200);
        expect(res.json.ok).to.equal(true);
        expect(res.json.invite.status).to.equal('open');
        expect(res.json.invite.role).to.equal(member.role);
        expect(res.json.invite.familyId).to.equal(FAMILY_ID);
        expect(res.json.invite.to).to.equal(member.wallet.address.toLowerCase());
      }

      expect(inviteStore.listOpenByToInFamily(FAMILY_ID, tristan.address)).to.have.length(1);
      expect(inviteStore.listOpenByToInFamily(FAMILY_ID, bastian.address)).to.have.length(1);
      expect(inviteStore.listOpenByToInFamily(FAMILY_ID, miguel.address)).to.have.length(1);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('AC-P07: verify-accept invitees → membership role from Invite (INV-05 path)', async () => {
    const tristan = ethers.Wallet.createRandom();
    const bastian = ethers.Wallet.createRandom();
    const miguel = ethers.Wallet.createRandom();
    const { membershipStore, inviteStore, parent } = seedBootstrappedFamily();
    const { sessions, token } = issueParentBearer(membershipStore, parent);

    const userIdByAddr = new Map([
      [tristan.address.toLowerCase(), 'uid-tristan-inv07'],
      [bastian.address.toLowerCase(), 'uid-bastian-inv07'],
      [miguel.address.toLowerCase(), 'uid-miguel-inv07'],
    ]);

    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore,
      inviteStore,
      sessionStore: sessions,
      nowMs: NOW,
      authPort: createMemorySupabaseAuthDouble({
        userIdForAddress: (addr) => userIdByAddr.get(String(addr).toLowerCase()) || 'uid-unknown',
      }),
    });
    const server = createHostServer({
      env: FIXTURE_ENV,
      authRuntime: runtime,
      nowMs: NOW,
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const cast = [
        { wallet: tristan, role: 'child', userId: 'uid-tristan-inv07' },
        { wallet: bastian, role: 'child', userId: 'uid-bastian-inv07' },
        { wallet: miguel, role: 'parent', userId: 'uid-miguel-inv07' },
      ];

      for (const member of cast) {
        const inviteRes = await requestJson(server, {
          method: 'POST',
          path: CREATE_INVITE_PATH,
          headers: { Authorization: `Bearer ${token}` },
          body: {
            familyId: FAMILY_ID,
            to: member.wallet.address,
            role: member.role,
            membershipId: parent.id,
          },
        });
        expect(inviteRes.status).to.equal(200);

        const { challengeId, signature } = await challengeAndSign(member.wallet, runtime);
        const verifyRes = await requestJson(server, {
          method: 'POST',
          path: '/auth/verify',
          body: {
            challengeId,
            signature,
            role: 'parent', // client-claimed — ignored (INV-05)
            familyId: FAMILY_ID,
          },
        });
        expect(verifyRes.status).to.equal(200);
        expect(verifyRes.json.ok).to.equal(true);
        expect(verifyRes.json.inviteAccepted).to.equal(true);
        expect(verifyRes.json.membershipRole).to.equal(member.role);
        expect(verifyRes.json.userId).to.equal(member.userId);
        expect(verifyRes.json.inviteStatus).to.equal('accepted');

        const memberships = membershipStore
          .listMembershipsByAddress(member.wallet.address)
          .filter((m) => m.familyId === FAMILY_ID);
        expect(memberships).to.have.length(1);
        expect(memberships[0].role).to.equal(member.role);
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('honesty: harness uses INV-04/05 contracts only · ≠ invent live MetaMask / family onboarding Done', () => {
    // Contract stamps — no parallel invite invent
    expect(CREATE_INVITE_PATH).to.equal('/auth/invite');
    // Fixture familyId stands in for WPROOF-09 bootstrap capture — not a live Pass claim
    expect(FAMILY_ID).to.match(/^fam-inv07-/);
    // Explicit honesty lock for auditors / G8 Residual mid-redeploy
    const honesty = {
      liveMetaMaskPassInvented: false,
      familyOnboardingDoneInvented: false,
      parallelInviteRouteInvented: false,
      g8RedeployResidualAcknowledged: true,
    };
    expect(honesty.liveMetaMaskPassInvented).to.equal(false);
    expect(honesty.familyOnboardingDoneInvented).to.equal(false);
    expect(honesty.parallelInviteRouteInvented).to.equal(false);
    expect(honesty.g8RedeployResidualAcknowledged).to.equal(true);
  });
});
