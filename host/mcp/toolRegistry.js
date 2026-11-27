'use strict';

/**
 * MCP-03 Soft — family MCP tools for USER-MANUAL actions 0–4 (AC-M01 partial · AC-M04).
 * Distinct from MCP-02 `mcpToolRegistry.js` gate stubs.
 * Soft≠Live · ≠ invent Phase 4 Done / Live Pass · debt/advance OOS (MCP-04).
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

/**
 * REQ §3.1–3.2 tool_ids → action number + RoleGate capabilityId + USER-MANUAL arg shape.
 *
 * @type {ReadonlyArray<{
 *   name: string,
 *   action: number,
 *   capabilityId: string,
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

  const put = (key, value) => {
    if (value === undefined || value === null) return;
    const s = String(value).trim();
    if (s === '') return;
    env[key] = s;
  };

  switch (toolName) {
    case 'family.check':
      break;
    case 'capy.sweep':
      put('CAPYBARA_WALLET', a.wallet);
      put('CAPYBARA_AMOUNT', a.amount);
      break;
    case 'payout.daily':
      put('CAPYBARA_WALLET', a.wallet);
      put('CAPYBARA_FROM', a.from);
      put('CAPYBARA_TO', a.to);
      break;
    case 'pool.charge':
      put('CAPYBARA_WALLET', a.wallet);
      put('CAPYBARA_AMOUNT', a.amount);
      put('CAPYBARA_SPLIT', a.split);
      break;
    case 'activity.validate_payout':
      put('CAPYBARA_WALLET', a.wallet);
      put('CAPYBARA_SYSTEM', a.system);
      put('CAPYBARA_LEVEL', a.level);
      put('CAPYBARA_PERIOD', a.period);
      put('CAPYBARA_SUBJECT', a.subject);
      put('CAPYBARA_ACTIVITY_TYPE', a.activityType);
      put('CAPYBARA_SUBTYPE', a.subtype);
      put('CAPYBARA_TEMPLATE_ID', a.templateId);
      put('CAPYBARA_METRIC_VALUE', a.metricValue);
      put('CAPYBARA_AMOUNT', a.amount);
      put('CAPYBARA_ADVANCE_ID', a.advanceId);
      if (a.skipPayout === true || a.skipPayout === '1' || a.skipPayout === 1) {
        env.CAPYBARA_SKIP_PAYOUT = '1';
      } else if (typeof a.skipPayout === 'string' && a.skipPayout.trim()) {
        put('CAPYBARA_SKIP_PAYOUT', a.skipPayout);
      }
      break;
    default:
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

module.exports = {
  FAMILY_MCP_TOOLS,
  EXCLUDED_MCP_TOOL_NAMES,
  listFamilyMcpToolNames,
  getFamilyMcpTool,
  mapArgsToCapybaraEnv,
  assertNoExcludedToolsRegistered,
};
