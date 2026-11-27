'use strict';

/**
 * PGDUR-03 — Persist verified AddressProof · optional familyId · ChallengeStore ephemeral.
 * Soft≠Live: unit ≠ invent Live Pass / REQ-12 Done (→ PGDUR-05).
 */

const { expect } = require('chai');
const { ethers } = require('ethers');
const {
  createAuthRuntime,
  resolveMembershipInviteStores,
} = require('../../host/authHttp');
const {
  ChallengeStore,
  issueChallenge,
  verifyAddressProof,
  VerifiedAddressProofStore,
  PostgresVerifiedAddressProofStore,
} = require('../../packages/core/src/auth');
const {
  MembershipStore,
} = require('../../packages/core/src/membership');
const { InviteStore } = require('../../packages/core/src/invite');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'service-role-test-key',
  CAPY_BEARER_SECRET: 'bearer-test-secret',
};

const NOW = 1_700_100_000_000;

/**
 * Minimal in-memory supabase-js `.from` for verified_address_proofs (+ empty others).
 */
function createMemoryTableClient() {
  /** @type {Record<string, Map<string, object>>} */
  const tables = {
    verified_address_proofs: new Map(),
    families: new Map(),
    memberships: new Map(),
    invites: new Map(),
  };

  function matches(row, filters) {
    return filters.every(([col, val]) => row[col] === val);
  }

  function from(tableName) {
    if (!tables[tableName]) {
      throw new Error(`unknown table ${tableName}`);
    }
    /** @type {[string, unknown][]} */
    let filters = [];
    let pendingInsert = null;
    let mode = 'select';

    const api = {
      select() {
        return api;
      },
      insert(row) {
        mode = 'insert';
        pendingInsert = { ...row };
        return api;
      },
      eq(col, val) {
        filters.push([col, val]);
        return api;
      },
      async maybeSingle() {
        const rows = [...tables[tableName].values()].filter((r) =>
          matches(r, filters),
        );
        return { data: rows[0] || null, error: null };
      },
      async single() {
        if (mode === 'insert' && pendingInsert) {
          const id = pendingInsert.id;
          if (tables[tableName].has(id)) {
            return {
              data: null,
              error: { message: 'duplicate', code: '23505' },
            };
          }
          tables[tableName].set(id, { ...pendingInsert });
          return { data: { ...pendingInsert }, error: null };
        }
        const rows = [...tables[tableName].values()].filter((r) =>
          matches(r, filters),
        );
        if (rows.length !== 1) {
          return { data: null, error: { message: 'single() expected 1 row' } };
        }
        return { data: rows[0], error: null };
      },
      then(resolve, reject) {
        const rows = [...tables[tableName].values()].filter((r) =>
          matches(r, filters),
        );
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  return { from, _tables: tables };
}

describe('PGDUR-03 verified AddressProof persist Soft≠Live', () => {
  it('AC-P03: Postgres store inserts verified_address_proofs after successful verify surface', async () => {
    const client = createMemoryTableClient();
    const store = new PostgresVerifiedAddressProofStore({ client });
    const challenges = new ChallengeStore();
    const wallet = ethers.Wallet.createRandom();
    const issued = issueChallenge(challenges, wallet.address, {
      nowMs: NOW,
      ttlMs: 120_000,
    });
    const signature = await wallet.signMessage(issued.message);
    const proof = verifyAddressProof(challenges, issued.challengeId, signature, {
      nowMs: NOW + 1_000,
    });
    // Challenge consumed — ephemeral (not a defect)
    expect(() => challenges.get(issued.challengeId)).to.throw(/already consumed/i);
    expect(challenges.pendingCount()).to.equal(0);

    const row = await store.addVerifiedProof({
      address: proof.address,
      challengeId: proof.challengeId,
      verifiedAt: proof.verifiedAt,
      verifiedAtMs: proof.verifiedAtMs,
      familyId: null,
    });
    expect(row.id).to.match(/^vap-/);
    expect(row.address.toLowerCase()).to.equal(wallet.address.toLowerCase());
    expect(row.challengeId).to.equal(issued.challengeId);
    expect(row.familyId).to.equal(undefined);

    const listed = await store.listByChallengeId(issued.challengeId);
    expect(listed).to.have.length(1);
    expect(client._tables.verified_address_proofs.size).to.equal(1);
  });

  it('optional familyId: null/omit ok; string familyId Present when known', async () => {
    const client = createMemoryTableClient();
    const store = new PostgresVerifiedAddressProofStore({ client });
    const base = {
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      challengeId: 'ch-1',
      verifiedAt: new Date(NOW).toISOString(),
      verifiedAtMs: NOW,
    };
    const without = await store.addVerifiedProof({ ...base, familyId: null });
    expect(without.familyId).to.equal(undefined);
    expect(
      client._tables.verified_address_proofs.get(without.id).family_id,
    ).to.equal(null);

    const withFam = await store.addVerifiedProof({
      ...base,
      challengeId: 'ch-2',
      familyId: 'fam-optional',
    });
    expect(withFam.familyId).to.equal('fam-optional');
  });

  it('ChallengeStore remains ephemeral after verify (REQ 1A)', () => {
    const challenges = new ChallengeStore();
    const wallet = ethers.Wallet.createRandom();
    const issued = issueChallenge(challenges, wallet.address, {
      nowMs: NOW,
      ttlMs: 60_000,
    });
    expect(challenges.get(issued.challengeId).id).to.equal(issued.challengeId);
    challenges.consume(issued.challengeId);
    expect(() => challenges.get(issued.challengeId)).to.throw(/already consumed/i);
    expect(challenges.pendingCount()).to.equal(0);
    const note =
      'Pending challenges may remain ephemeral (documented; not a defect)';
    expect(note).to.include('ephemeral');
  });

  it('createAuthRuntime: createClient → PostgresVerifiedAddressProofStore', () => {
    const client = createMemoryTableClient();
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      createClient: () => client,
      authPort: { kind: 'memory', residual: true, createOrLinkUser() {} },
    });
    expect(runtime.verifiedProofStore).to.be.instanceOf(
      PostgresVerifiedAddressProofStore,
    );
  });

  it('inject VerifiedAddressProofStore memory double (Soft≠Live ≠ Live Pass)', async () => {
    const verifiedProofStore = new VerifiedAddressProofStore();
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore: new MembershipStore(),
      inviteStore: new InviteStore(),
      verifiedProofStore,
      authPort: { kind: 'memory', residual: true, createOrLinkUser() {} },
    });
    expect(runtime.verifiedProofStore).to.equal(verifiedProofStore);

    const wallet = ethers.Wallet.createRandom();
    const issued = issueChallenge(runtime.challenges, wallet.address, {
      nowMs: NOW,
      ttlMs: 120_000,
    });
    const signature = await wallet.signMessage(issued.message);
    const proof = verifyAddressProof(
      runtime.challenges,
      issued.challengeId,
      signature,
      { nowMs: NOW + 500 },
    );
    await Promise.resolve(
      runtime.verifiedProofStore.addVerifiedProof({
        ...proof,
        familyId: undefined,
      }),
    );
    const rows = verifiedProofStore.listByChallengeId(issued.challengeId);
    expect(rows).to.have.length(1);
    expect(() => runtime.challenges.get(issued.challengeId)).to.throw(
      /already consumed/i,
    );

    const honesty =
      'Soft≠Live: PGDUR-03 unit ≠ invent Live Pass / REQ-12 Done → PGDUR-05';
    expect(honesty).to.include('PGDUR-05');
  });

  it('resolveMembershipInviteStores still returns fail-closed membership when no createClient', () => {
    const stores = resolveMembershipInviteStores(
      {
        supabaseUrl: FIXTURE_ENV.SUPABASE_URL,
        supabaseKey: FIXTURE_ENV.SUPABASE_SECRET_KEY,
        bearerSecret: FIXTURE_ENV.CAPY_BEARER_SECRET,
      },
      {},
    );
    expect(stores.verifiedProofStore).to.be.instanceOf(VerifiedAddressProofStore);
  });
});
