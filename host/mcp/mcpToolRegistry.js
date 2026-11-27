'use strict';

/**
 * MCP-02 Soft — parent-only privileged MCP tool registry (AC-M05).
 * Tool **bodies / Action invoke** OOS (MCP-03/04). Soft≠Live · ≠ invent Phase 4 Done.
 * Child tool grants **Absent** this REQ.
 */

/**
 * Soft parent-only stubs — capability aliases from catalogAliasSeed Soft Present.
 * Names are MCP tool_id; capabilityId feeds CatalogAlias→RoleGate.
 *
 * @type {ReadonlyArray<{ name: string, capabilityId: string, description: string }>}
 */
const PARENT_ONLY_MCP_TOOLS = Object.freeze([
  {
    name: 'debt.view',
    capabilityId: 'debt.view',
    description:
      'Soft MCP-02 gate probe (debt.view) — Action invoke OOS MCP-03/04',
  },
  {
    name: 'family.invite_member',
    capabilityId: 'family.invite_member',
    description:
      'Soft MCP-02 gate probe (family.invite_member) — Action invoke OOS',
  },
  {
    name: 'pool.view',
    capabilityId: 'pool.view',
    description: 'Soft MCP-02 gate probe (pool.view) — Action invoke OOS',
  },
]);

/**
 * @returns {ReadonlyArray<string>}
 */
function listParentOnlyMcpToolNames() {
  return PARENT_ONLY_MCP_TOOLS.map((t) => t.name);
}

/**
 * AC-M05 Soft: reject child-prefixed / child-grant tool ids.
 *
 * @param {string} toolName
 * @returns {boolean}
 */
function isChildMcpToolName(toolName) {
  if (typeof toolName !== 'string' || !toolName) return false;
  const n = toolName.toLowerCase();
  return (
    n.startsWith('child.') ||
    n.includes('.child.') ||
    n === 'child' ||
    n.startsWith('child_')
  );
}

/**
 * @returns {boolean} true when registry has zero child tool grants
 */
function assertNoChildToolsRegistered() {
  for (const t of PARENT_ONLY_MCP_TOOLS) {
    if (isChildMcpToolName(t.name)) return false;
  }
  return true;
}

module.exports = {
  PARENT_ONLY_MCP_TOOLS,
  listParentOnlyMcpToolNames,
  isChildMcpToolName,
  assertNoChildToolsRegistered,
};
