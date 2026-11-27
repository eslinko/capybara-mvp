'use strict';

/**
 * MCP-03/04 Soft — family MCP tools for USER-MANUAL actions 0–4 + 6/7 debt/advance (AC-M01 · AC-M04 · AC-M10 Soft).
 * Distinct from MCP-02 `mcpToolRegistry.js` gate stubs.
 * Soft≠Live · ≠ invent Phase 4 Done / Live Pass / REQ-12 Accept.
 */

const { z } = require('zod');

/** Explicit non-tools (AC-M04) — must never appear in FAMILY_MCP_TOOLS. */
const EXCLUDED_MCP_TOOL_NAMES = Object.freeze([
  'token.deploy',
  'token.mint',
  'browser.mint',
  'capy.deploy',
  'capy.mint',
  'action.51',
  'action.52',
]);

const GATE_ARGS = {
  familyId: z.string().optional(),
  clientClaimedRole: z.string().optional(),
  role: z.string().optional(),
};

const DEBT_COMMON_ARGS = {
  ...GATE_ARGS,
  wallet: z.string(),
  debtId: z.string().optional(),
  amount: z.string().optional(),
  reason: z.string().optional(),
  percent: z.string().optional(),
  all: z.union([z.boolean(), z.string()]).optional(),
  due: z.string().optional(),
  dueClear: z.union([z.boolean(), z.string()]).optional(),
  fineId: z.string().optional(),
  overrideReason: z.string().optional(),
  operationId: z.string().optional(),
  sanctionType: z.string().optional(),
  sanctionId: z.string().optional(),
  dates: z.string().optional(),
  decisions: z.string().optional(),
  cancelReason: z.string().optional(),
};

const ADVANCE_COMMON_ARGS = {
  ...GATE_ARGS,
  wallet: z.string(),
  advanceId: z.string().optional(),
  amount: z.string().optional(),
  reason: z.string().optional(),
  overrideReason: z.string().optional(),
};

/**
 * REQ §3.1–3.4 tool_ids → action number + RoleGate capabilityId + USER-MANUAL arg shape.
 *
 * @type {ReadonlyArray<{
 *   name: string,
 *   action: number,
 *   capabilityId: string,
 *   debtOp?: string,
 *   advanceOp?: string,
 *   description: string,
 *   inputSchema: Record<string, unknown>,
 * }>}
 */
