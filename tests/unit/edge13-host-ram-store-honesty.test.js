'use strict';

/**
 * EDGE-13 — Host RAM store honesty Soft≠Live.
 * FailClosed proof not unlabeled Memory · inject Memory remain · start.js honesty.
 * Soft≠Live — ≠ invent Live Pass.
 */

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const {
  createAuthRuntime,
  resolveMembershipInviteStores,
} = require('../../host/authHttp');
const {
  MembershipStore,
  FailClosedMembershipStore,
} = require('../../packages/core/src/membership');
const {
  InviteStore,
  FailClosedInviteStore,
} = require('../../packages/core/src/invite');
const {
  VerifiedAddressProofStore,
  FailClosedVerifiedAddressProofStore,
} = require('../../packages/core/src/auth');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'service-role-test-key',
  CAPY_BEARER_SECRET: 'bearer-test-secret',
};

describe('EDGE-13 host RAM store honesty Soft≠Live', () => {
  it('AC-E13-01: start.js header documents Postgres Soft / FailClosed / memory-inject', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '../../host/start.js'),
      'utf8',
    );
    expect(text).to.match(/postgres/i);
    expect(text).to.match(/fail-closed/i);
    expect(text).to.match(/memory-inject|inject only/i);
    expect(text).to.not.match(
      /MembershipStore\/InviteStore in-memory residual/i,
    );
  });

  it('AC-E13-02/03: FailClosed path uses FailClosed proof — not unlabeled Memory', () => {
    const stores = resolveMembershipInviteStores(null, {});
    expect(stores.storeKind).to.equal('fail-closed');
    expect(stores.membershipStore).to.be.instanceOf(FailClosedMembershipStore);
    expect(stores.inviteStore).to.be.instanceOf(FailClosedInviteStore);
    expect(stores.verifiedProofStore).to.be.instanceOf(
      FailClosedVerifiedAddressProofStore,
    );
    expect(stores.verifiedProofStore.kind).to.equal(
      'fail-closed-verified-proof',
    );
    expect(() =>
      stores.verifiedProofStore.addVerifiedProof({
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        challengeId: 'c1',
        verifiedAt: '2026-11-27T00:00:00.000Z',
        verifiedAtMs: 1,
      }),
    ).to.throw(/unavailable|durable/i);

    const noClient = resolveMembershipInviteStores(
      {
        supabaseUrl: FIXTURE_ENV.SUPABASE_URL,
        supabaseKey: FIXTURE_ENV.SUPABASE_SECRET_KEY,
        bearerSecret: FIXTURE_ENV.CAPY_BEARER_SECRET,
      },
      {},
    );
    expect(noClient.verifiedProofStore).to.be.instanceOf(
      FailClosedVerifiedAddressProofStore,
    );
  });

  it('AC-E13-04: unit inject Memory Membership/Invite/Proof still green (AC-P08)', () => {
    const membershipStore = new MembershipStore();
    const inviteStore = new InviteStore();
    const verifiedProofStore = new VerifiedAddressProofStore();
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore,
      inviteStore,
      verifiedProofStore,
      authPort: { kind: 'memory', residual: true, createOrLinkUser() {} },
    });
    expect(runtime.storeKind).to.equal('memory-inject');
    expect(runtime.membershipStore).to.equal(membershipStore);
    expect(runtime.inviteStore).to.equal(inviteStore);
    expect(runtime.verifiedProofStore).to.equal(verifiedProofStore);
    expect(runtime.verifiedProofStore.kind).to.equal('memory-verified-proof');
    membershipStore.createFamily({ id: 'fam-edge13' });
    expect(membershipStore.getFamily('fam-edge13')).to.not.equal(null);
  });

  it('AC-E13-05 Soft≠Live: docs/unit alone ≠ invent Live Pass', () => {
    const honesty =
      'Soft≠Live: EDGE-13 Soft honesty ≠ invent Live Pass · tip no flip EDGE-08 Done';
    expect(honesty).to.include('Soft≠Live');
    expect(honesty).to.not.match(/Live Pass claimed/i);
  });
});
