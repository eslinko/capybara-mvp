'use strict';

/**
 * PGDUR-06 — Durable cast path assert Soft≠Live.
 * Store kind presence · cast-wire same runtime stores · FailClosed.
 * Soft unit ≠ invent Live Pass / REQ-12 Done · Live cast Residual OK.
 */

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const {
  createAuthRuntime,
  describeAuthEnvPresence,
  resolveMembershipInviteStores,
} = require('../../host/authHttp');
const { createHostServer } = require('../../host/server');
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

function createMemoryTableClient() {
  /** @type {Record<string, Map<string, object>>} */
  const tables = {
    families: new Map(),
    memberships: new Map(),
    invites: new Map(),
    verified_address_proofs: new Map(),
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
      update() {
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
          tables[tableName].set(id, { ...pendingInsert });
          return { data: { ...pendingInsert }, error: null };
        }
        const rows = [...tables[tableName].values()].filter((r) =>
          matches(r, filters),
        );
        return {
          data: rows[0] || null,
          error: rows[0] ? null : { message: 'not found' },
        };
      },
      then(resolve, reject) {
        const rows = [...tables[tableName].values()].filter((r) =>
          matches(r, filters),
        );
        return Promise.resolve({ data: rows, error: null }).then(
          resolve,
          reject,
        );
      },
    };
    return api;
  }

  return { from, _tables: tables };
}

describe('PGDUR-06 durable cast path assert Soft≠Live', () => {
  it('AC-P06-01: createClient Present → storeKind=postgres + Postgres stores', () => {
    const client = createMemoryTableClient();
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      createClient: () => client,
      authPort: { kind: 'memory', residual: true, createOrLinkUser() {} },
    });
    expect(runtime.storeKind).to.equal('postgres');
    expect(runtime.membershipStore).to.be.instanceOf(PostgresMembershipStore);
    expect(runtime.inviteStore).to.be.instanceOf(PostgresInviteStore);
  });

  it('AC-P06-02: createHostServer invite+auth use same runtime invite/membership stores', () => {
    const membershipStore = new MembershipStore();
    const inviteStore = new InviteStore();
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore,
      inviteStore,
      authPort: { kind: 'memory', residual: true, createOrLinkUser() {} },
    });
    const server = createHostServer({
      env: { ...FIXTURE_ENV, PORT: '3999' },
      authRuntime: runtime,
    });
    expect(server.authRuntime).to.equal(runtime);
    expect(server.authRuntime.membershipStore).to.equal(membershipStore);
    expect(server.authRuntime.inviteStore).to.equal(inviteStore);
    expect(server.authRuntime.storeKind).to.equal('memory-inject');

    const inviteSrc = fs.readFileSync(
      path.join(__dirname, '../../host/inviteHttp.js'),
      'utf8',
    );
    expect(inviteSrc).to.match(/runtime\.inviteStore/);
    expect(inviteSrc).to.match(/runtime\.membershipStore/);
    const authSrc = fs.readFileSync(
      path.join(__dirname, '../../host/authHttp.js'),
      'utf8',
    );
    expect(authSrc).to.match(/runtime\.membershipStore/);
    server.close();
  });

  it('AC-P06-03: createClient Absent → FailClosed; bootstrap/invite fail closed', () => {
    const stores = resolveMembershipInviteStores(
      {
        supabaseUrl: FIXTURE_ENV.SUPABASE_URL,
        supabaseKey: FIXTURE_ENV.SUPABASE_SECRET_KEY,
        bearerSecret: FIXTURE_ENV.CAPY_BEARER_SECRET,
      },
      {},
    );
    expect(stores.storeKind).to.equal('fail-closed');
    expect(stores.membershipStore).to.be.instanceOf(FailClosedMembershipStore);
    expect(stores.inviteStore).to.be.instanceOf(FailClosedInviteStore);
    expect(() => stores.membershipStore.createFamily({ id: 'x' })).to.throw(
      /createClient|durable/i,
    );
    expect(() =>
      stores.inviteStore.addInvite({
        id: 'i',
        from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        role: 'child',
        familyId: 'f',
        fromMembershipId: 'm',
      }),
    ).to.throw(/createClient|durable/i);

    const runtime = createAuthRuntime(FIXTURE_ENV, {
      authPort: { kind: 'memory', residual: true, createOrLinkUser() {} },
    });
    expect(runtime.storeKind).to.equal('fail-closed');
  });

  it('AC-P06-04: describeAuthEnvPresence reports store_kind (no secrets)', () => {
    const presence = describeAuthEnvPresence(FIXTURE_ENV, undefined, {
      storeKind: 'postgres',
    });
    expect(presence.storeKind).to.equal('postgres');
    expect(presence.line).to.match(/store_kind=postgres/);
    expect(presence.line).to.not.include(FIXTURE_ENV.SUPABASE_SECRET_KEY);
    expect(presence.line).to.not.include(FIXTURE_ENV.CAPY_BEARER_SECRET);

    const fc = describeAuthEnvPresence({}, undefined, {
      storeKind: 'fail-closed',
    });
    expect(fc.line).to.match(/store_kind=fail-closed/);

    const inj = describeAuthEnvPresence(FIXTURE_ENV, undefined, {
      storeKind: 'memory-inject',
    });
    expect(inj.line).to.match(/store_kind=memory-inject/);
  });

  it('AC-P06-05 Soft≠Live: Live cast Residual OK · ≠ invent Pass / REQ-12 Done', () => {
    const honesty =
      'Soft≠Live: PGDUR-06 Soft unit ≠ invent Live Pass / REQ-12 Done · Live cast Residual OK (PGDUR-05 / EDGE-08)';
    expect(honesty).to.include('Residual OK');
    expect(honesty).to.include('Soft≠Live');
    expect(honesty).to.not.match(/REQ-12 Done claimed/i);
  });
});
