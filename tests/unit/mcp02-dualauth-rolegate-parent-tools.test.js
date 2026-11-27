'use strict';

/**
 * MCP-02 Soft≠Live — DualAuth → parent → CatalogAlias→RoleGate on MCP tools.
 * Soft unit ≠ invent Live Pass / REQ-08 Accept / Phase 4 Done (MCP-07 residual).
 */

const { expect } = require('chai');
const { createAuthRuntime } = require('../../host/authHttp');
const {
  authorizeMcpToolCall,
  mapMcpToolGateError,
} = require('../../host/mcp/mcpToolGate');
const {
  listParentOnlyMcpToolNames,
  assertNoChildToolsRegistered,
  isChildMcpToolName,
  PARENT_ONLY_MCP_TOOLS,
} = require('../../host/mcp/mcpToolRegistry');
const { createCapybaraMcpServer } = require('../../host/mcp/mcpHttp');
const { MembershipStore } = require('../../packages/core/src/membership');
const {
  BearerSessionStore,
  issueBearerSession,
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

function seedFamily() {
  const store = new MembershipStore();
  store.createFamily({ id: 'fam-mcp02' });
  const parent = store.addMembership({
    id: 'm-parent-mcp02',
    familyId: 'fam-mcp02',
    role: 'parent',
    address: '0xparentmcp020000000000000000000000000001',
    userId: 'user-parent-mcp02',
  });
  const child = store.addMembership({
    id: 'm-child-mcp02',
    familyId: 'fam-mcp02',
    role: 'child',
    address: '0xchildmcp0200000000000000000000000000001',
    userId: 'user-child-mcp02',
  });
  return { store, parent, child };
}

function mockReq(bearer) {
  return {
    headers: bearer
      ? { authorization: `Bearer ${bearer}` }
      : {},
  };
}

describe('MCP-02 DualAuth→RoleGate parent tools Soft≠Live', () => {
  it('AC-M05: parent-only registry · no child tools registered', () => {
    expect(assertNoChildToolsRegistered()).to.equal(true);
    const names = listParentOnlyMcpToolNames();
    expect(names.length).to.be.greaterThan(0);
    for (const n of names) {
      expect(isChildMcpToolName(n)).to.equal(false);
    }
    expect(isChildMcpToolName('child.balances')).to.equal(true);
    createCapybaraMcpServer({});
  });

  it('mapMcpToolGateError Soft 401/403/503', () => {
    expect(mapMcpToolGateError({ code: 'EAUTH_ENV_MISSING' }).status).to.equal(
      503,
    );
    expect(mapMcpToolGateError({ code: 'EAUTH_DUAL_DENY' }).status).to.equal(
      401,
    );
    expect(mapMcpToolGateError({ code: 'EROLEGATE_DENY' }).status).to.equal(
      403,
    );
  });

  it('AC-M02: unauth tool entry denied Soft', async () => {
    const { store } = seedFamily();
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore: store,
      nowMs: 1_700_000_000_000,
    });
    try {
      await authorizeMcpToolCall({
        req: mockReq(null),
        runtime,
        capabilityId: 'debt.view',
        familyId: 'fam-mcp02',
      });
      expect.fail('expected deny');
    } catch (err) {
      expect(err.code).to.equal('EAUTH_DUAL_DENY');
      expect(mapMcpToolGateError(err).status).to.equal(401);
    }
  });

  it('AC-M03: parent Bearer + CatalogAlias→RoleGate allow Soft', async () => {
    const { store, parent } = seedFamily();
    const sessions = new BearerSessionStore();
    const nowMs = 1_700_000_000_000;
    const session = issueBearerSession(
      sessions,
      { userId: parent.userId, address: parent.address },
      FIXTURE_CONFIG,
      { nowMs, ttlMs: 120_000 },
    );
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore: store,
      sessionStore: sessions,
      nowMs,
    });
    const gated = await authorizeMcpToolCall({
      req: mockReq(session.token),
      runtime,
      capabilityId: 'debt.view',
      familyId: 'fam-mcp02',
    });
    expect(gated.ok).to.equal(true);
    expect(gated.role).to.equal('parent');
    expect(gated.membershipId).to.equal(parent.id);
    expect(gated.capabilityId).to.equal('debt.view');
  });

  it('AC-M03/M05: child Bearer cannot run parent tools Soft', async () => {
    const { store, child } = seedFamily();
    const sessions = new BearerSessionStore();
    const nowMs = 1_700_000_000_000;
    const session = issueBearerSession(
      sessions,
      { userId: child.userId, address: child.address },
      FIXTURE_CONFIG,
      { nowMs, ttlMs: 120_000 },
    );
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore: store,
      sessionStore: sessions,
      nowMs,
    });
    try {
      await authorizeMcpToolCall({
        req: mockReq(session.token),
        runtime,
        capabilityId: 'debt.view',
        familyId: 'fam-mcp02',
      });
      expect.fail('expected parent-only deny');
    } catch (err) {
      expect(err.code).to.equal('EROLEGATE_DENY');
      expect(mapMcpToolGateError(err).status).to.equal(403);
    }
  });

  it('AC-M08: clientClaimedRole does not grant Soft', async () => {
    const { store, parent } = seedFamily();
    const sessions = new BearerSessionStore();
    const nowMs = 1_700_000_000_000;
    const session = issueBearerSession(
      sessions,
      { userId: parent.userId, address: parent.address },
      FIXTURE_CONFIG,
      { nowMs, ttlMs: 120_000 },
    );
    const runtime = createAuthRuntime(FIXTURE_ENV, {
      membershipStore: store,
      sessionStore: sessions,
      nowMs,
    });
    const gated = await authorizeMcpToolCall({
      req: mockReq(session.token),
      runtime,
      capabilityId: 'family.invite_member',
      familyId: 'fam-mcp02',
      clientClaimedRole: 'child',
    });
    expect(gated.ok).to.equal(true);
    expect(gated.role).to.equal('parent');
  });

  it('Soft residual honesty: Live Pass / REQ-08 / Phase 4 not invented', () => {
    expect(PARENT_ONLY_MCP_TOOLS.every((t) => t.description.includes('OOS'))).to
      .equal(true);
    // Live ACL Residual → MCP-07; Soft unit alone ≠ Phase 4 Done
    expect(true).to.equal(true);
  });
});
