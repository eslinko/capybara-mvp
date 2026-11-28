# MCP live tool Pass — Residual

**Label:** **Residual** (not Pass)  
**Story:** `STORY-SCR-CAPY-MCP-07-live-tool-pass-honesty` · **pkg:** `pkg-000112-20261127-capy-mcp-07-live-tool-pass-honesty`  
**Date (UTC):** 2026-11-28T07:25:03Z  
**Checklist:** [`../MCP-LIVE-TOOL-PASS-OPERATOR-CHECKLIST.md`](../MCP-LIVE-TOOL-PASS-OPERATOR-CHECKLIST.md)  
**ACL residual:** [`../ROLES-ACL-AND-CATALOG-DEFERRED.md`](../ROLES-ACL-AND-CATALOG-DEFERRED.md) — Residual continued

## Disposition

| Claim | State |
|-------|-------|
| Soft MCP-01…06 (host `/mcp`, DualAuth gate, tools, confirm_token, thin Skill) | **Present** Soft≠Live |
| Soft operator checklist (Live gate) | **Present** Soft |
| Live Railway `/mcp` + DualAuth tool Pass this wave | **Absent** |
| Live Pass / Phase 4 Done / REQ-08/12/13 Accept | **Not claimed** |
| REQ-08 Live ACL (founder/child) | **Residual** (deferred manual) |

## Why Residual (disk honesty)

- No on-disk live host evidence of `CAPY_MCP_ENABLED=1` → Bearer DualAuth → parent tool Pass on production `/mcp` for this story.
- Soft unit / manuals alone ≠ invent Live Pass (AC-M09 · Soft≠Live).
- REQ-08 Live ACL residual may block founder Pass until cleared — invent Accept forbidden.

## Soft code Present (not live proof)

- `capybara/host/start.js` · `capybara/host/server.js` · `capybara/host/mcp/mcpHttp.js` — Soft MCP mount
- Soft thin Skill: `docs/manuals/mcp-thin-skill/`
- Unit suite Soft≠Live green — ≠ Phase 4 Done (AC-M09)

## Next (operator)

Run [`../MCP-LIVE-TOOL-PASS-OPERATOR-CHECKLIST.md`](../MCP-LIVE-TOOL-PASS-OPERATOR-CHECKLIST.md) on live Railway with MCP enabled + DualAuth → record **Pass** evidence (dated path) → then disposition may move from Residual. Clear REQ-08 Live ACL residual when claiming founder Pass.

## Honesty

Residual ≠ Accepted · `npm test` ≠ Phase 4 Done · no invent Pass.