const FAMILY_MCP_TOOLS = Object.freeze([
  {
    name: 'family.check',
    action: 0,
    capabilityId: 'profile.self',
    description:
      'USER-MANUAL action 0 — health/mode/wallets check (nothing moves)',
    inputSchema: { ...GATE_ARGS },
  },
  {
    name: 'capy.sweep',
    action: 1,
    capabilityId: 'capy.return_to_parent',
    description: 'USER-MANUAL action 1 — sweep child $CAPY → parent',
    inputSchema: {
      ...GATE_ARGS,
      wallet: z.string(),
      amount: z.string().optional(),
    },
  },
  {
    name: 'payout.daily',
    action: 2,
    capabilityId: 'payout.fixed_edu_daily',
    description: 'USER-MANUAL action 2 — daily payments reconcile + payout',
    inputSchema: {
      ...GATE_ARGS,
      wallet: z.string(),
      from: z.string().optional(),
      to: z.string().optional(),
    },
  },
  {
    name: 'pool.charge',
    action: 3,
    capabilityId: 'multi_child.debit',
    description: 'USER-MANUAL action 3 — charge child/all into pool',
    inputSchema: {
      ...GATE_ARGS,
      wallet: z.string(),
      amount: z.string(),
      split: z.string().optional(),
    },
  },
  {
    name: 'activity.validate_payout',
    action: 4,
    capabilityId: 'education.records',
    description:
      'USER-MANUAL action 4 — activity validate + optional $CAPY payout',
    inputSchema: {
      ...GATE_ARGS,
      wallet: z.string(),
      system: z.string(),
      level: z.string(),
      subject: z.string(),
      activityType: z.string(),
      metricValue: z.union([z.string(), z.number()]),
      period: z.string().optional(),
      subtype: z.string().optional(),
      templateId: z.string().optional(),
      amount: z.string().optional(),
      skipPayout: z.union([z.boolean(), z.string()]).optional(),
      advanceId: z.string().optional(),
    },
  },
  // REQ §3.3 debt journal (action 6)
  {
    name: 'debt.summary',
    action: 6,
    debtOp: 'summary',
    capabilityId: 'debt.view',
    description: 'USER-MANUAL action 6 — debt summary (read-only)',
    inputSchema: { ...GATE_ARGS, wallet: z.string() },
  },
  {
    name: 'debt.show',
    action: 6,
    debtOp: 'show',
    capabilityId: 'debt.view',
    description: 'USER-MANUAL action 6 — debt show (read-only)',
    inputSchema: { ...GATE_ARGS, wallet: z.string(), debtId: z.string() },
  },
  {
    name: 'debt.create',
    action: 6,
    debtOp: 'create',
    capabilityId: 'debt.create',
    description: 'USER-MANUAL action 6 — debt create',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  {
    name: 'debt.repay',
    action: 6,
    debtOp: 'repay',
    capabilityId: 'debt.repay',
    description: 'USER-MANUAL action 6 — debt repay (parent may operate)',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  {
    name: 'debt.forgive',
    action: 6,
    debtOp: 'forgive',
    capabilityId: 'debt.forgive',
    description: 'USER-MANUAL action 6 — debt forgive',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  {
    name: 'debt.fine',
    action: 6,
    debtOp: 'fine',
    capabilityId: 'debt.fine',
    description: 'USER-MANUAL action 6 — debt fine',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  {
    name: 'debt.cancel_fine',
    action: 6,
    debtOp: 'cancel-fine',
    capabilityId: 'debt.fine',
    description: 'USER-MANUAL action 6 — cancel fine',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  {
    name: 'debt.sanction_add',
    action: 6,
    debtOp: 'sanction-add',
    capabilityId: 'debt.sanction',
    description: 'USER-MANUAL action 6 — sanction add',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  {
    name: 'debt.sanction_cancel',
    action: 6,
    debtOp: 'sanction-cancel',
    capabilityId: 'debt.sanction',
    description: 'USER-MANUAL action 6 — sanction cancel',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  {
    name: 'debt.set_due',
    action: 6,
    debtOp: 'set-due',
    capabilityId: 'debt',
    description: 'USER-MANUAL action 6 — set due date',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  {
    name: 'debt.reconcile',
    action: 6,
    debtOp: 'reconcile',
    capabilityId: 'debt',
    description: 'USER-MANUAL action 6 — debt reconcile',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  {
    name: 'debt.resolve_closure',
    action: 6,
    debtOp: 'resolve-closure',
    capabilityId: 'debt',
    description: 'USER-MANUAL action 6 — resolve closure',
    inputSchema: { ...DEBT_COMMON_ARGS },
  },
  // REQ §3.4 advance journal (action 7) — capability aliases Soft residual for advance.* RoleGate
  {
    name: 'advance.summary',
    action: 7,
    advanceOp: 'summary',
    capabilityId: 'advance.view',
    description: 'USER-MANUAL action 7 — advance summary (read-only)',
    inputSchema: { ...GATE_ARGS, wallet: z.string() },
  },
  {
    name: 'advance.show',
    action: 7,
    advanceOp: 'show',
    capabilityId: 'advance.view',
    description: 'USER-MANUAL action 7 — advance show (read-only)',
    inputSchema: {
      ...GATE_ARGS,
      wallet: z.string(),
      advanceId: z.string(),
    },
  },
  {
    name: 'advance.issue',
    action: 7,
    advanceOp: 'issue',
    capabilityId: 'advance.create',
    description: 'USER-MANUAL action 7 — advance issue',
    inputSchema: { ...ADVANCE_COMMON_ARGS },
  },
  {
    name: 'advance.forgive',
    action: 7,
    advanceOp: 'forgive',
    capabilityId: 'advance.forgive',
    description: 'USER-MANUAL action 7 — advance forgive',
    inputSchema: { ...ADVANCE_COMMON_ARGS },
  },
  {
    name: 'advance.settle',
    action: 7,
    advanceOp: 'settle',
    capabilityId: 'advance.settle_ops',
    description: 'USER-MANUAL action 7 — advance settle (≠ action 3 charge)',
    inputSchema: { ...ADVANCE_COMMON_ARGS },
  },
]);

/**
 * @returns {ReadonlyArray<string>}
 */
function listFamilyMcpToolNames() {
  return FAMILY_MCP_TOOLS.map((t) => t.name);
}

/**
 * @param {string} toolName
 * @returns {(typeof FAMILY_MCP_TOOLS)[number] | undefined}
 */
function getFamilyMcpTool(toolName) {
  return FAMILY_MCP_TOOLS.find((t) => t.name === toolName);
}

/**
 * @param {Record<string, string>} env
 * @param {string} key
 * @param {unknown} value
 */
function putEnv(env, key, value) {
  if (value === undefined || value === null) return;
  const s = String(value).trim();
  if (s === '') return;
  env[key] = s;
}

/**
 * @param {Record<string, string>} env
 * @param {Record<string, unknown>} a
 */
function mapDebtArgsToEnv(env, a) {
  putEnv(env, 'CAPYBARA_WALLET', a.wallet);
  putEnv(env, 'CAPYBARA_DEBT_ID', a.debtId);
  putEnv(env, 'CAPYBARA_DEBT_AMOUNT', a.amount);
  putEnv(env, 'CAPYBARA_DEBT_REASON', a.reason);
  putEnv(env, 'CAPYBARA_DEBT_PERCENT', a.percent);
  putEnv(env, 'CAPYBARA_DEBT_DUE', a.due);
  putEnv(env, 'CAPYBARA_DEBT_FINE_ID', a.fineId);
  putEnv(env, 'CAPYBARA_DEBT_OVERRIDE_REASON', a.overrideReason);
  putEnv(env, 'CAPYBARA_DEBT_OPERATION_ID', a.operationId);
  putEnv(env, 'CAPYBARA_DEBT_SANCTION_TYPE', a.sanctionType);
  putEnv(env, 'CAPYBARA_DEBT_SANCTION_ID', a.sanctionId);
  putEnv(env, 'CAPYBARA_DEBT_DATES', a.dates);
  putEnv(env, 'CAPYBARA_DEBT_DECISIONS', a.decisions);
  putEnv(env, 'CAPYBARA_DEBT_CANCEL_REASON', a.cancelReason);
  if (a.all === true || a.all === '1' || a.all === 1 || a.all === 'true') {
    env.CAPYBARA_DEBT_ALL = 'true';
  } else if (typeof a.all === 'string' && a.all.trim()) {
    putEnv(env, 'CAPYBARA_DEBT_ALL', a.all);
  }
  if (
    a.dueClear === true ||
    a.dueClear === '1' ||
    a.dueClear === 1 ||
    a.dueClear === 'true'
  ) {
    env.CAPYBARA_DEBT_DUE_CLEAR = 'true';
  } else if (typeof a.dueClear === 'string' && a.dueClear.trim()) {
    putEnv(env, 'CAPYBARA_DEBT_DUE_CLEAR', a.dueClear);
  }
}

/**
 * @param {Record<string, string>} env
 * @param {Record<string, unknown>} a
 */
function mapAdvanceArgsToEnv(env, a) {
  putEnv(env, 'CAPYBARA_WALLET', a.wallet);
  putEnv(env, 'CAPYBARA_ADVANCE_ID', a.advanceId);
  putEnv(env, 'CAPYBARA_ADVANCE_AMOUNT', a.amount);
  putEnv(env, 'CAPYBARA_ADVANCE_REASON', a.reason);
  putEnv(env, 'CAPYBARA_ADVANCE_OVERRIDE_REASON', a.overrideReason);
}

/**
 * Map MCP tool args → USER-MANUAL CAPYBARA_* env object (isolated; never mutate process.env).
 *
 * @param {string} toolName
 * @param {Record<string, unknown> | null | undefined} args
 * @returns {Record<string, string>}
 */
function mapArgsToCapybaraEnv(toolName, args) {
  const a = args && typeof args === 'object' ? args : {};
  /** @type {Record<string, string>} */
  const env = {};
  const tool = getFamilyMcpTool(toolName);

  switch (toolName) {
    case 'family.check':
      break;
    case 'capy.sweep':
      putEnv(env, 'CAPYBARA_WALLET', a.wallet);
      putEnv(env, 'CAPYBARA_AMOUNT', a.amount);
      break;
    case 'payout.daily':
      putEnv(env, 'CAPYBARA_WALLET', a.wallet);
      putEnv(env, 'CAPYBARA_FROM', a.from);
      putEnv(env, 'CAPYBARA_TO', a.to);
      break;
    case 'pool.charge':
      putEnv(env, 'CAPYBARA_WALLET', a.wallet);
      putEnv(env, 'CAPYBARA_AMOUNT', a.amount);
      putEnv(env, 'CAPYBARA_SPLIT', a.split);
      break;
    case 'activity.validate_payout':
      putEnv(env, 'CAPYBARA_WALLET', a.wallet);
      putEnv(env, 'CAPYBARA_SYSTEM', a.system);
      putEnv(env, 'CAPYBARA_LEVEL', a.level);
      putEnv(env, 'CAPYBARA_PERIOD', a.period);
      putEnv(env, 'CAPYBARA_SUBJECT', a.subject);
      putEnv(env, 'CAPYBARA_ACTIVITY_TYPE', a.activityType);
      putEnv(env, 'CAPYBARA_SUBTYPE', a.subtype);
      putEnv(env, 'CAPYBARA_TEMPLATE_ID', a.templateId);
      putEnv(env, 'CAPYBARA_METRIC_VALUE', a.metricValue);
      putEnv(env, 'CAPYBARA_AMOUNT', a.amount);
      putEnv(env, 'CAPYBARA_ADVANCE_ID', a.advanceId);
      if (a.skipPayout === true || a.skipPayout === '1' || a.skipPayout === 1) {
        env.CAPYBARA_SKIP_PAYOUT = '1';
      } else if (typeof a.skipPayout === 'string' && a.skipPayout.trim()) {
        putEnv(env, 'CAPYBARA_SKIP_PAYOUT', a.skipPayout);
      }
      break;
    default:
      if (tool && tool.action === 6 && tool.debtOp) {
        env.CAPYBARA_DEBT_OP = tool.debtOp;
        mapDebtArgsToEnv(env, a);
        break;
      }
      if (tool && tool.action === 7 && tool.advanceOp) {
        env.CAPYBARA_ADVANCE_OP = tool.advanceOp;
        mapAdvanceArgsToEnv(env, a);
        break;
      }
      throw Object.assign(new Error(`Unknown family MCP tool: ${toolName}`), {
        code: 'EMCP_TOOL_UNKNOWN',
      });
  }

  return env;
}

/**
 * AC-M04 Soft: registry must not include 51/52 / browser mint class names.
 *
 * @returns {boolean}
 */
function assertNoExcludedToolsRegistered() {
  const names = new Set(listFamilyMcpToolNames());
  for (const excluded of EXCLUDED_MCP_TOOL_NAMES) {
    if (names.has(excluded)) return false;
  }
  for (const t of FAMILY_MCP_TOOLS) {
    if (t.action === 51 || t.action === 52) return false;
  }
  return true;
}

/**
 * REQ §3.3–3.4 Soft: all debt.* / advance.* tool_ids Present.
 *
 * @returns {boolean}
 */
function assertDebtAdvanceToolsRegistered() {
  const required = [
    'debt.summary',
    'debt.show',
    'debt.create',
    'debt.repay',
    'debt.forgive',
    'debt.fine',
    'debt.cancel_fine',
    'debt.sanction_add',
    'debt.sanction_cancel',
    'debt.set_due',
    'debt.reconcile',
    'debt.resolve_closure',
    'advance.summary',
    'advance.show',
    'advance.issue',
    'advance.forgive',
    'advance.settle',
  ];
  const names = new Set(listFamilyMcpToolNames());
  return required.every((id) => names.has(id));
}

module.exports = {
  FAMILY_MCP_TOOLS,
  EXCLUDED_MCP_TOOL_NAMES,
  listFamilyMcpToolNames,
  getFamilyMcpTool,
  mapArgsToCapybaraEnv,
  assertNoExcludedToolsRegistered,
  assertDebtAdvanceToolsRegistered,
};
