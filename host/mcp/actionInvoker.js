'use strict';

/**
 * MCP-03/04/05 Soft — Action ctor / executeFamilyAction with isolated env + confirm_token.
 * Never bare `router.route` on HTTP · never mutate process.env for tool args.
 * Soft≠Live · ≠ invent Phase 4 Done / Live Pass / REQ-12 Accept / Redis confirm store.
 */

const {
  getFamilyMcpTool,
  mapArgsToCapybaraEnv,
} = require('./toolRegistry');
const {
  loadAndValidateConfig,
} = require('../../packages/core/src/config/build');
const SweepToParentAction = require('../../packages/core/src/actions/SweepToParentAction');
const DailyPaymentsAction = require('../../packages/core/src/actions/DailyPaymentsAction');
const ChargeToPoolAction = require('../../packages/core/src/actions/ChargeToPoolAction');
const ActivityPayoutAction = require('../../packages/core/src/actions/ActivityPayoutAction');
const {
  DebtLedgerAction,
} = require('../../packages/core/src/actions/DebtLedgerAction');
const {
  AdvanceLedgerAction,
} = require('../../packages/core/src/actions/AdvanceLedgerAction');
const {
  defaultConfirmTokenStore,
  hashPreviewPayload,
} = require('./confirmTokenStore');

/** @type {import('../../packages/core/src/CapybaraRouter') | null} */
let sharedRouter = null;

/**
 * Lazy host MCP bootstrap — CAPYBARA_LAZY_CONFIG=1 + exitOnError:false.
 * Reads host baseEnv (may include process.env snapshot) but does not write args into process.env.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [baseEnv]
 * @returns {Promise<import('../../packages/core/src/CapybaraRouter')>}
 */
