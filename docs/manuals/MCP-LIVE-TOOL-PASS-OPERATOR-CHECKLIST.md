# MCP live tool Pass — operator checklist (Soft≠Live · AC-M09)

**Story:** `STORY-SCR-CAPY-MCP-07-live-tool-pass-honesty` · **pkg:** `pkg-000112-20261127-capy-mcp-07-live-tool-pass-honesty`  
**Skill:** javascript-pro · **Soft≠Live** · this checklist ≠ invent Live Pass / Phase 4 Done  
**Evidence (this wave):** [`evidence/mcp-live-tool-pass-residual.md`](evidence/mcp-live-tool-pass-residual.md) — **Residual**  
**Thin Skill Soft:** [`mcp-thin-skill/README.md`](mcp-thin-skill/README.md) · **ACL residual:** [`ROLES-ACL-AND-CATALOG-DEFERRED.md`](ROLES-ACL-AND-CATALOG-DEFERRED.md)

## Purpose

Operator Soft surface for **AC-M09**: prove Live MCP tool Pass on production host entry (`npm start` / Railway) with `CAPY_MCP_ENABLED=1` + DualAuth Bearer → parent RoleGate, **or** honestly label **Residual**. Soft unit / `npm test` / REQ-13 text alone **never** flips Phase 4 Done.

## Soft product Present (code claims — ≠ Live Pass)

| Area | Soft claim | Path |
|------|------------|------|
| Host entry | `npm start` → `host/start.js` | `capybara/host/start.js` |
| MCP mount | `/mcp` only when `CAPY_MCP_ENABLED=1` (else fail-closed) | `capybara/host/mcp/mcpHttp.js` · `host/server.js` |
| DualAuth → RoleGate | Bearer → parent RoleGate on tools | `capybara/host/mcp/` (MCP-02 Soft) |
| Tools Soft | parent tools Soft (0–4 + debt/advance; e.g. `family.check`, `debt.*`, `advance.*`) | `capybara/host/mcp/toolRegistry.js` · Soft probe `mcpToolRegistry.js` |
| Thin Skill Soft | Bearer secret slot · `/mcp` URL | `docs/manuals/mcp-thin-skill/` |
| Unit Soft | MCP-01…06 Soft harness green | `cd capybara && npm test` · Soft≠Live |

## Honesty locks (AC-M09 · Soft≠Live)

| Lock | Rule |
|------|------|
| Soft≠Live | Soft MCP-01…06 Present / unit green ≠ invent Live Pass |
| AC-M09 | Unit / `npm test` / REQ-13 text alone ≠ Phase 4 Done |
| Pass | Only with **dated** evidence path under `docs/manuals/evidence/` after real production `/mcp` + DualAuth tool exercise |
| Residual | Live blocked / not exercised / ACL residual → label **Residual** + reason · **OK Soft** |
| Forbidden | Invent Live Pass · invent Phase 4 Done · invent REQ-08/12/13 Accept · empty Pass stubs |

## REQ-08 ACL residual (may block founder Live Pass)

Live founder/child ACL evidence remains **Residual** per [`ROLES-ACL-AND-CATALOG-DEFERRED.md`](ROLES-ACL-AND-CATALOG-DEFERRED.md) (Block A). Until Live ACL Pass clears, founder MCP tool Pass may honestly stay **Residual** — do **not** invent REQ-08 Accept from MCP Soft alone. Soft DualAuth edge Present ≠ Live ACL Accept.

## Checklist (live — exercise only with real Railway + MCP enabled)

1. **Confirm Soft code** on the image that will run: MCP Soft Present (`host/mcp/`, MCP-01…06 Soft Done).
2. **Enable MCP** on production host: `CAPY_MCP_ENABLED=1` (Railway / platform env — never bake into image).
3. **Redeploy / restart** same `npm start` process family if enable was Absent on prior deploy.
4. **Smoke host:** `GET /health` → ok (no secrets).
5. **Obtain Bearer** out-of-band: `/auth/challenge` → wallet Sign → `/auth/verify` (REQ-08/10 · Connector) — parent actor.
6. **Point MCP client** at `https://<HOST>/mcp` — Soft skeleton [`mcp-thin-skill/mcp-client.config.json`](mcp-thin-skill/mcp-client.config.json); place Bearer in secret slot only (AC-M07 keys-never).
7. **Call representative tools** with DualAuth (parent): at least one read-ish (`family.check` / `debt.summary` / `advance.summary`) and one gated money-class tool as Soft `toolRegistry.js` allows — record HTTP/MCP outcome (Pass or deny with honesty).
8. **Record under `docs/manuals/evidence/`:**
   - **Pass** only with dated on-disk live proof (UTC · host URL · tools exercised · Bearer class without leaking secrets), **or**
   - **Residual** if any step Absent / not exercised / ACL residual blocks founder Pass.

## Pass vs Residual rule (recording)

| Outcome | Claim |
|---------|-------|
| Production `/mcp` + DualAuth parent tool Pass with dated evidence path | Live tool **Pass** (still: ≠ invent Phase 4 Done elsewhere without operator Accept) |
| Live not exercised · enable Absent · redeploy pending · REQ-08 ACL Residual blocks | **Residual** + reason · checklist Present Soft · **not** Accepted |
| Soft unit / `npm test` green alone | Soft≠Live · **≠** Pass · **≠** Phase 4 Done (AC-M09) |

**Name ≠ create empty Pass stubs.** Residual evidence file is honesty artifact, not invent Pass.

## This wave result

Live MCP tool Pass on Railway with DualAuth: **Absent** → label **Residual** · checklist Present Soft · ≠ invent Pass / Phase 4 Done / REQ Accept.
