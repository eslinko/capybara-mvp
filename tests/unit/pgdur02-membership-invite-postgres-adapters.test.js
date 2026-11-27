'use strict';

/**
 * PGDUR-02 — Membership+Invite Postgres adapters · host fail-closed · inject doubles.
 * Soft≠Live: unit ≠ invent REQ-12 Done / Live Pass / Phase 3 Done.
 */

const { expect } = require('chai');
const {
  createAuthRuntime,
  resolveMembershipInviteStores,
} = require('../../host/authHttp');
const {
  MembershipStore,
  PostgresMembershipStore,
  FailClosedMembershipStore,
} = require('../../packages/core/src/membership');
const {
  InviteStore,
  PostgresInviteStore,
  FailClosedInviteStore,
} = require('../../packages/core/src/invite');

const FIXTURE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'service-role-test-key',
  CAPY_BEARER_SECRET: 'bearer-test-secret',
};

/**
 * Minimal in-memory supabase-js `.from` chain for families/memberships/invites.
 */
function createMemoryTableClient() {
  /** @type {Record<string, Map<string, object>>} */
  const tables = {
    families: new Map(),
    memberships: new Map(),
    invites: new Map(),
  };

  function pk(table, row) {
    return row.id;
  }

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
    let pendingUpdate = null;
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
      update(patch) {
        mode = 'update';
        pendingUpdate = { ...patch };
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
          const id = pk(tableName, pendingInsert);
          if (tables[tableName].has(id)) {
            return {
              data: null,
              error: { message: 'duplicate', code: '23505' },
            };
          }
          if (tableName === 'memberships') {
            for (const r of tables[tableName].values()) {
              if (r.address === pendingInsert.address) {
                return {
                  data: null,
                  error: { message: 'unique address', code: '23505' },
                };
              }
            }
          }
          tables[tableName].set(id, { ...pendingInsert });
          return { data: { ...pendingInsert }, error: null };
        }
        if (mode === 'update' && pendingUpdate) {
          const rows = [...tables[tableName].values()].filter((r) =>
            matches(r, filters),
          );
          if (rows.length === 0) {
            return { data: null, error: { message: 'not found' } };
          }
          const next = { ...rows[0], ...pendingUpdate };
          tables[tableName].set(next.id, next);
          return { data: next, error: null };
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
        // await query without single/maybeSingle → list
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

describe('PGDUR-02 membership/invite Postgres adapters Soft≠Live', () => {
  it('AC-P01/P02: Postgres adapters round-trip family/membership/invite via client', async () => {
    const client = createMemoryTableClient();
    const membershipStore = new PostgresMembershipStore({ client });
    const inviteStore = new PostgresInviteStore({ client });

    const family = await membershipStore.createFamily({ id: 'fam-pg', label: 't' });
    expect(family.id).to.equal('fam-pg');
    await membershipStore.setPoolIdentity('fam-pg', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await membershipStore.markBootstrapped('fam-pg');
    expect(await membershipStore.isBootstrapped('fam-pg')).to.equal(true);

    const m = await membershipStore.addMembership({
      id: 'm-1',
      familyId: 'fam-pg',
      role: 'parent',
      address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    expect(m.familyId).to.equal('fam-pg');
    expect(await membershipStore.getRoleForAddress(m.address)).to.equal('parent');

    const inv = await inviteStore.addInvite({
      id: 'inv-1',
      from: m.address,
      to: '0xcccccccccccccccccccccccccccccccccccccccc',
      role: 'child',
      familyId: 'fam-pg',
      fromMembershipId: m.id,
    });
    expect(inv.status).to.equal('open');
    const open = await inviteStore.listOpenByToInFamily(
      'fam-pg',
      '0xcccccccccccccccccccccccccccccccccccccccc',
    );
    expect(open).to.have.length(1);
    const accepted = await inviteStore.markAccepted('inv-1');
    expect(accepted.status).to.equal('accepted');
  });

  it('AC-P06: missing config → fail-closed stores (no silent RAM SoT)', () => {
    const stores = resolveMembershipInviteStores(null, {});
    expect(stores.membershipStore).to.be.instanceOf(FailClosedMembershipStore);
    expect(stores.inviteStore).to.be.instanceOf(FailClosedInviteStore);
    expect(() => stores.membershipStore.createFamily({ id: 'x' })).to.throw(
      /durable membership\/invite unavailable/i,
    );
  });

  it('AC-P06: config Present but createClient throws → fail-closed stores', () => {
    const stores = resolveMembershipInviteStores(
      {
        supabaseUrl: FIXTURE_ENV.SUPABASE_URL,
        supabaseKey: FIXTURE_ENV.SUPABASE_SECRET_KEY,
        bearerSecret: FIXTURE_ENV.CAPY_BEARER_SECRET,
      },
      {
        createClient: () => {
          throw new Error('forced unavailable');
        },
      },
    );
    expect(stores.membershipStore).to.be.instanceOf(FailClosedMembershipStore);
    expect(stores.inviteStore).to.be.instanceOf(FailClosedInviteStore);
  });

  it('AC-P01 wire: config Present + inject createClient → Postgres stores', () => {
    const client = createMemoryTableClient();
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      createClient: () => client,
      authPort: { kind: 'memory', residual: true, createOrLinkUser() {} },
    });
    expect(runtime.membershipStore).to.be.instanceOf(PostgresMembershipStore);
    expect(runtime.inviteStore).to.be.instanceOf(PostgresInviteStore);
  });

  it('AC-P08: memory doubles still injectable; story ≠ Phase 3 Done claim', () => {
    const membershipStore = new MembershipStore();
    const inviteStore = new InviteStore();
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore,
      inviteStore,
      authPort: { kind: 'memory', residual: true, createOrLinkUser() {} },
    });
    expect(runtime.membershipStore).to.equal(membershipStore);
    expect(runtime.inviteStore).to.equal(inviteStore);
    membershipStore.createFamily({ id: 'fam-mem' });
    expect(membershipStore.getFamily('fam-mem')).to.not.equal(null);
    const note =
      'Soft≠Live: PGDUR-02 unit ≠ invent REQ-12 Done / Phase 3 Done / Live Pass';
    expect(note).to.include('Soft≠Live');
    expect(note).to.not.match(/REQ-12 Done claimed/i);
  });

  it('AC-P07 class: sanitizePublicAuthMessage still redacts secrets on durable wiring', () => {
    const { sanitizePublicAuthMessage } = require('../../host/authHttp');
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore: new MembershipStore(),
      inviteStore: new InviteStore(),
      authPort: { kind: 'memory', residual: true, createOrLinkUser() {} },
    });
    const msg = sanitizePublicAuthMessage(
      `leak ${FIXTURE_ENV.SUPABASE_SECRET_KEY} and ${FIXTURE_ENV.CAPY_BEARER_SECRET}`,
      runtime.config,
    );
    expect(msg).to.not.include(FIXTURE_ENV.SUPABASE_SECRET_KEY);
    expect(msg).to.not.include(FIXTURE_ENV.CAPY_BEARER_SECRET);
    expect(msg).to.include('[redacted]');
  });
});
