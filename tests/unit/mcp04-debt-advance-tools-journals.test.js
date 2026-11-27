'use strict';

/**
 * MCP-04 Soft≠Live — debt.* / advance.* via actionInvoker + journal Soft parity (AC-M01 rest · AC-M10).
 * Soft unit ≠ invent Live Pass / Phase 4 Done / REQ-12 Accept.
 */

process.env.CAPYBARA_LAZY_CONFIG = '1';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  FAMILY_MCP_TOOLS,
  listFamilyMcpToolNames,
  mapArgsToCapybaraEnv,
  assertNoExcludedToolsRegistered,
  assertDebtAdvanceToolsRegistered,
  getFamilyMcpTool,
} = require('../../host/mcp/toolRegistry');
const {
  executeFamilyAction,
  createFamilyActionInstance,
  resetSharedRouterForTests,
} = require('../../host/mcp/actionInvoker');
const { createCapybaraMcpServer } = require('../../host/mcp/mcpHttp');
const { createAuthRuntime } = require('../../host/authHttp');
const { authorizeMcpToolCall } = require('../../host/mcp/mcpToolGate');
const { MembershipStore } = require('../../packages/core/src/membership');
const {
  BearerSessionStore,
  issueBearerSession,
} = require('../../packages/core/src/auth');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { EXAMPLE_LIMITS_PATH: DEBT_EXAMPLE_LIMITS } = require('../../packages/core/src/debt/debtLimits');
const { readDebtEvents } = require('../../packages/core/src/debt/debtProjection');
const { getChildDebtPath } = require('../../packages/core/src/debt/debtPath');
const { readAdvanceEvents } = require('../../packages/core/src/advance/advanceProjection');
const { getChildAdvancePath } = require('../../packages/core/src/advance/advancePath');
const { DebtLedgerAction } = require('../../packages/core/src/actions/DebtLedgerAction');
const { AdvanceLedgerAction } = require('../../packages/core/src/actions/AdvanceLedgerAction');

const FIXTURE_AUTH_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'test-secret-key',
  CAPY_BEARER_SECRET: 'test-bearer-signing-secret',
};

const FIXTURE_CAPY_ENV = {
  CAPY_RPC_URL: 'http://127.0.0.1:8545',
  CAPY_CHAIN_ID: '31337',
  CAPY_MODE: 'mock',
  CAPY_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
  PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
  PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
  CAPY_DAILY_TRISTAN: '5',
  CAPY_DAILY_BASTIAN: '5',
  TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
  TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
  BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
  BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
};

const SCOPE = {
  mode: 'mock',
  chainId: '31337',
  token: '0x1111111111111111111111111111111111111111',
  pool: '0x2222222222222222222222222222222222222222',
};

const NOW = new Date('2026-11-27T22:06:41.000Z');

function stubRouter() {
  const config = buildConfigFromEnv(FIXTURE_CAPY_ENV);
  return {
    config,
    logger: {
      section() {},
      info() {},
      warn() {},
      error() {},
      success() {},
      debug() {},
    },
    walletRegistry: {
      listKnownWallets: () => ['tristan', 'bastian', 'parent'],
    },
    capyToken: {
      getSymbol: async () => 'CAPY',
      transfer() {
        throw new Error('on-chain transfer is out of Soft MCP-04 scope');
      },
    },
  };
}

async function writeAdvanceLimits(tempRoot) {
  const filePath = path.join(tempRoot, 'advance-limits.json');
  await fs.writeFile(
    filePath,
    `${JSON.stringify({
      max_open_advances: { disabled: true },
      max_advance_outstanding: { disabled: true },
      children: {},
    })}\n`,
  );
  return filePath;
}

