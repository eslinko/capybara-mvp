# 04 — Migration, coexistence, residual

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-27T17:23:20Z`  
**Interview locks:** Q6 A · Q10 A · closes EDGE-08 class when REQ-12 Accepted + live proof

## Cutover (REQ §2)

- Goal: **Postgres primary** for in-scope entities — dual-write file+DB is **not** the architecture goal.  
- Production host after implement must not treat wiped RAM as successful family state.

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

| Seam | Until implement | After Done |
|------|-----------------|------------|
| RAM Membership/Invite | SoT | Unit doubles only |
| NDJSON journals | SoT | Archive; primary = Postgres |
| Supabase Auth | Durable users | Unchanged |
| Challenge/Bearer/SignToken | Ephemeral | Ephemeral |
| CLI ungated paths | Coexistence residual (REQ-05) | Unchanged OOS unless separate wave |

## Explicit not invented here

- NEW STORY keys for import / RLS  
- SQL file contents  
- Live Pass claims before evidence on disk  
