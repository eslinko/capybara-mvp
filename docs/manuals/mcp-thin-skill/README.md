# MCP thin Skill pack (Soft≠Live)

**Story:** `STORY-SCR-CAPY-MCP-06-thin-skill-bearer-no-keys` · Soft Present  
**Locks:** MCP path `/mcp` · Bearer secret only · privilege **none** in Skill (AC-M08) · **never** private keys (AC-M07)  
**Soft≠Live:** this pack Soft ≠ invent Live Pass / Phase 4 Done (MCP-07) · ≠ invent deep Skill store packaging

## Contents

| File | Role |
|------|------|
| [`INSTRUCTIONS.md`](./INSTRUCTIONS.md) | Operator UX + chat-cannot-grant-role (AC-M08) |
| [`mcp-client.config.json`](./mcp-client.config.json) | MCP client skeleton → `/mcp` + Bearer secret slot |
| [`KEYS-NEVER-CHECKLIST.md`](./KEYS-NEVER-CHECKLIST.md) | AC-M07 review assert |
| [`DEEP-SKILL-DEFERRED.md`](./DEEP-SKILL-DEFERRED.md) | Deep Skill store = later sibling REQ honesty |

## Operator quick path

1. Enable host MCP: `CAPY_MCP_ENABLED=1` (MCP-01 Soft Present).
2. Obtain Bearer out-of-band via `/auth/challenge` → `/auth/verify` (REQ-08/10 · Connector/wallet Sign).
3. Place Bearer in Skill secret / MCP auth header only (`Authorization: Bearer …`).
4. Point MCP client at `https://<HOST>/mcp` — see `mcp-client.config.json`.
5. Never paste `PARENT_*` / child / deployer private keys into Skill prompts or client payloads.

## Soft residual

- Soft unit: `tests/unit/mcp06-thin-skill-bearer-no-keys.test.js`
- Live tool Pass / deep store packaging: **Absent** by design Soft≠Live
