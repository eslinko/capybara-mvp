'use strict';

/**
 * MCP-05 Soft≠Live — ConfirmTokenStore RAM TTL 300s + two-phase confirm Soft (AC-M06).
 * Soft unit ≠ invent Live Pass / Phase 4 Done / Redis durable store.
 */

process.env.CAPYBARA_LAZY_CONFIG = '1';

const { expect } = require('chai');
const {
  ConfirmTokenStore,
  DEFAULT_TTL_MS,
  FORBIDDEN_DURABLE_BACKENDS,
  defaultConfirmTokenStore,
  hashPreviewPayload,
} = require('../../host/mcp/confirmTokenStore');
const {
  executeFamilyAction,
  actionNeedsConfirmToken,
  resetSharedRouterForTests,
} = require('../../host/mcp/actionInvoker');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');

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

function stubRouter(mode = 'mock') {
  const config = buildConfigFromEnv({
    ...FIXTURE_CAPY_ENV,
    CAPY_MODE: mode,
  });
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
      mode: config.mode,
      transfer() {
        throw new Error('on-chain transfer must not run Soft MCP-05 unit');
      },
    },
  };
}

describe('MCP-05 mode + confirm_token RAM Soft≠Live', () => {
  /** @type {ConfirmTokenStore} */
  let store;

  beforeEach(() => {
    store = new ConfirmTokenStore({ ttlMs: DEFAULT_TTL_MS });
    defaultConfirmTokenStore.clear();
  });

  afterEach(() => {
    resetSharedRouterForTests();
    store.clear();
    defaultConfirmTokenStore.clear();
  });

  it('t01 Soft: ConfirmTokenStore RAM TTL 300s · mint/peek/expire/one-shot', () => {
    expect(DEFAULT_TTL_MS).to.equal(300_000);
    expect(store.backend).to.equal('ram');
    expect(store.ttlMs).to.equal(300_000);

    let now = 1_000_000;
    const timed = new ConfirmTokenStore({
      ttlMs: 300_000,
      nowFn: () => now,
      idFn: () => 'tok-fixed-1',
    });
    const token = timed.mint({
      toolId: 'pool.charge',
      previewHash: 'abc',
      actorMembershipId: 'm-1',
    });
    expect(token).to.equal('tok-fixed-1');
    expect(timed.peek(token)).to.include({
      toolId: 'pool.charge',
      actorMembershipId: 'm-1',
    });

    const first = timed.consume(token, {
      toolId: 'pool.charge',
      previewHash: 'abc',
      actorMembershipId: 'm-1',
    });
    expect(first.ok).to.equal(true);
    const second = timed.consume(token, {
      toolId: 'pool.charge',
      previewHash: 'abc',
      actorMembershipId: 'm-1',
    });
    expect(second.ok).to.equal(false);
    expect(second.code).to.equal('EMCP_CONFIRM_TOKEN_UNKNOWN');

    const tok2 = timed.mint({
      toolId: 'payout.daily',
      previewHash: 'xyz',
      actorMembershipId: 'm-1',
    });
    now += 300_001;
    const expired = timed.consume(tok2, {
      toolId: 'payout.daily',
      previewHash: 'xyz',
      actorMembershipId: 'm-1',
    });
    expect(expired.ok).to.equal(false);
    expect(expired.code).to.equal('EMCP_CONFIRM_TOKEN_EXPIRED');
    expect(timed.peek(tok2)).to.equal(null);
  });

  it('t02 Soft: preview→token→execute wire · no sole confirm:true policy', async () => {
    const router = stubRouter('mock');
    const args = {
      wallet: 'tristan',
      amount: '5',
      actorMembershipId: 'm-parent-mcp05',
      confirm: true, // Soft: alone must NOT skip Phase A
    };

    const preview = await executeFamilyAction({
      toolId: 'pool.charge',
      args,
      router,
      confirmTokenStore: store,
      executeHook: async () => {
        throw new Error('Phase A must not commit Soft');
      },
    });
    expect(preview.needs_confirm).to.equal(true);
    expect(preview.confirm_token).to.be.a('string').and.have.length.above(8);
    expect(preview.preview.action).to.equal(3);
    expect(preview.preview.previewHash).to.equal(
      hashPreviewPayload({
        toolId: 'pool.charge',
        isolatedEnv: preview.isolatedEnv,
      }),
    );

    let hooked = 0;
    const executed = await executeFamilyAction({
      toolId: 'pool.charge',
      args: {
        ...args,
        confirm_token: preview.confirm_token,
      },
      router,
      confirmTokenStore: store,
      executeHook: async ({ action }) => {
        hooked += 1;
        return { soft: true, action };
      },
    });
    expect(executed.ok).to.equal(true);
    expect(executed.confirmed).to.equal(true);
    expect(executed.result.action).to.equal(3);
    expect(hooked).to.equal(1);

    // one-shot Soft: reuse denied
    try {
      await executeFamilyAction({
        toolId: 'pool.charge',
        args: {
          ...args,
          confirm_token: preview.confirm_token,
        },
        router,
        confirmTokenStore: store,
        executeHook: async () => ({ ok: true }),
      });
      expect.fail('reuse should throw');
    } catch (err) {
      expect(err.code).to.equal('EMCP_CONFIRM_TOKEN_UNKNOWN');
    }
  });

  it('t03 Soft: mock AC-M06 no live funds · reality money-class requires token', async () => {
    expect(actionNeedsConfirmToken(2, 'mock')).to.equal(true);
    expect(actionNeedsConfirmToken(3, 'mock')).to.equal(true);
    expect(actionNeedsConfirmToken(6, 'mock')).to.equal(true);
    expect(actionNeedsConfirmToken(4, 'mock')).to.equal(false);
    expect(actionNeedsConfirmToken(7, 'mock')).to.equal(false);
    expect(actionNeedsConfirmToken(4, 'gfl_reality')).to.equal(true);
    expect(actionNeedsConfirmToken(7, 'gfl_reality')).to.equal(true);
    expect(actionNeedsConfirmToken(0, 'mock')).to.equal(false);
    expect(actionNeedsConfirmToken(1, 'mock')).to.equal(false);

    const mockConfig = buildConfigFromEnv(FIXTURE_CAPY_ENV);
    expect(mockConfig.mode).to.equal('mock');
    expect(mockConfig.mode).to.not.equal('gfl_reality');

    const realityRouter = stubRouter('gfl_reality');
    const previewReality = await executeFamilyAction({
      toolId: 'advance.issue',
      args: {
        wallet: 'tristan',
        amount: '400',
        reason: 'float',
        advanceId: 'adv-mcp05',
        actorMembershipId: 'm-1',
      },
      router: realityRouter,
      confirmTokenStore: store,
    });
    expect(previewReality.needs_confirm).to.equal(true);
    expect(previewReality.mode).to.equal('gfl_reality');

    // mock action 4 Soft may skip token Soft (CLI skip parity)
    const mockRouter = stubRouter('mock');
    const activity = await executeFamilyAction({
      toolId: 'activity.validate_payout',
      args: {
        wallet: 'tristan',
        system: 'cidead',
        level: 'primaria-3',
        subject: 'matematicas',
        activityType: 'control',
        metricValue: '8.5',
        amount: '0',
        skipPayout: true,
      },
      router: mockRouter,
      confirmTokenStore: store,
      executeHook: async ({ action }) => ({ soft: true, action }),
    });
    expect(activity.needs_confirm).to.equal(undefined);
    expect(activity.ok).to.equal(true);
    expect(activity.action).to.equal(4);
  });

  it('t04 Soft: deny missing / expired / wrong-actor token', async () => {
    const router = stubRouter('mock');
    try {
      await executeFamilyAction({
        toolId: 'payout.daily',
        args: {
          wallet: 'bastian',
          actorMembershipId: 'm-1',
          confirm_token: 'nope',
        },
        router,
        confirmTokenStore: store,
        executeHook: async () => ({ ok: true }),
      });
      expect.fail('unknown token should throw');
    } catch (err) {
      expect(err.code).to.equal('EMCP_CONFIRM_TOKEN_UNKNOWN');
    }

    let now = 5_000_000;
    const timed = new ConfirmTokenStore({
      ttlMs: 1000,
      nowFn: () => now,
      idFn: () => 'tok-exp',
    });
    timed.mint({
      toolId: 'payout.daily',
      previewHash: hashPreviewPayload({
        toolId: 'payout.daily',
        isolatedEnv: { CAPYBARA_WALLET: 'bastian' },
      }),
      actorMembershipId: 'm-1',
    });
    // re-mint via executeFamilyAction preview for real hash
    const preview = await executeFamilyAction({
      toolId: 'payout.daily',
      args: { wallet: 'bastian', actorMembershipId: 'm-1' },
      router,
      confirmTokenStore: timed,
    });
    now += 2000;
    try {
      await executeFamilyAction({
        toolId: 'payout.daily',
        args: {
          wallet: 'bastian',
          actorMembershipId: 'm-1',
          confirm_token: preview.confirm_token,
        },
        router,
        confirmTokenStore: timed,
        executeHook: async () => ({ ok: true }),
      });
      expect.fail('expired should throw');
    } catch (err) {
      expect(err.code).to.equal('EMCP_CONFIRM_TOKEN_EXPIRED');
    }

    const preview2 = await executeFamilyAction({
      toolId: 'debt.forgive',
      args: {
        wallet: 'tristan',
        debtId: 'd1',
        percent: '10',
        reason: 'x',
        actorMembershipId: 'm-parent',
      },
      router,
      confirmTokenStore: store,
    });
    try {
      await executeFamilyAction({
        toolId: 'debt.forgive',
        args: {
          wallet: 'tristan',
          debtId: 'd1',
          percent: '10',
          reason: 'x',
          actorMembershipId: 'm-other',
          confirm_token: preview2.confirm_token,
        },
        router,
        confirmTokenStore: store,
        executeHook: async () => ({ ok: true }),
      });
      expect.fail('wrong actor should throw');
    } catch (err) {
      expect(err.code).to.equal('EMCP_CONFIRM_TOKEN_WRONG_ACTOR');
    }
  });

  it('t05 Soft: RAM-only · durable backend invent forbidden', () => {
    expect(store.assertRamOnly()).to.equal(true);
    expect(defaultConfirmTokenStore.assertRamOnly()).to.equal(true);
    expect(FORBIDDEN_DURABLE_BACKENDS).to.include('redis');
    expect(FORBIDDEN_DURABLE_BACKENDS).to.include('postgres');
    expect(() => new ConfirmTokenStore({ backend: 'redis' })).to.throw(
      /durable backend forbidden/i,
    );
    expect(() => new ConfirmTokenStore({ backend: 'postgres' })).to.throw(
      /EMCP_CONFIRM_DURABLE_FORBIDDEN|durable/i,
    );
  });
});
