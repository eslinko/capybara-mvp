# P4 Audit — STORY-SCR-CAPY-EDGE-07 (auth user retest clean / G1)

- **Тип:** hard audit docs/ops vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-25
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-EDGE-07-auth-user-retest-clean.md`](../tasks/backlog-stories/capybara-identity-http-edge/STORY-SCR-CAPY-EDGE-07-auth-user-retest-clean.md)
- **Pkg:** [`pkg-000083-20261125-capy-edge-07-auth-user-retest-clean.yaml`](../tasks/capybara-active-packages/pkg-000083-20261125-capy-edge-07-auth-user-retest-clean.yaml)
- **Build window:** [`capybara-cursor-build-window--STORY-SCR-CAPY-EDGE-07-auth-user-retest-clean.md`](../tasks/run-reports/capybara-build-windows/capybara-cursor-build-window--STORY-SCR-CAPY-EDGE-07-auth-user-retest-clean.md)
- **Bullrun ($bullrun):** [`run-summary-20261125-1425-STORY-SCR-CAPY-EDGE-07-auth-user-retest-clean.md`](../tasks/run-reports/run-summary-20261125-1425-STORY-SCR-CAPY-EDGE-07-auth-user-retest-clean.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-EDGE/stories/STORY-SCR-CAPY-EDGE-07-auth-user-retest-clean/story-acceptance-gate-STORY-SCR-CAPY-EDGE-07-auth-user-retest-clean.md) → P3 **PASS** `2026-11-25T14:25:24Z` · OPEN=1 residual
- **Deliverables:** `docs/manuals/AUTH-USER-RETEST-CLEAN.md` · scenario Step 0 · `docs/manuals/evidence/auth-user-retest-clean-residual.md` · honesty cross-link
- **Code anchors (read):** `packages/core/src/auth/supabaseAuthPort.js` (`buildCapybaraAuthEmail` / `CAPYBARA_AUTH_EMAIL_DOMAIN`) · Grep `deleteUser` → docs-only
- **Метод:** Read/Glob/Grep only · no product edits · no invent live Admin Pass · no invent REQ-08 / Phase 2 Done
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-G1-01..03 | backlog story §Acceptance Criteria |
| Surface | Ops checklist + verify-absence procedure + residual evidence |
| OOS | Host invite/Sign UI · bootstrap · membership DDL · invent product delete API |
| Honesty | live Admin delete Residual labeled ≠ invent PASS |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-G1-01: Documented operator requirement — delete Auth user for retest address before Step 1 | `docs/manuals/AUTH-USER-RETEST-CLEAN.md` §1–§3 Present · `FAMILY-ONBOARDING-OPERATOR-SCENARIO.md` Step 0 links checklist | **Pass** |
| AC-G1-02: Verify-absence procedure + residual evidence Present (live Pass not invented — OPEN residual) | Checklist §4 Present · `evidence/auth-user-retest-clean-residual.md` labels Admin delete/absence **Residual** · Gate OPEN #1 | **Residual / OPEN** (procedure Pass; live absence **not** proven) |
| AC-G1-03: Clean does not claim REQ-08 / Phase 2 Done | Checklist lock + §5 · residual honesty table · `rg` hits are forbid-claims only | **Pass** |
| Synthetic email matches code | Docs `{normalizeAddress}@capybara.local` · code `supabaseAuthPort.js` L31–40 `CAPYBARA_AUTH_EMAIL_DOMAIN='capybara.local'` + `buildCapybaraAuthEmail` | **Pass** (pattern align) |
| No invent product delete API | Grep `deleteUser` under `capybara/**/*.{js,ts}` → **Absent** (only manual cites Admin `deleteUser`) · story OOS | **Pass** (OOS respected) |
| No invent live Admin Pass | Residual evidence L8–9 · scenario Step 0 Status Residual · gate OPEN=1 | **Pass** (honesty) |

**AC docs/ops verdict:** AC-G1-01 Pass · AC-G1-02 Residual (OPEN tracked) · AC-G1-03 Pass.

**Verdict: PASS** (DoD accepts labeled Residual; live delete Pass **not** invented)

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-EDGE-07 | 🟢 Done · gate PASS · OPEN=1 residual | **Confirm Done** for docs DoD · **OPEN=1** live delete/absence Residual |
| t01 operator-clean-checklist | 🟢 Done · AC-G1-01 | **Confirm Done** — checklist + Step 0 Present |
| t02 verify-absence | 🟢 Done · procedure + residual | **Confirm Done** (procedure) · **OPEN residual** live Admin |
| t03 evidence-honesty-note | 🟢 Done · AC-G1-03 | **Confirm Done** — UTC+host Residual · non-claim REQ-08/Phase 2 · honesty cross-link |
| Incomplete TASKED | — | **0** |

---

## 2. Findings by severity

| Severity | OPEN | CLOSED |
|----------|------|--------|
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 1 | 0 |
| Low | 0 | 0 |
| Info | 1 | 0 |

### OPEN

| ID | Severity | Finding | How close (disposition only — no impl) |
|----|----------|---------|----------------------------------------|
| **G-EDGE-07-LIVE-DELETE-ABSENCE** | Medium | Live Supabase Auth Admin delete + re-list absence **not exercised** this P3 (`evidence/auth-user-retest-clean-residual.md`). Prior bind example user may still exist. Blocks honest founder retest until operator runs clean or accepts labeled Residual. | Operator runs `AUTH-USER-RETEST-CLEAN.md` §3 against live Admin; replace residual with Pass evidence (UTC + project host + target + absence verified). Do **not** invent Pass from docs. |

### Residual / Info (not invent AC)

| ID | Note | How close (disposition only) |
|----|------|------------------------------|
| F-INFO-01 | Residual cites Railway host / project ref from prior SBPORT bind evidence — **not** re-verified delete this session (explicitly labeled) | Optional: re-cite host/project on live Pass evidence when delete exercised |

### **OPEN = 1** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Product invents delete API vs OOS | **None** — no `deleteUser` in JS/TS |
| Docs invent live delete Pass | **None** — Residual labeled |
| Docs invent REQ-08 / Phase 2 Done | **None** |
| Synthetic email drift vs port | **None** — matches `buildCapybaraAuthEmail` |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=1 (`G-EDGE-07-LIVE-DELETE-ABSENCE` Medium) · may P7/disposition/P8 per OP (VAL does not advance).
- No code/doc patches proposed; no invent AC; no invent live Admin Pass; no invent REQ-08/Phase 2 Done.
