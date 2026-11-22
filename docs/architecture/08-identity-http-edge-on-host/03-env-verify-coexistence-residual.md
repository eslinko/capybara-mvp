# Env, verify, coexistence, residual

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-21T14:42:22Z`  
**REQ:** [`../../requirements/08-identity-http-edge-on-host.md`](../../requirements/08-identity-http-edge-on-host.md) AC-I05…I07 · Secrets  
**Interview:** DP1-A · DP5-A · DP9-A

## Env / fail-closed (production identity mode)

Host production **keyMap** (DP5-A) — maps to AUTH classes via `loadAuthEnvConfig`:

| Env name | Class / role |
|----------|----------------|
| `SUPABASE_URL` | `supabaseUrl` |
| `SUPABASE_SECRET_KEY` | `supabaseKey` (server secret; Dashboard «Secret key») |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional alias → same `supabaseKey` if secret key unset |
| `CAPY_BEARER_SECRET` | `bearerSecret` |
| `CAPY_POOL_ADDRESS` | Bootstrap pool setting (public address) |
| `PARENT_ADDRESS` | Bootstrap founder parent setting (public address) |
| `PORT` | Listen (REQ-07) |

Missing required auth classes in identity mode → fail-closed (no dual-auth, no gated capabilities).  
`GET /health` must not read or echo these values (AC-I05).

## Membership residual (DP1-A)

MembershipStore remains **in-memory** for Phase 2. Redeploy/restart clears family state → operator **re-bootstrap** (document in AC-I07 manual). Persistent membership/journals = Phase 3 — not this package.

## Verify surfaces (DP9-A)

| Surface | What |
|---------|------|
| Unit | Host compose + auth/gate wiring tests; `npm test` |
| Live | Railway (or local host) + challenge/verify/bootstrap + unauth probe deny; MetaMask via REQ-10 POC |
| Not enough | Unit green alone (AC-I06) |

## Operator manual (AC-I07)

Derivative stories must deliver manual: env checklist, bootstrap steps, residual after redeploy, link to REQ-10 POC commands. Path TBD in stories — name ≠ create in this arch run.

## Coexistence

| Seam | State |
|------|--------|
| CLI | Unchanged coexistence; product AC-I01 on host path |
| arch-07 host | Present; this package extends handlers only |
| REQ-09 | Live Supabase port — consume when Present |
| REQ-10 | Wallet/POC — consume when Present |
| Express CRUD | Still superseded |

## Deploy residual

| Gate | Meaning |
|------|---------|
| Live proof | Remote host identity edge + (with REQ-09/10) real bind/sign |
| Local substitute | Labeled residual if only local/`npm test` |
