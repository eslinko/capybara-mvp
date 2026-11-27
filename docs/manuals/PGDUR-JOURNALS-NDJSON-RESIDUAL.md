# PGDUR journals — NDJSON residual honesty

**Story:** STORY-SCR-CAPY-PGDUR-04 · **UTC note:** Soft≠Live  
**Code:** `packages/core/src/journals/` · `ndjsonLogWriter` / `advanceWriter` / `debtWriter` (`journalStore` inject)

## Locks

| Item | Status |
|------|--------|
| New writes with `journalStore` | **Postgres primary** (`activity_journal_entries` · `advance_journal_entries` · `debt_journal_entries`) + `mode` ∈ {`mock`,`gfl_reality`} |
| NDJSON under `logs/capybara/` | **Archive residual** — not sole SoT when `journalStore` Present |
| Bulk historical NDJSON import | **Not** Accept gate (OOS) |
| Dual-write-as-goal | **Not** required |
| Docs / `npm test` alone | ≠ invent REQ-12 Done / Live Pass |
| Live journal read / redeploy evidence | → **PGDUR-05** |

## Soft≠Live

Unit harness + this note ≠ invent Live Pass. Operator live read proof remains PGDUR-05.
