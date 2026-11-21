# Env, verify, deploy residual

**Package:** [`00-overview.md`](./00-overview.md)  
**REQ:** [`../../requirements/07-railway-family-host.md`](../../requirements/07-railway-family-host.md) AC-H01 · AC-H02 · AC-H04 · AC-H05  
**Interview:** DP7-A, DP8, DP9  
**Pointer:** arch-04 env classes for Phase 2 — [`../04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md`](../04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md)

## Env / fail-closed (Phase 1)

| Variable / class | Phase 1 |
|------------------|---------|
| `PORT` | **Required** — listen bind; missing → process fail-closed exit |
| Supabase URL / server credentials | Documented class for Phase 2 — **not** required for AC-H01 |
| Session secret / challenge config | Phase 2 — not required for health |

Health must not leak env values.

## Verify surfaces

| Surface | What counts |
|---------|-------------|
| Unit (optional) | Health handler returns ok without secrets |
| Production entry | `npm start` (or image CMD) listens; `GET /health` → 200 |
| Live proof | Railway remote health OK (AC-H01) |
| Insufficient | `npm test` alone (AC-H04) |

## Deploy residual

| Gate | Meaning |
|------|---------|
| Live | Project Capybara + one service + remote `/health` OK |
| Local substitute | Local start + curl health = prep / residual — **not** Phase 1 Done |

## Coexistence

CLI remains; host does not claim DualAuth product Done. Money/pool keys not required in browser/ChatGPT (AC-H05).

## Not in this doc

Invent exact Supabase key names · CI invent · claiming Phase 1 Done.
