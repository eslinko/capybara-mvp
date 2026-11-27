# 04 — Migration, coexistence, residual

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-27T20:24:44Z` (EDGE-13 Soft Present Soft≠Live) · prior draft `2026-11-27T20:01:22Z`  
**Interview locks:** Q6 A · Q10 A · closes EDGE-08 class when REQ-12 Accepted + live proof

## Cutover (REQ §2)

- Goal: **Postgres primary** for in-scope entities — dual-write file+DB is **not** the architecture goal.  
- Production host after implement must not treat wiped RAM as successful family state.

### EDGE-13 honesty — RAM vs production SoT

| Mode | When | SoT claim |
|------|------|-----------|
| Postgres | Auth config + `createClient` Present | Production primary Soft (PGDUR-02/03) |
| FailClosed | Missing/invalid config or client | Durable writes **deny** — FailClosed membership/invite **and** FailClosed verified proof (no unlabeled Memory proof SoT) |
| Memory inject | Unit / explicit `membershipStore`\|`inviteStore` inject | Test doubles only (AC-P08) — **not** live SoT |

Do **not** document host `npm start` as “Membership/Invite in-memory residual” when Soft Postgres compose Present. EDGE-13 Soft Present Soft≠Live · docs alone ≠ Live Pass — [`STORY-SCR-CAPY-EDGE-13-host-ram-store-honesty-cleanup`](../../tasks/backlog-stories/capybara-identity-http-edge/STORY-SCR-CAPY-EDGE-13-host-ram-store-honesty-cleanup.md).

## NDJSON history (Q6 A)

| Item | Lock |
|------|------|
| Accept gate | **No** mandatory bulk import of existing NDJSON |
| New writes | Postgres primary |
| Old files under `logs/capybara/` | Archive / residual; optional later import = out of this Accept |
| Mock split | Preserved in Postgres mode column / equivalent |

## DDL ownership (Q10 A)

- Migrations are **Git-owned** and applied to the Supabase project.  
- Exact path string TBD at implement (do not invent file bodies in this package — name ≠ create).  
- Runtime adapters assume schema Present; they do not auto-create tables ad hoc.

## EDGE-08 / G8 residual

Today ([`../../manuals/MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md`](../../manuals/MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md)):

- Membership + Invite wiped on redeploy = Residual.  
- Bearer / SignToken wipe allowed.

**When REQ-12 Done + live evidence:**

- AC-G8-01/02 class closed by Postgres membership/invite.  
- Bearer / SignToken / pending challenge remain ephemeral (not a defect).  
- Verified proofs + journals survive redeploy (AC-P03/P04).

## Coexistence matrix

| Seam | Soft as-of `2026-11-27` | After Live Done / REQ Accept |
|------|-------------------------|------------------------------|
| RAM Membership/Invite | Unit / inject doubles only; production = Postgres \| FailClosed | Unit doubles only |
| NDJSON journals | Soft Postgres writers Present; files archive residual | Archive; primary = Postgres |
| Supabase Auth | Durable users | Unchanged |
| Challenge/Bearer/SignToken | Ephemeral | Ephemeral |
| CLI ungated paths | Coexistence residual (REQ-05) | Unchanged OOS unless separate wave |

## Explicit not invented here

- NEW STORY keys for import / RLS  
- SQL file contents  
- Live Pass claims before evidence on disk  
