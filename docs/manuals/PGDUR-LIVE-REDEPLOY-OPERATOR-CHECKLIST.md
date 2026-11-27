# PGDUR live redeploy — operator checklist

**Story:** `STORY-SCR-CAPY-PGDUR-05-live-redeploy-journal-honesty` · **pkg:** `pkg-000102`  
**Skill:** code-documenter · **Soft≠Live** · **UTC scaffold note:** this checklist ≠ invent Live Pass  
**Evidence (this wave):** [`evidence/pgdur-live-redeploy-journal-residual.md`](evidence/pgdur-live-redeploy-journal-residual.md) — **Residual**

## Purpose

Document the operator sequence that would prove AC-P05 / AC-P08 live: after bootstrap + invite (+ optional accept) + sample journal write → Railway redeploy → membership / invite / verified proofs / journals still resolvable from Postgres.

## Soft product Present (code claims — ≠ Live Pass)

| Area | Soft claim | Path |
|------|------------|------|
| Membership / Invite Postgres | Host wires `PostgresMembershipStore` / `PostgresInviteStore` when supabase-js service client Present | `host/authHttp.js` durable compose |
| Verified AddressProof | `PostgresVerifiedAddressProofStore` after successful `/auth/verify` | `host/authHttp.js` · PGDUR-03 |
| Journals primary | Writers accept `journalStore` → `PostgresJournalStore` | `packages/core/src/journals/` · PGDUR-04 |
| Mode | `mock` \| `gfl_reality` | journal rows / writers |
| Unit | `npm test` green Soft≠Live | ≠ REQ-12 Done / Live Pass (AC-P08) |

## Checklist (live — exercise only with real Railway + Supabase)

1. **Bootstrap** family founder (DualAuth) against live host.
2. **Create invite** (INV-04) · optional **accept** one membership (INV-05).
3. **Verify** address-proof once → row expected in `verified_address_proofs` (Soft path Present).
4. **Sample journal write** with `journalStore` / Postgres primary (activity and/or advance/debt) · `mode` intact.
5. **Railway redeploy** / restart host process.
6. **Resolve after redeploy:**
   - prior memberships resolvable (DualAuth / RoleGate) — AC-P05 / EDGE-08 AC-G8-01
   - open invite still accept-able until accepted/expired — AC-G8-02 class
   - verified proofs readable from Postgres
   - journal primary rows readable from Postgres (not NDJSON sole SoT)
7. **AC-P07 spot-check:** health + auth error responses remain non-leaking (no secrets/stack dumps in body).
8. Record under `docs/manuals/evidence/`:
   - **Pass** only with on-disk live proof, **or**
   - **Residual** if any step Absent / not exercised.

## Honesty locks

| Lock | Rule |
|------|------|
| Soft≠Live | Soft product / unit ≠ invent Live Pass |
| AC-P08 | `npm test` alone ≠ Done · live redeploy + journal primary read required for Live Pass |
| AC-P09 | Evidence/manual must be on-disk under `docs/manuals/` |
| EDGE-08 | Update disposition to Pass **only** when live Pass Present · else keep Residual |
| REQ-12 / Phase 3 | Accept **only** after operator live Pass — **not** claimed this wave |

## This wave result

Live redeploy + journal primary read on Railway: **Absent** → label **Residual** · checklist Present · ≠ invent Pass.
