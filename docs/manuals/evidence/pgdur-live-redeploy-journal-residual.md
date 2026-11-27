# PGDUR live redeploy + journal — Residual

**Label:** **Residual** (not Pass)  
**Story:** `STORY-SCR-CAPY-PGDUR-05-live-redeploy-journal-honesty` · **pkg:** `pkg-000102`  
**Date (UTC):** 2026-11-27T18:51:59Z  
**Checklist:** [`../PGDUR-LIVE-REDEPLOY-OPERATOR-CHECKLIST.md`](../PGDUR-LIVE-REDEPLOY-OPERATOR-CHECKLIST.md)  
**EDGE-08:** [`../MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md`](../MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md) — Residual continued

## Disposition

| Claim | State |
|-------|-------|
| Soft product (PGDUR-02…04 adapters / journals) | **Present** Soft≠Live |
| Live Railway redeploy exercise this wave | **Absent** |
| Live journal primary read after redeploy | **Absent** |
| Live Pass / REQ-12 Done / Phase 3 Done | **Not claimed** |
| EDGE-08 AC-G8-01/02 class | **Residual continued** (Pass not Present) |

## Why Residual (disk honesty)

- No on-disk live host evidence of bootstrap → invite → journal → Railway redeploy → Postgres resolve for this story.
- Soft unit / manuals alone ≠ invent Live Pass (AC-P08 · Soft≠Live).
- EDGE-08 disposition update to Pass **deferred** until live Pass Present.

## Soft code Present (not live proof)

- `host/authHttp.js` — Postgres membership/invite/verified proof when service client Present
- `packages/core/src/journals/` — `PostgresJournalStore` + writer `journalStore` inject (PGDUR-04)
- Unit suite Soft≠Live green — ≠ REQ-12 Accept

## Next (operator)

Run [`../PGDUR-LIVE-REDEPLOY-OPERATOR-CHECKLIST.md`](../PGDUR-LIVE-REDEPLOY-OPERATOR-CHECKLIST.md) on live Railway + Supabase → record **Pass** evidence → then EDGE-08 disposition may move from Residual.

## Honesty

Residual ≠ Accepted · `npm test` ≠ Done · no invent Pass.
