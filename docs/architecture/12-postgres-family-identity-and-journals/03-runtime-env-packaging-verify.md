# 03 — Runtime, env, packaging, verify

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-27T17:23:20Z`  
**Interview locks:** Q7 A · Q8 A · Q9 A · Q11 A · Q12 A

## Runtime topology (Q9 A)

| Surface | Start / role |
|---------|----------------|
| Production host | Same Railway service · `npm start` (REQ-07/08) |
| Identity durable | Adapters composed in `createAuthRuntime` |
| Journals | Core writer seam used by CLI (and any future host callers) |
| Not in scope | Separate journal worker process |

## Env / fail-closed (Q7 A)

Reuse host Auth keyMap (arch-08 / arch-09) — **no new `DATABASE_URL` for MVP**:

| Class | Env key |
|-------|---------|
| `supabaseUrl` | `SUPABASE_URL` |
| `supabaseKey` | `SUPABASE_SECRET_KEY` (alias `SUPABASE_SERVICE_ROLE_KEY`) |
| `bearerSecret` | `CAPY_BEARER_SECRET` (session — unchanged ephemeral) |
| Bootstrap | `CAPY_POOL_ADDRESS`, `PARENT_ADDRESS` (unchanged) |

Missing/invalid Supabase env on production durable paths → fail-closed (AC-P06).  
No silent RAM-only SoT when durable mode expected.  
`/health` must not echo secrets or proof dumps (AC-P07 · Q12 A).

## Packaging (Q8 A · theme pack)

| Rule | Lock |
|------|------|
| DB client | `@supabase/supabase-js` already in `@capybara/core` — **no** new `pg` dep |
| Image | Workspace install must continue to ship the package (REQ-09 packaging) |
| Git ownership ≠ image packaging | Source in Git; runtime needs dependency **in image** — already applied for Auth |

## Verify surfaces (Q11 A)

| Surface | What counts |
|---------|-------------|
| Unit | Memory/test doubles + injectable store contracts; `npm test` |
| Live Done | Railway (or equivalent) redeploy → prior membership/invite resolvable + journal primary read (AC-P05/P08) |
| Not enough | Unit green alone (AC-P08) |

## Apply seam — existing Auth project (PGDUR-01 / AC-M02)

| Rule | Lock |
|------|------|
| Project | **Same** Supabase project family as Auth (REQ-09) — no new project invent |
| Source | Git `capybara/supabase/migrations/` |
| Operator path | [`../../../supabase/README.md`](../../../supabase/README.md) Soft≠Live apply notes |
| Env | Reuse `SUPABASE_URL` + secret key classes above |

## Operator evidence (AC-P09)

Redeploy + journal primary read evidence = PGDUR-05. Soft≠Live: migrations/docs alone ≠ Live Pass / REQ-12 Done (AC-M05 · AC-P08).
