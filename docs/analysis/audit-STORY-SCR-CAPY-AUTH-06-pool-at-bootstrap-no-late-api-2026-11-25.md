# P4 Audit — STORY-SCR-CAPY-AUTH-06 (pool at bootstrap; no late pool API / G7)

- **Тип:** hard audit docs/ops + code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-25
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-AUTH-06-pool-at-bootstrap-no-late-api.md`](../tasks/backlog-stories/capybara-dual-auth/STORY-SCR-CAPY-AUTH-06-pool-at-bootstrap-no-late-api.md)
- **Pkg tip:** [`pkg-000085-20261125-capy-auth-06-pool-at-bootstrap-no-late-api.yaml`](../tasks/capybara-active-packages/pkg-000085-20261125-capy-auth-06-pool-at-bootstrap-no-late-api.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261125-1501-STORY-SCR-CAPY-AUTH-06-pool-at-bootstrap-no-late-api.md`](../tasks/run-reports/run-summary-20261125-1501-STORY-SCR-CAPY-AUTH-06-pool-at-bootstrap-no-late-api.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-AUTH/stories/STORY-SCR-CAPY-AUTH-06-pool-at-bootstrap-no-late-api/story-acceptance-gate-STORY-SCR-CAPY-AUTH-06-pool-at-bootstrap-no-late-api.md) → P3 **PASS** `2026-11-25T15:01:37Z` · OPEN=0
- **Deliverables:** `docs/manuals/POOL-AT-BOOTSTRAP-NO-LATE-API.md` · scenario Step 5 B1 · IDENTITY §2 B1/env honesty
- **Code anchors:** `packages/core/src/auth/bootstrapPoolAndFounder.js` L120 `setPoolIdentity` · `MembershipStore.js` `setPoolIdentity` · Grep host — no late pool route
- **Lock:** B1 pool at bootstrap only · rejected B2
- **Метод:** Read/Glob/Grep only · no product edits · no invent late-pool API · no invent AC
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-G7-01..03 | backlog story §Acceptance Criteria |
| Surface | B1 contract docs + scenario Step 5 + env honesty; code confirms as-is |
| OOS | Late-pool attach API · `role=pool` · Phase 3 DDL |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-G7-01: Pool identity at bootstrap only (B1); no late pool founder API | Docs: `POOL-AT-BOOTSTRAP-NO-LATE-API.md` §1 · IDENTITY L38 B1. Code: sole caller of `setPoolIdentity` = `bootstrapPoolAndFounder.js` L120; host Grep no `/pool` create/attach route | **Pass** |
| AC-G7-02: Scenario Step 5 aligned to B1 (confirm/optional Sign; not `role=pool`) | `FAMILY-ONBOARDING-OPERATOR-SCENARIO.md` Step 5 L121–136 Contract Present AUTH-06/B1 · rejected B2 | **Pass** |
| AC-G7-03: Distinct `CAPY_POOL_ADDRESS` / `PARENT_ADDRESS` (values may equal) | IDENTITY §2 L34–35 · POOL-AT-BOOTSTRAP §3 · `.env.example` L38–50 distinct keys | **Pass** |
| Pool ≠ Membership `role=pool` | Membership core Grep `role=pool` → **Absent**; bootstrap sets founder `role=parent` + pool identity separately | **Pass** |
| Rejected B2 / no invent late API | Docs §4 · scenario Lock · no host late-pool surface | **Pass** |

**AC verdict: 3/3 Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-AUTH-06 | 🟢 Done · gate PASS · OPEN=0 | **Confirm Done** · B1 Present · code aligns |
| t01 pool-at-bootstrap-lock | 🟢 Done · AC-G7-01 | **Confirm Done** |
| t02 scenario-step5-align | 🟢 Done · AC-G7-02 | **Confirm Done** |
| t03 env-field-separation-honesty | 🟢 Done · AC-G7-03 | **Confirm Done** |
| Incomplete TASKED | — | **0** |

---

## 2. Findings by severity

| Severity | OPEN | CLOSED |
|----------|------|--------|
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 0 | 0 |
| Low | 0 | 0 |
| Info | 0 | 0 |

### Residual (not OPEN)

| ID | Note | How close (disposition only) |
|----|------|------------------------------|
| F-INFO-01 | Scenario title order still «… → pool» as narrative; Step 5 body correctly B1 confirm — not a product AC gap | Optional ops wording polish OOS |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Late pool founder HTTP introduced | **None** |
| `setPoolIdentity` called outside bootstrap | **None** (sole call site bootstrap) |
| `role=pool` membership invented | **None** |
| Env fields merged | **None** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent AC; no invent late-pool API.
