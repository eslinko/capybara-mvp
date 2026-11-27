# PGDUR Soft≠Live gate

**Story:** `STORY-SCR-CAPY-PGDUR-05` · **AC-P08** · **Date note:** Soft≠Live

## Forbidden invent

| Invent | Allowed? |
|--------|----------|
| Live Pass without on-disk Railway evidence | **No** |
| REQ-12 Done / Phase 3 Done from Soft unit alone | **No** |
| EDGE-08 Pass while Residual evidence | **No** |
| Docs / checklist alone as Live Pass | **No** |

## Required for Live Pass (future)

1. Live redeploy after bootstrap + invite (+ optional accept) + sample journal write.
2. Membership / invite / verified proofs / journals resolvable from Postgres after redeploy.
3. On-disk evidence under `docs/manuals/evidence/` labeled **Pass**.

## This wave

- Checklist Present: [`PGDUR-LIVE-REDEPLOY-OPERATOR-CHECKLIST.md`](PGDUR-LIVE-REDEPLOY-OPERATOR-CHECKLIST.md)
- Evidence labeled **Residual**: [`evidence/pgdur-live-redeploy-journal-residual.md`](evidence/pgdur-live-redeploy-journal-residual.md)
- `npm test` Soft≠Live ≠ Done for AC-P08 Live Pass
