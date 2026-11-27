# Proposal: PGDUR stories (REQ-12) — OP approve

**Дата:** `2026-11-27T17:47:34Z` · **Materialized:** `2026-11-27T17:47:34Z`  
**Статус:** **Approved + Materialized** (OP «апрув, запиши, можно сразу стори») · package Present  
**Guide:** [`../../../docs/methodology/Zeya888-builder-queue/guides/high-invent-risk-story-intake.md`](../../../docs/methodology/Zeya888-builder-queue/guides/high-invent-risk-story-intake.md)  
**Package:** [`../tasks/backlog-stories/capybara-postgres-family-identity-and-journals/`](../tasks/backlog-stories/capybara-postgres-family-identity-and-journals/) (**new**)  
**Epic key:** `EPIC-SCR-CAPY-PGDUR`  
**Story prefix:** `STORY-SCR-CAPY-PGDUR-*`  
**Inputs:** REQ-12 [`../requirements/12-postgres-family-identity-and-journals.md`](../requirements/12-postgres-family-identity-and-journals.md) · arch [`../architecture/12-postgres-family-identity-and-journals/00-overview.md`](../architecture/12-postgres-family-identity-and-journals/00-overview.md) · interview [`zeya888.target-tech-arch-interview-12-postgres-family-identity-and-journals-2026-11-27.md`](./zeya888.target-tech-arch-interview-12-postgres-family-identity-and-journals-2026-11-27.md)

---

## 1. Обоснование нарезки

| Story | Why separate |
|-------|----------------|
| **PGDUR-01** Git migrations | Isolates DDL path/table-name invent-risk; locks `capybara/supabase/migrations/` + table names before adapters |
| **PGDUR-02** Membership+Invite adapters | Isolates C1–C4 fail-closed / no silent RAM (AC-P01/P02/P06) |
| **PGDUR-03** Verified proof persist | Isolates C5–C6 auth-adjacent proof durability (AC-P03) |
| **PGDUR-04** Journals primary | Isolates C7–C8 cutover / mock split (AC-P04) |
| **PGDUR-05** Live redeploy honesty | Isolates AC-P05/P08/P09 Soft≠Live gate |

**Depends order:** `01 → (02 ∥ 03 ∥ 04) → 05`.

---

## 2. Proposed stories (one-liners)

| Key | Title | Depends | Primary AC |
|-----|-------|---------|------------|
| PGDUR-01 | Git-owned migrations + locked table names | — | foundation AC-P01…P04 |
| PGDUR-02 | Membership+Invite Postgres adapters; host fail-closed | PGDUR-01 | AC-P01 · P02 · P06 · P05 class |
| PGDUR-03 | Persist verified AddressProof only | soft PGDUR-01 | AC-P03 |
| PGDUR-04 | Journals Postgres primary (activity/advance/debt) | PGDUR-01 | AC-P04 |
| PGDUR-05 | Live redeploy + journal evidence honesty | PGDUR-02…04 | AC-P05 · P08 · P09 |

**Skills:** 01–04 `javascript-pro` · 05 `code-documenter`.

---

## 3. Coverage matrix

| Id | Owner story | Arch lock | Verification |
|----|-------------|-----------|--------------|
| C1 no silent RAM SoT when durable expected | PGDUR-02 | arch-12/01 · 03 | unit host |
| C2 fail-closed missing/invalid Supabase env | PGDUR-02 | arch-12/03 · AC-P06 | unit |
| C3 secrets not in health/auth errors | PGDUR-02 (+05) | arch-12/03 · AC-P07 | unit / manual |
| C4 client = supabase-js service (not invent `pg`) | PGDUR-01/02 | arch-12/01 | unit / packaging |
| C5 verified proof only post-verify; pending ephemeral | PGDUR-03 | arch-12/02 · AC-P03 | unit |
| C6 familyId on proof optional | PGDUR-03 | arch-12/02 | unit |
| C7 Postgres primary journals; no dual-write goal | PGDUR-04 | arch-12/04 · AC-P04 | unit |
| C8 NDJSON import not Accept gate | PGDUR-04/05 | arch-12/04 | OOS: optional later |
| C9 migration path + table names locked (no P3 invent) | PGDUR-01 | §4 below · arch-12/02 | migrations Present |
| AC-P01 | PGDUR-02 | arch-12/01 | unit + live 05 |
| AC-P02 | PGDUR-02 | arch-12/04 | unit + live 05 |
| AC-P03 | PGDUR-03 | arch-12/02 | unit + live 05 |
| AC-P04 | PGDUR-04 | arch-12/02·04 | unit + live 05 |
| AC-P05 | PGDUR-05 (+02) | arch-12/04 · EDGE-08 | live redeploy |
| AC-P06 | PGDUR-02 | arch-12/03 | unit |
| AC-P07 | PGDUR-02/05 | arch-12/03 | unit / manual |
| AC-P08 | PGDUR-05 | arch-12/03 | unit ≠ Done; live |
| AC-P09 | PGDUR-05 | arch-12/03 | manual evidence Present |

---

## 4. Migration path lock (OP 2026-11-27 — no invent at coding)

| Lock | Value |
|------|-------|
| Directory | `capybara/supabase/migrations/` |
| Filenames | `YYYYMMDDHHMMSS_<slug>.sql` (timestamp from `--print-utc-now` at implement) |
| Tables | `families` · `memberships` · `invites` · `verified_address_proofs` · `activity_journal_entries` · `advance_journal_entries` · `debt_journal_entries` |
| Journal mode | column `mode` ∈ {`mock`,`gfl_reality`} |
| Client | `@supabase/supabase-js` service only |
| OOS tables | challenge / bearer / sign_token |
| Project | Existing Supabase Auth project — do not invent new project |

Columns = fields from as-is stores + AddressProof + `mode` — not invent beyond REQ/arch/as-is.

---

## 5. Package resolve

| Decision | Path | Why |
|----------|------|-----|
| **new** | `capybara/docs/tasks/backlog-stories/capybara-postgres-family-identity-and-journals/` | No existing Phase 3 Postgres durability package; EDGE-08 Residual ≠ this epic |

---

## 6. Explicit non-claims / OOS

- Pending challenge / Bearer durability · address rebind · MCP · Express CRUD · mandatory NDJSON import · NEW `pg` driver · invent Pass without evidence  
- SQL file bodies created only at PGDUR-01 implement (name ≠ create empty SQL in this proposal wave)

---

## 7. Dashboard / §Now

- §Now stays **REQ-08 ACL** (Phase 2).  
- PGDUR-01…05 in Remaining + By package as Todo.
