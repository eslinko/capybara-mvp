'use strict';

/**
 * MCP-03 Soft — Action ctor / executeFamilyAction with isolated env.
 * Never bare `router.route` on HTTP · never mutate process.env for tool args.
 * Injectable confirmFn/isTty Soft for MCP-05 wire later.
 * Soft≠Live · ≠ invent Phase 4 Done / Live Pass · Express money CRUD OOS.
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
 * Build Action instance from isolated CAPYBARA_* env (no process.env mutate).
 *
 * @param {{
 *   tool: NonNullable<ReturnType<typeof getFamilyMcpTool>>,
 *   isolatedEnv: Record<string, string>,
 *   router: object,
 *   confirmFn?: (question: string) => Promise<string>,
 *   isTty?: boolean,
 * }} input
 * @returns {{ kind: 'health' } | { kind: 'action', instance: { execute: () => Promise<object> } }}
 */
function createFamilyActionInstance(input) {
  const { tool, isolatedEnv, router, confirmFn, isTty } = input;

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
 *
 * @param {{
 *   toolId: string,
 *   args?: Record<string, unknown>,
 *   router?: object | null,
 *   baseEnv?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   confirmFn?: (question: string) => Promise<string>,
 *   isTty?: boolean,
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
      result: hooked,
    };
  }

  const built = createFamilyActionInstance({
    tool,
    isolatedEnv,
    router,
    confirmFn: input.confirmFn,
    isTty: input.isTty,
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
  loadAndValidateConfigLazy(env) {
    return loadAndValidateConfig(
      { ...env, CAPYBARA_LAZY_CONFIG: '1' },
      { exitOnError: false },
    );
  },
};
