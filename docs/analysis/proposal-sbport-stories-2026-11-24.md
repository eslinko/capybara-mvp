# Proposal: SBPORT stories (REQ-09) — на согласование OP

**Дата:** `2026-11-24T13:28:48Z` · **Materialized:** `2026-11-24T13:41:00Z`  
**Статус:** **Approved + Materialized** (OP «апрув и запиши») · package Present  
**Guide:** [`../../../docs/methodology/Zeya888-builder-queue/guides/high-invent-risk-story-intake.md`](../../../docs/methodology/Zeya888-builder-queue/guides/high-invent-risk-story-intake.md)  
**Package (proposed):** [`../tasks/backlog-stories/capybara-live-supabase-auth-port/`](../tasks/backlog-stories/capybara-live-supabase-auth-port/) (**new** — not reuse `capybara-dual-auth`)  
**Epic key (proposed):** `EPIC-SCR-CAPY-SBPORT`  
**Story prefix:** `STORY-SCR-CAPY-SBPORT-*`  
**Inputs:** REQ-09 [`../requirements/09-live-supabase-auth-port.md`](../requirements/09-live-supabase-auth-port.md) · arch [`../architecture/09-live-supabase-auth-port/00-overview.md`](../architecture/09-live-supabase-auth-port/00-overview.md) · interview [`zeya888.target-tech-arch-interview-09-live-supabase-auth-port-2026-11-24.md`](./zeya888.target-tech-arch-interview-09-live-supabase-auth-port-2026-11-24.md)

---

## 1. Обоснование нарезки

| Story | Why separate |
|-------|----------------|
| **SBPORT-01** Live port create/link | Isolates C1–C2 invent-risk (synthetic email + Admin idempotency); core contract AC-S02 |
| **SBPORT-02** Host wiring fail-closed | Isolates C3–C5 (no silent memory; env keyMap; secrets hygiene) AC-S01/S03/S04 |
| **SBPORT-03** Packaging supabase-js | Isolates C6 image/Git packaging seam (arch F6) |
| **SBPORT-04** Live proof honesty | Isolates C7 / AC-S05 — unit ≠ Done; live Railway gate |

Four stories: auth invent-risk not buried inside packaging or docs-only. No fifth story for DDL/rebind/MCP (OOS REQ §3).

**Depends order:** `(01 ∥ 03) → 02 → 04`.

---

## 2. Proposed stories (one-liners)

| Key | Title | Depends | Primary AC |
|-----|-------|---------|------------|
| SBPORT-01 | Live `SupabaseAuthPort` Admin create/link (`@capybara.local`) | — (soft AUTH-02 Done) | AC-S02 |
| SBPORT-02 | Host config→live; no silent memory; secrets hygiene | SBPORT-01 | AC-S01 · S03 · S04 |
| SBPORT-03 | `@supabase/supabase-js` in `@capybara/core` + host image | soft SBPORT-01 | AC-S01 (runtime) · S04 class |
| SBPORT-04 | Live proof honesty / residual if no project | SBPORT-02, SBPORT-03 | AC-S05 |

**Skills (proposed):** 01/02 `javascript-pro` · 03 `devops-engineer` (fb `javascript-pro`) · 04 `code-documenter`.

---

## 3. Coverage matrix

| Id | Owner story | Arch lock | Verification |
|----|-------------|-----------|--------------|
| C1 synthetic email + Admin create/link | SBPORT-01 | [`../architecture/09-live-supabase-auth-port/01-port-contract-and-bind.md`](../architecture/09-live-supabase-auth-port/01-port-contract-and-bind.md) | unit (+ mock Admin); live in SBPORT-04 |
| C2 idempotent duplicate→link | SBPORT-01 | arch-09/01 | unit |
| C3 no silent memory when config Present | SBPORT-02 | [`../architecture/09-live-supabase-auth-port/02-host-wiring-env-fail-closed.md`](../architecture/09-live-supabase-auth-port/02-host-wiring-env-fail-closed.md) | unit host |
| C4 fail-closed missing/invalid env | SBPORT-02 | arch-09/02 | unit |
| C5 secrets not in health/auth errors | SBPORT-02 | arch-09/02 · AC-S04 | unit |
| C6 supabase-js in image | SBPORT-03 | [`../architecture/09-live-supabase-auth-port/03-packaging-verify-deploy-residual.md`](../architecture/09-live-supabase-auth-port/03-packaging-verify-deploy-residual.md) | packaging / Docker |
| C7 unit ≠ Done / live residual honesty | SBPORT-04 | arch-09/03 F9 · AC-S05 | manual / live residual |
| AC-S01 | SBPORT-02 (+03) | arch-09/02–03 | unit + live 04 |
| AC-S02 | SBPORT-01 | arch-09/01 | unit + live 04 |
| AC-S03 | SBPORT-02 | arch-09/02 | unit |
| AC-S04 | SBPORT-02 (+03) | arch-09/02–03 | unit |
| AC-S05 | SBPORT-04 | arch-09/03 | manual / live |

Owner story alone is **insufficient** — matrix rows required (guide §3).

---

## 4. Package resolve

| Decision | Path | Why |
|----------|------|-----|
| **new** | `capybara/docs/tasks/backlog-stories/capybara-live-supabase-auth-port/` | `capybara-dual-auth` AUTH-01…04 Done (modules); live port = Phase 2 REQ-09 separate package (same pattern as WPROOF vs AUTH) |

---

## 5. Explicit non-claims / OOS

- Journals / membership DDL → Phase 3  
- Address rebind · MCP/Skill · wallet UI (REQ-10 Accepted)  
- NEW STORY files until OP approve this proposal  
- Activating pkg-*.yaml / bullrun — not this file  

---

## 6. OP decision

| Field | Value |
|-------|-------|
| Approve stories + matrix as above? | **approved** (OP 2026-11-24) |
| Package slug OK? (`capybara-live-supabase-auth-port`) | **accepted** (default) |

**Materialized:** [`../tasks/backlog-stories/capybara-live-supabase-auth-port/`](../tasks/backlog-stories/capybara-live-supabase-auth-port/) · INDEX + EPIC + SBPORT-01…04. No P1.3 until operator go-ahead.