async function bootstrapCapybaraRouter(baseEnv = process.env) {
  const env = {
    ...baseEnv,
    CAPYBARA_LAZY_CONFIG: '1',
  };
  const config = loadAndValidateConfig(env, { exitOnError: false });
  const CapybaraRouter = require('../../packages/core/src/CapybaraRouter');
  const router = new CapybaraRouter();
  // Prefer injected config Soft — avoid reloadConfig(process.env) race for host args.
  router.config = config;
  const { createCapybaraProvider } = require('../../packages/core/src/ProviderFactory');
  const WalletRegistry = require('../../packages/core/src/WalletRegistry');
  const CapyToken = require('../../packages/core/src/CapyToken');
  const { CapybaraActionsManager } = require('../../packages/core/src/actions/index');

  const { provider, rpcManager } = await createCapybaraProvider(config, router.logger);
  router.provider = provider;
  router.rpcManager = rpcManager;
  router.walletRegistry = new WalletRegistry(config, router.logger);
  const tokenAddress = String(config.token?.address ?? '').trim();
  if (tokenAddress) {
    router.capyToken = new CapyToken(
      provider,
      tokenAddress,
      router.walletRegistry,
      router.logger,
      { rpcManager, chainId: config.chainId, mode: config.mode },
    );
  } else {
    router.capyToken = null;
  }
  router.actionsManager = new CapybaraActionsManager(router);
  router.initialized = true;
  return router;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [baseEnv]
 * @returns {Promise<import('../../packages/core/src/CapybaraRouter')>}
 */
async function getSharedRouter(baseEnv) {
  if (sharedRouter) return sharedRouter;
  sharedRouter = await bootstrapCapybaraRouter(baseEnv);
  return sharedRouter;
}

/** Soft test helper — clear cached router. */
function resetSharedRouterForTests() {
  sharedRouter = null;
}

/**
 * Soft: which USER-MANUAL actions need confirm_token two-phase Soft.
 * Actions 2/3/6: always (even mock headless). Actions 4/7: only gfl_reality.
 * Action 0/1: no confirmPayment Soft.
 *
 * @param {number} action
 * @param {string} mode
 * @returns {boolean}
 */
function actionNeedsConfirmToken(action, mode) {
  if (action === 2 || action === 3 || action === 6) return true;
  if ((action === 4 || action === 7) && mode === 'gfl_reality') return true;
  return false;
}

/**
 * Soft: resolve actor membership id from MCP args (never trust clientClaimedRole for ACL).
 *
 * @param {Record<string, unknown> | null | undefined} args
 * @returns {string}
 */
function resolveActorMembershipId(args) {
  const a = args && typeof args === 'object' ? args : {};
  const id =
    (typeof a.actorMembershipId === 'string' && a.actorMembershipId.trim()) ||
    (typeof a.membershipId === 'string' && a.membershipId.trim()) ||
    '';
  return id || 'soft-anonymous-actor';
}

/**
 * Soft: extract confirm_token from args · single-shot `confirm: true` is NOT sole policy.
 *
 * @param {Record<string, unknown> | null | undefined} args
 * @returns {string}
 */
function resolveConfirmTokenArg(args) {
  const a = args && typeof args === 'object' ? args : {};
  if (typeof a.confirm_token === 'string' && a.confirm_token.trim()) {
    return a.confirm_token.trim();
  }
  if (typeof a.confirmToken === 'string' && a.confirmToken.trim()) {
    return a.confirmToken.trim();
  }
  return '';
}

/**
 * Build Action instance from isolated CAPYBARA_* env (no process.env mutate).
 *
 * @param {{
 *   tool: NonNullable<ReturnType<typeof getFamilyMcpTool>>,
 *   isolatedEnv: Record<string, string>,
 *   router: object,
 *   confirmFn?: (question: string) => Promise<string>,
 *   isTty?: boolean,
 *   debtRoot?: string,
 *   advanceRoot?: string,
 *   limitsPath?: string,
 *   decimals?: number,
 *   now?: Date,
 * }} input
 * @returns {{ kind: 'health' } | { kind: 'action', instance: { execute: () => Promise<object> } }}
 */
function createFamilyActionInstance(input) {
  const {
    tool,
    isolatedEnv,
    router,
    confirmFn,
    isTty,
    debtRoot,
    advanceRoot,
    limitsPath,
    decimals,
    now,
  } = input;

  if (tool.action === 0) {
    return { kind: 'health' };
  }

  if (tool.action === 1) {
    return {
      kind: 'action',
      instance: new SweepToParentAction(router, {
        walletName: isolatedEnv.CAPYBARA_WALLET,
        amountHuman: isolatedEnv.CAPYBARA_AMOUNT,
      }),
    };
  }

  if (tool.action === 2) {
    return {
      kind: 'action',
      instance: new DailyPaymentsAction(router, {
        walletName: isolatedEnv.CAPYBARA_WALLET,
        from: isolatedEnv.CAPYBARA_FROM ?? null,
        to: isolatedEnv.CAPYBARA_TO ?? null,
        confirmFn,
        isTty,
      }),
    };
  }

  if (tool.action === 3) {
    return {
      kind: 'action',
      instance: new ChargeToPoolAction(router, {
        walletName: isolatedEnv.CAPYBARA_WALLET,
        amountHuman: isolatedEnv.CAPYBARA_AMOUNT,
        splitRaw: isolatedEnv.CAPYBARA_SPLIT ?? null,
        confirmFn,
        isTty,
      }),
    };
  }

  if (tool.action === 4) {
    return {
      kind: 'action',
      instance: new ActivityPayoutAction(router, {
        walletName: isolatedEnv.CAPYBARA_WALLET,
        system: isolatedEnv.CAPYBARA_SYSTEM,
        level: isolatedEnv.CAPYBARA_LEVEL,
        period: isolatedEnv.CAPYBARA_PERIOD ?? null,
        subject: isolatedEnv.CAPYBARA_SUBJECT,
        activityType: isolatedEnv.CAPYBARA_ACTIVITY_TYPE,
        subtype: isolatedEnv.CAPYBARA_SUBTYPE ?? null,
        templateId: isolatedEnv.CAPYBARA_TEMPLATE_ID ?? null,
        metricValue: isolatedEnv.CAPYBARA_METRIC_VALUE,
        amountRaw: isolatedEnv.CAPYBARA_AMOUNT,
        skipPayout: isolatedEnv.CAPYBARA_SKIP_PAYOUT === '1',
        advanceId: isolatedEnv.CAPYBARA_ADVANCE_ID,
        confirmFn,
        isTty,
      }),
    };
  }

  if (tool.action === 6) {
    return {
      kind: 'action',
      instance: new DebtLedgerAction(router, {
        env: isolatedEnv,
        confirmFn,
        isTty,
        debtRoot,
        limitsPath,
        decimals,
        now,
      }),
    };
  }

  if (tool.action === 7) {
    return {
      kind: 'action',
      instance: new AdvanceLedgerAction(router, {
        env: isolatedEnv,
        confirmFn,
        isTty,
        advanceRoot,
        limitsPath,
        decimals,
      }),
    };
  }

  throw Object.assign(
    new Error(`Unsupported family MCP action: ${tool.action}`),
    { code: 'EMCP_ACTION_UNSUPPORTED' },
  );
}

/**
 * Soft health (action 0) — same semantics as ActionsManager.action0HealthCheck.
 *
 * @param {object} router
 * @returns {Promise<object>}
 */
async function executeHealthCheck(router) {
  const { config, walletRegistry, capyToken } = router;
  return {
    ok: true,
    action: 0,
    mode: config.mode,
    chainId: config.chainId,
    tokenAddress: config.token?.address,
    wallets: walletRegistry.listKnownWallets(),
    symbol: capyToken ? await capyToken.getSymbol() : null,
  };
}

/**
 * Execute family MCP tool via Action ctor + isolated env.
 * **Never** calls `router.route` · **never** assigns tool args onto process.env.
 * MCP-05 Soft: tools that need confirmPayment → two-phase preview + confirm_token
 * (single-shot `confirm: true` is NOT sole policy).
 *
 * @param {{
 *   toolId: string,
 *   args?: Record<string, unknown>,
 *   router?: object | null,
 *   baseEnv?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   confirmFn?: (question: string) => Promise<string>,
 *   isTty?: boolean,
 *   debtRoot?: string,
 *   advanceRoot?: string,
 *   limitsPath?: string,
 *   decimals?: number,
 *   now?: Date,
 *   confirmTokenStore?: import('./confirmTokenStore').ConfirmTokenStore,
 *   skipConfirmGate?: boolean,
 *   executeHook?: (ctx: {
 *     tool: object,
 *     isolatedEnv: Record<string, string>,
 *     action: number,
 *   }) => Promise<object> | object,
 * }} input
 * @returns {Promise<object>}
 */
async function executeFamilyAction(input) {
  const tool = getFamilyMcpTool(input.toolId);
  if (!tool) {
    throw Object.assign(new Error(`Unknown family MCP tool: ${input.toolId}`), {
      code: 'EMCP_TOOL_UNKNOWN',
    });
  }

  const isolatedEnv = mapArgsToCapybaraEnv(input.toolId, input.args);
  // Lock: do not mutate process.env for parallel Soft safety
  const priorWallet = process.env.CAPYBARA_WALLET;

  const router =
    input.router || (await getSharedRouter(input.baseEnv || process.env));

  const mode = String(router.config?.mode ?? 'mock');
  const needsToken =
    !input.skipConfirmGate && actionNeedsConfirmToken(tool.action, mode);
  const store = input.confirmTokenStore || defaultConfirmTokenStore;
  const actorMembershipId = resolveActorMembershipId(input.args);
  const confirmToken = resolveConfirmTokenArg(input.args);
  const previewHash = hashPreviewPayload({
    toolId: tool.name,
    isolatedEnv,
  });

  // Phase A Soft: mint token · do not commit Action side-effects
  if (needsToken && !confirmToken) {
    // Soft: reject sole-policy confirm:true without confirm_token
    const a = input.args && typeof input.args === 'object' ? input.args : {};
    if (a.confirm === true || a.confirm === 'true' || a.confirm === 1) {
      // still Phase A — invent single-shot sole policy forbidden Soft
    }
    const token = store.mint({
      toolId: tool.name,
      previewHash,
      actorMembershipId,
    });
    if (process.env.CAPYBARA_WALLET !== priorWallet) {
      throw Object.assign(
        new Error('actionInvoker must not mutate process.env.CAPYBARA_*'),
        { code: 'EMCP_ENV_MUTATE' },
      );
    }
    return {
      ok: true,
      soft: true,
      needs_confirm: true,
      confirm_token: token,
      toolId: tool.name,
      action: tool.action,
      mode,
      preview: {
        toolId: tool.name,
        action: tool.action,
        isolatedEnv,
        previewHash,
        actorMembershipId,
        mode,
      },
      isolatedEnv,
    };
  }

  // Phase B Soft: validate + consume token · affirm confirmFn
  let confirmFn = input.confirmFn;
  let isTty = input.isTty;
  if (needsToken && confirmToken) {
    const consumed = store.consume(confirmToken, {
      toolId: tool.name,
      previewHash,
      actorMembershipId,
    });
    if (!consumed.ok) {
      throw Object.assign(new Error(consumed.message), {
        code: consumed.code,
      });
    }
    confirmFn = async () => 'да';
    isTty = true;
  }

  if (typeof input.executeHook === 'function') {
    const hooked = await input.executeHook({
      tool,
      isolatedEnv,
      action: tool.action,
    });
    if (process.env.CAPYBARA_WALLET !== priorWallet) {
      throw Object.assign(
        new Error('actionInvoker must not mutate process.env.CAPYBARA_*'),
        { code: 'EMCP_ENV_MUTATE' },
      );
    }
    return {
      ok: true,
      soft: true,
      toolId: tool.name,
      action: tool.action,
      isolatedEnv,
      confirmed: needsToken,
      result: hooked,
    };
  }

  const built = createFamilyActionInstance({
    tool,
    isolatedEnv,
    router,
    confirmFn,
    isTty,
    debtRoot: input.debtRoot,
    advanceRoot: input.advanceRoot,
    limitsPath: input.limitsPath,
    decimals: input.decimals,
    now: input.now,
  });

  let result;
  if (built.kind === 'health') {
    result = await executeHealthCheck(router);
  } else {
    result = await built.instance.execute();
  }

  if (process.env.CAPYBARA_WALLET !== priorWallet) {
    throw Object.assign(
      new Error('actionInvoker must not mutate process.env.CAPYBARA_*'),
      { code: 'EMCP_ENV_MUTATE' },
    );
  }

  return {
    ok: true,
    soft: true,
    toolId: tool.name,
    action: tool.action,
    isolatedEnv,
    confirmed: needsToken,
    result,
  };
}

module.exports = {
  bootstrapCapybaraRouter,
  getSharedRouter,
  resetSharedRouterForTests,
  createFamilyActionInstance,
  executeHealthCheck,
  executeFamilyAction,
  actionNeedsConfirmToken,
  resolveActorMembershipId,
  resolveConfirmTokenArg,
  loadAndValidateConfigLazy(env) {
    return loadAndValidateConfig(
      { ...env, CAPYBARA_LAZY_CONFIG: '1' },
      { exitOnError: false },
    );
  },
};
