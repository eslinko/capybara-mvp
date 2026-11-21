# Env, verify, deploy residual

**Package:** [`00-overview.md`](./00-overview.md)  
**REQ:** [`../../requirements/07-railway-family-host.md`](../../requirements/07-railway-family-host.md) AC-H01 · AC-H02 · AC-H04 · AC-H05 · AC-H06  
**Interview:** DP7-A, DP8, DP9  
**Pointer:** arch-04 env classes for Phase 2 — [`../04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md`](../04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md)  
**HOST-03 as-of:** `2026-11-21T13:13:38Z`

## Env / fail-closed (Phase 1)

| Variable / class | Phase 1 |
|------------------|---------|
| `PORT` | **Required** — listen bind; missing → process fail-closed exit (Railway injects at runtime) |
| Supabase URL / server credentials | Documented class for Phase 2 — **not** required for AC-H01 |
| Session secret / challenge config | Phase 2 — not required for health |

Health must not leak env values.

## Topology (AC-H06) — live facts

| Piece | Fact (Railway MCP/CLI) |
|-------|------------------------|
| Project | **Capybara** · id `392ddb0c-3b4a-486b-854d-194bb054b32a` · workspace Zeya888 |
| Environment | `production` · id `e46c170d-7700-49c7-ab10-f9a5fdb0a15f` |
| Service | **host** · id `51b3ff02-fad6-48e5-9d0b-81249c7818e5` · one service MVP |
| Deploy | `railway up` from `capybara/` using HOST-02 `Dockerfile` + `railway.toml` · deployment `4c3626f1-816e-44d2-954f-c567fcc8af78` **SUCCESS** |
| Public URL | `https://host-production-54a9d4ce.up.railway.app` |

No invent: ids from MCP `create-project` / `create-service` / `generate-domain` + CLI deploy (not guessed).

## Verify surfaces

| Surface | What counts |
|---------|-------------|
| Unit (optional) | Health handler returns ok without secrets |
| Production entry | `npm start` (or image CMD) listens; `GET /health` → 200 |
| Live proof | Railway remote health OK (AC-H01) |
| Insufficient | `npm test` alone (AC-H04) · local `npm start` + curl alone |

## Live proof (AC-H01) — Present

```text
GET https://host-production-54a9d4ce.up.railway.app/health
→ HTTP 200  {"ok":true}
UTC: 2026-11-21T13:13:38Z
```

Logs: `capybara host listening on 8080` via `npm start` → `node host/start.js`.

## Honesty (AC-H04)

- Green `cd capybara && npm test` alone does **not** count as Phase 1 host Done.
- Local `PORT=… npm start` + curl is prep / residual — **not** a substitute for remote proof when claiming AC-H01.
- Phase 1 host Done for AC-H01 requires remote health Present (this section) — not unit suite alone.

## Deploy residual (historical / prep)

| Gate | Meaning |
|------|---------|
| Live | Project Capybara + one service + remote `/health` OK ← **Present** as-of HOST-03 |
| Local substitute | Local start + curl health = prep — **not** Phase 1 Done by itself |

## Coexistence

CLI (`package.json` `cli`) remains; host does not claim DualAuth product Done. DualAuth live = Phase 2 on same entry. Money/pool keys not required in browser/ChatGPT (AC-H05).

## Not in this doc

Invent Supabase key names · CI invent · multi-family fleet · invent project ids without MCP create.
