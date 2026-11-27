'use strict';

/**
 * MCP-03 Soft≠Live — tools 0–4 via actionInvoker isolated env · AC-M04 exclude 51/52.
 * Soft unit ≠ invent Live Pass / Phase 4 Done.
 */

process.env.CAPYBARA_LAZY_CONFIG = '1';

const { expect } = require('chai');
const {
  FAMILY_MCP_TOOLS,
  EXCLUDED_MCP_TOOL_NAMES,
  listFamilyMcpToolNames,
  mapArgsToCapybaraEnv,
  assertNoExcludedToolsRegistered,
  getFamilyMcpTool,
} = require('../../host/mcp/toolRegistry');
const {
  executeFamilyAction,
  createFamilyActionInstance,
  loadAndValidateConfigLazy,
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
    },
  };
}

describe('MCP-03 tools 0–4 router wrap Soft≠Live', () => {
  afterEach(() => {
    resetSharedRouterForTests();
    delete process.env.CAPYBARA_WALLET;
    delete process.env.CAPYBARA_AMOUNT;
  });

  it('AC-M04: registry has tools 0–4 · excludes 51/52 / browser mint', () => {
    expect(assertNoExcludedToolsRegistered()).to.equal(true);
    const names = listFamilyMcpToolNames();
    for (const required of [
      'family.check',
      'capy.sweep',
      'payout.daily',
      'pool.charge',
      'activity.validate_payout',
    ]) {
      expect(names).to.include(required);
    }
    for (const excluded of EXCLUDED_MCP_TOOL_NAMES) {
      expect(names).to.not.include(excluded);
    }
    for (const t of FAMILY_MCP_TOOLS) {
      expect([0, 1, 2, 3, 4, 6, 7]).to.include(t.action);
      expect(t.action).to.not.equal(51);
      expect(t.action).to.not.equal(52);
    }
    createCapybaraMcpServer({});
  });

  it('t04 Soft: arg→CAPYBARA_* map USER-MANUAL (no invent fields)', () => {
    expect(mapArgsToCapybaraEnv('family.check', {})).to.deep.equal({});
    expect(
      mapArgsToCapybaraEnv('capy.sweep', { wallet: 'tristan', amount: '10.5' }),
    ).to.deep.equal({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_AMOUNT: '10.5',
    });
    expect(
      mapArgsToCapybaraEnv('payout.daily', {
        wallet: 'bastian',
        from: '2026-06-01',
        to: '2026-06-30',
      }),
    ).to.deep.equal({
      CAPYBARA_WALLET: 'bastian',
      CAPYBARA_FROM: '2026-06-01',
      CAPYBARA_TO: '2026-06-30',
    });
    expect(
      mapArgsToCapybaraEnv('pool.charge', {
        wallet: 'all',
        amount: '100',
        split: 'tristan:60,bastian:40',
      }),
    ).to.deep.equal({
      CAPYBARA_WALLET: 'all',
      CAPYBARA_AMOUNT: '100',
      CAPYBARA_SPLIT: 'tristan:60,bastian:40',
    });
    expect(
      mapArgsToCapybaraEnv('activity.validate_payout', {
        wallet: 'tristan',
        system: 'cidead',
        level: 'primaria-3',
        subject: 'matematicas',
        activityType: 'control',
        metricValue: '8.5',
        skipPayout: true,
        advanceId: 'adv-1',
      }),
    ).to.include({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_SYSTEM: 'cidead',
      CAPYBARA_SKIP_PAYOUT: '1',
      CAPYBARA_ADVANCE_ID: 'adv-1',
    });
  });

  it('t03 Soft: lazy config bootstrap exitOnError:false', () => {
    const config = loadAndValidateConfigLazy(FIXTURE_CAPY_ENV);
    expect(config.mode).to.equal('mock');
    expect(config.chainId).to.equal(31337);
    expect(() => loadAndValidateConfigLazy({})).to.throw(/required/i);
  });

  it('Soft family.check (action 0) via Action path · not router.route', async () => {
    const router = stubRouter();
    const out = await executeFamilyAction({
      toolId: 'family.check',
      args: {},
      router,
    });
    expect(out.ok).to.equal(true);
    expect(out.action).to.equal(0);
    expect(out.result.ok).to.equal(true);
    expect(out.result.symbol).to.equal('CAPY');
    expect(out.result.mode).to.equal('mock');
  });

  it('Soft per tool_id 0–4 class · Action ctor options from isolated env', () => {
    const router = stubRouter();
    const cases = [
      {
        toolId: 'capy.sweep',
        args: { wallet: 'tristan', amount: '1' },
        action: 1,
      },
      {
        toolId: 'payout.daily',
        args: { wallet: 'bastian', from: '2026-01-01' },
        action: 2,
      },
      {
        toolId: 'pool.charge',
        args: { wallet: 'tristan', amount: '5' },
        action: 3,
      },
      {
        toolId: 'activity.validate_payout',
        args: {
          wallet: 'tristan',
          system: 'cidead',
          level: 'primaria-3',
          subject: 'matematicas',
          activityType: 'control',
          metricValue: '8.5',
          amount: '0',
        },
        action: 4,
      },
    ];

    for (const c of cases) {
      const tool = getFamilyMcpTool(c.toolId);
      const isolatedEnv = mapArgsToCapybaraEnv(c.toolId, c.args);
      const affirm = async () => 'да';
      const built = createFamilyActionInstance({
        tool,
        isolatedEnv,
        router,
        confirmFn: affirm,
        isTty: true,
      });
      expect(built.kind).to.equal('action');
      expect(tool.action).to.equal(c.action);
      if (c.action === 1) {
        expect(built.instance.walletName).to.equal('tristan');
        expect(built.instance.amountHuman).to.equal('1');
      }
      if (c.action === 2) {
        expect(built.instance.walletName).to.equal('bastian');
        expect(built.instance.confirmFn).to.equal(affirm);
        expect(built.instance.isTty).to.equal(true);
      }
      if (c.action === 3) {
        expect(built.instance.amountHuman).to.equal('5');
      }
      if (c.action === 4) {
        expect(built.instance.walletName).to.equal('tristan');
        expect(built.instance.system).to.equal('cidead');
      }
    }
  });

  it('parallel Soft harness: two calls distinct env without cross-talk · no process.env mutate', async () => {
    delete process.env.CAPYBARA_WALLET;
    const router = stubRouter();
    const captures = [];
    const hook = async ({ isolatedEnv, action }) => {
      captures.push({ ...isolatedEnv, action });
      return { ok: true, softProbe: true };
    };

    const [a, b] = await Promise.all([
      executeFamilyAction({
        toolId: 'capy.sweep',
        args: { wallet: 'tristan', amount: '11' },
        router,
        executeHook: hook,
      }),
      executeFamilyAction({
        toolId: 'capy.sweep',
        args: { wallet: 'bastian', amount: '22' },
        router,
        executeHook: hook,
      }),
    ]);

    expect(a.isolatedEnv.CAPYBARA_WALLET).to.equal('tristan');
    expect(b.isolatedEnv.CAPYBARA_WALLET).to.equal('bastian');
    expect(captures).to.have.length(2);
    const wallets = captures.map((c) => c.CAPYBARA_WALLET).sort();
    expect(wallets).to.deep.equal(['bastian', 'tristan']);
    expect(process.env.CAPYBARA_WALLET).to.equal(undefined);
  });

  it('Soft callable with MCP-02 parent gate + invoker Soft (AC-M01 partial)', async () => {
    const store = new MembershipStore();
    store.createFamily({ id: 'fam-mcp03' });
    const parent = store.addMembership({
      id: 'm-parent-mcp03',
      familyId: 'fam-mcp03',
      role: 'parent',
      address: '0xparentmcp030000000000000000000000000001',
      userId: 'user-parent-mcp03',
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

    const gated = await authorizeMcpToolCall({
      req,
      runtime,
      capabilityId: 'profile.self',
      familyId: 'fam-mcp03',
    });
    expect(gated.ok).to.equal(true);
    expect(gated.role).to.equal('parent');

    const router = stubRouter();
    const invoked = await executeFamilyAction({
      toolId: 'family.check',
      args: { familyId: 'fam-mcp03' },
      router,
    });
    expect(invoked.ok).to.equal(true);
    expect(invoked.action).to.equal(0);

    const server = createCapybaraMcpServer({
      req,
      runtime,
      router,
      executeHook: async ({ action }) => ({ soft: true, action }),
    });
    expect(server).to.be.ok;
  });
});