describe('MCP-04 debt/advance tools + journals Soft≠Live', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-mcp04-'));
  });

  afterEach(async () => {
    resetSharedRouterForTests();
    delete process.env.CAPYBARA_WALLET;
    delete process.env.CAPYBARA_DEBT_OP;
    delete process.env.CAPYBARA_ADVANCE_OP;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('t01 Soft: registry has all REQ §3.3–3.4 debt.* / advance.* · excludes 51/52', () => {
    expect(assertNoExcludedToolsRegistered()).to.equal(true);
    expect(assertDebtAdvanceToolsRegistered()).to.equal(true);
    const names = listFamilyMcpToolNames();
    expect(names.filter((n) => n.startsWith('debt.'))).to.have.length(12);
    expect(names.filter((n) => n.startsWith('advance.'))).to.have.length(5);
    for (const t of FAMILY_MCP_TOOLS.filter((x) => x.action === 6 || x.action === 7)) {
      expect(t.action === 6 || t.action === 7).to.equal(true);
      expect(t.action).to.not.equal(51);
    }
    createCapybaraMcpServer({});
  });

  it('t02 Soft: op+params → CAPYBARA_DEBT_* / CAPYBARA_ADVANCE_* isolated env · Action ctor 6/7', () => {
    expect(
      mapArgsToCapybaraEnv('debt.create', {
        wallet: 'tristan',
        debtId: 'd1',
        amount: '80',
        reason: 'loan',
      }),
    ).to.deep.equal({
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'd1',
      CAPYBARA_DEBT_AMOUNT: '80',
      CAPYBARA_DEBT_REASON: 'loan',
    });
    expect(
      mapArgsToCapybaraEnv('debt.cancel_fine', {
        wallet: 'bastian',
        fineId: 'f1',
        cancelReason: 'oops',
      }),
    ).to.include({
      CAPYBARA_DEBT_OP: 'cancel-fine',
      CAPYBARA_WALLET: 'bastian',
      CAPYBARA_DEBT_FINE_ID: 'f1',
      CAPYBARA_DEBT_CANCEL_REASON: 'oops',
    });
    expect(
      mapArgsToCapybaraEnv('advance.issue', {
        wallet: 'tristan',
        advanceId: 'adv-1',
        amount: '400',
        reason: 'float',
      }),
    ).to.deep.equal({
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_ID: 'adv-1',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'float',
    });

    const router = stubRouter();
    const debtTool = getFamilyMcpTool('debt.summary');
    const debtEnv = mapArgsToCapybaraEnv('debt.summary', { wallet: 'tristan' });
    const debtBuilt = createFamilyActionInstance({
      tool: debtTool,
      isolatedEnv: debtEnv,
      router,
      debtRoot: path.join(tempRoot, 'debt'),
      limitsPath: DEBT_EXAMPLE_LIMITS,
      decimals: 0,
      now: NOW,
    });
    expect(debtBuilt.kind).to.equal('action');
    expect(debtBuilt.instance).to.be.instanceOf(DebtLedgerAction);
    expect(debtBuilt.instance.env.CAPYBARA_DEBT_OP).to.equal('summary');
    expect(process.env.CAPYBARA_DEBT_OP).to.equal(undefined);

    const advTool = getFamilyMcpTool('advance.summary');
    const advEnv = mapArgsToCapybaraEnv('advance.summary', { wallet: 'tristan' });
    const advBuilt = createFamilyActionInstance({
      tool: advTool,
      isolatedEnv: advEnv,
      router,
      advanceRoot: path.join(tempRoot, 'advance'),
      decimals: 8,
    });
    expect(advBuilt.kind).to.equal('action');
    expect(advBuilt.instance).to.be.instanceOf(AdvanceLedgerAction);
    expect(advBuilt.instance.env.CAPYBARA_ADVANCE_OP).to.equal('summary');
  });

  it('t03 Soft: journal side-effect parity Soft (AC-M10) · MCP create → same ndjson as CLI Action', async () => {
    const router = stubRouter();
    const debtRoot = path.join(tempRoot, 'debt');
    const affirm = async () => 'да';

    const mcpCreate = await executeFamilyAction({
      toolId: 'debt.create',
      args: {
        wallet: 'tristan',
        debtId: 'mcp04-d1',
        amount: '80',
        reason: 'mcp-loan',
      },
      router,
      debtRoot,
      limitsPath: DEBT_EXAMPLE_LIMITS,
      decimals: 0,
      now: NOW,
      confirmFn: affirm,
      isTty: true,
    });
    expect(mcpCreate.ok).to.equal(true);
    expect(mcpCreate.action).to.equal(6);
    expect(mcpCreate.isolatedEnv.CAPYBARA_DEBT_OP).to.equal('create');
    expect(mcpCreate.result.remainder).to.equal('80');
    expect(process.env.CAPYBARA_WALLET).to.equal(undefined);

    const journalPath = getChildDebtPath({
      child: 'tristan',
      scope: SCOPE,
      debtRoot,
      mode: 'mock',
    });
    const events = await readDebtEvents(journalPath);
    expect(events.some((e) => e.debt_id === 'mcp04-d1' && e.comment === 'mcp-loan')).to.equal(
      true,
    );

    // CLI-parity Soft: same DebtLedgerAction + env writers (not alternate math)
    const cliShow = await new DebtLedgerAction(router, {
      debtRoot,
      limitsPath: DEBT_EXAMPLE_LIMITS,
      decimals: 0,
      now: NOW,
      confirmFn: affirm,
      isTty: true,
      env: {
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'show',
        CAPYBARA_DEBT_ID: 'mcp04-d1',
      },
    }).execute();
    expect(cliShow.card.remainder).to.equal('80');
    expect(cliShow.card.original).to.equal('80');

    const mcpShow = await executeFamilyAction({
      toolId: 'debt.show',
      args: { wallet: 'tristan', debtId: 'mcp04-d1' },
      router,
      debtRoot,
      limitsPath: DEBT_EXAMPLE_LIMITS,
      decimals: 0,
      now: NOW,
    });
    expect(mcpShow.result.card.remainder).to.equal(cliShow.card.remainder);
  });

  it('t04 Soft: create/show/summary + one mutate each domain · parent allow Soft debt', async () => {
    const router = stubRouter();
    const debtRoot = path.join(tempRoot, 'debt');
    const advanceRoot = path.join(tempRoot, 'advance');
    const advanceLimits = await writeAdvanceLimits(tempRoot);
    const affirm = async () => 'да';

    const debtCreate = await executeFamilyAction({
      toolId: 'debt.create',
      args: {
        wallet: 'bastian',
        debtId: 'mcp04-d2',
        amount: '50',
        reason: 'soft',
      },
      router,
      debtRoot,
      limitsPath: DEBT_EXAMPLE_LIMITS,
      decimals: 0,
      now: NOW,
      confirmFn: affirm,
      isTty: true,
    });
    expect(debtCreate.result.remainder).to.equal('50');

    const debtSummary = await executeFamilyAction({
      toolId: 'debt.summary',
      args: { wallet: 'bastian' },
      router,
      debtRoot,
      limitsPath: DEBT_EXAMPLE_LIMITS,
      decimals: 0,
      now: NOW,
    });
    expect(debtSummary.ok).to.equal(true);
    expect(debtSummary.action).to.equal(6);

    const debtShow = await executeFamilyAction({
      toolId: 'debt.show',
      args: { wallet: 'bastian', debtId: 'mcp04-d2' },
      router,
      debtRoot,
      limitsPath: DEBT_EXAMPLE_LIMITS,
      decimals: 0,
      now: NOW,
    });
    expect(debtShow.result.card.remainder).to.equal('50');

    const debtForgive = await executeFamilyAction({
      toolId: 'debt.forgive',
      args: {
        wallet: 'bastian',
        debtId: 'mcp04-d2',
        percent: '20',
        reason: 'part',
      },
      router,
      debtRoot,
      limitsPath: DEBT_EXAMPLE_LIMITS,
      decimals: 0,
      now: NOW,
      confirmFn: affirm,
      isTty: true,
    });
    expect(debtForgive.result.remainder).to.equal('40');

    const advanceIssue = await executeFamilyAction({
      toolId: 'advance.issue',
      args: {
        wallet: 'tristan',
        advanceId: 'mcp04-a1',
        amount: '400',
        reason: 'activity float',
      },
      router,
      advanceRoot,
      limitsPath: advanceLimits,
      decimals: 8,
      confirmFn: affirm,
      isTty: true,
    });
    expect(advanceIssue.ok).to.equal(true);
    expect(advanceIssue.action).to.equal(7);
    expect(advanceIssue.result.txHash).to.equal('mock:mcp04-a1');

    const advPath = getChildAdvancePath({
      child: 'tristan',
      scope: SCOPE,
      advanceRoot,
      mode: 'mock',
    });
    const advEvents = await readAdvanceEvents(advPath);
    expect(advEvents).to.have.length(1);
    expect(advEvents[0].tx_hash).to.equal('mock:mcp04-a1');

    const advanceShow = await executeFamilyAction({
      toolId: 'advance.show',
      args: { wallet: 'tristan', advanceId: 'mcp04-a1' },
      router,
      advanceRoot,
      limitsPath: advanceLimits,
      decimals: 8,
    });
    expect(advanceShow.ok).to.equal(true);

    const advanceSummary = await executeFamilyAction({
      toolId: 'advance.summary',
      args: { wallet: 'tristan' },
      router,
      advanceRoot,
      limitsPath: advanceLimits,
      decimals: 8,
    });
    expect(advanceSummary.ok).to.equal(true);

    // Parent allow Soft (mapped debt.view) — Soft≠Live · advance.* RoleGate residual honest
    const store = new MembershipStore();
    store.createFamily({ id: 'fam-mcp04' });
    const parent = store.addMembership({
      id: 'm-parent-mcp04',
      familyId: 'fam-mcp04',
      role: 'parent',
      address: '0xparentmcp040000000000000000000000000001',
      userId: 'user-parent-mcp04',
    });
    const sessions = new BearerSessionStore();
    const nowMs = 1_700_000_000_000;
    const fixtureConfig = {
      supabaseUrl: FIXTURE_AUTH_ENV.SUPABASE_URL,
      supabaseKey: FIXTURE_AUTH_ENV.SUPABASE_SECRET_KEY,
      bearerSecret: FIXTURE_AUTH_ENV.CAPY_BEARER_SECRET,
    };
    const session = issueBearerSession(
      sessions,
      { userId: parent.userId, address: parent.address },
      fixtureConfig,
      { nowMs, ttlMs: 120_000 },
    );
    const runtime = createAuthRuntime(FIXTURE_AUTH_ENV, {
      membershipStore: store,
      sessionStore: sessions,
      nowMs,
    });
    const req = { headers: { authorization: `Bearer ${session.token}` } };

    const gatedDebt = await authorizeMcpToolCall({
      req,
      runtime,
      capabilityId: 'debt.create',
      familyId: 'fam-mcp04',
    });
    expect(gatedDebt.ok).to.equal(true);
    expect(gatedDebt.role).to.equal('parent');

    const server = createCapybaraMcpServer({
      req,
      runtime,
      router,
      executeHook: async ({ action }) => ({ soft: true, action }),
    });
    expect(server).to.be.ok;

    // parallel Soft: no process.env mutate
    delete process.env.CAPYBARA_WALLET;
    const captures = [];
    await Promise.all([
      executeFamilyAction({
        toolId: 'debt.summary',
        args: { wallet: 'tristan' },
        router,
        debtRoot,
        executeHook: async ({ isolatedEnv }) => {
          captures.push(isolatedEnv.CAPYBARA_WALLET);
          return { ok: true };
        },
      }),
      executeFamilyAction({
        toolId: 'debt.summary',
        args: { wallet: 'bastian' },
        router,
        debtRoot,
        executeHook: async ({ isolatedEnv }) => {
          captures.push(isolatedEnv.CAPYBARA_WALLET);
          return { ok: true };
        },
      }),
    ]);
    expect(captures.sort()).to.deep.equal(['bastian', 'tristan']);
    expect(process.env.CAPYBARA_WALLET).to.equal(undefined);
  });
});
