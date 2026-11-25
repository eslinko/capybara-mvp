# P4 Audit — STORY-SCR-CAPY-EDGE-09 (live ACL `profile.self` / G9)

- **Тип:** hard audit live evidence + code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-25
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-EDGE-09-live-acl-profile-self-proof.md`](../tasks/backlog-stories/capybara-identity-http-edge/STORY-SCR-CAPY-EDGE-09-live-acl-profile-self-proof.md)
- **Pkg tip:** [`pkg-000091-20261125-capy-edge-09-live-acl-profile-self-proof.yaml`](../tasks/capybara-active-packages/pkg-000091-20261125-capy-edge-09-live-acl-profile-self-proof.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261125-1551-STORY-SCR-CAPY-EDGE-09-live-acl-profile-self-proof.md`](../tasks/run-reports/run-summary-20261125-1551-STORY-SCR-CAPY-EDGE-09-live-acl-profile-self-proof.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-EDGE/stories/STORY-SCR-CAPY-EDGE-09-live-acl-profile-self-proof/story-acceptance-gate-STORY-SCR-CAPY-EDGE-09-live-acl-profile-self-proof.md) → P3 **PASS** · Residual continued · OPEN TASKED=0 · npm 535
- **Deliverables:** `LIVE-ACL-PROFILE-SELF-PROOF.md` · `evidence/live-acl-profile-self-unauth-deny-result.md` · `evidence/live-acl-profile-self-residual.md` · scenario Step 6 · `edge09-live-acl-profile-self-honesty.test.js`
- **Code:** `host/capabilityProbe.js` DualAuth → CatalogAlias → RoleGate
- **Метод:** Read/Glob/Grep + live curl (Railway) + mocha EDGE-09 + `npm test` · no invent founder/cast Pass · no invent REQ-08 / Phase 2 Done
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-G9-01..04 | backlog story §Acceptance Criteria |
| DoD this wave | Unauth Pass + Residual honesty for founder/cast |
| OOS | Invent founder Pass · REQ-08 Accepted invent · Express CRUD |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-G9-01: Live unauth `profile.self` → deny | Evidence file 401 `EAUTH_DUAL_DENY` / `EAUTH_SESSION_MISSING` · **P4 re-curl** `https://capybara-mvp.up.railway.app/v1/capabilities/profile.self` → HTTP **401** same body | **Pass** |
| AC-G9-02: Live founder allow post-bootstrap | Residual evidence — Bearer **not** exercised · labeled Residual | **Residual** (not invent Pass) |
| AC-G9-03: Optional cast child/co-parent | Residual / skip — cast live Absent this session | **Residual / skip** |
| AC-G9-04: npm ≠ REQ-08 / Phase 2 Done | Checklist AC-I06 · unit honesty · residual honesty | **Pass** |
| Probe compose Present | `capabilityProbe.js` `PROFILE_SELF_PATH` DualAuth order | **Pass** (unit as-is) |
| Suite | EDGE-09 harness **4/4** · `npm test` **535** | **Pass** |

**AC DoD this wave:** AC-G9-01/04 Pass · AC-G9-02/03 Residual continued.

**Verdict: PASS** · OPEN TASKED = **0**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-EDGE-09 | 🟢 Done · Residual continued · OPEN=0 | **Confirm Done** for wave DoD · founder/cast still Residual |
| t01 live-unauth-deny | 🟢 Done Pass | **Confirm Pass** · live re-verified P4 |
| t02 live-founder-allow | 🟢 Done Residual | **Confirm Residual** |
| t03 optional-cast-roles | 🟢 Done Residual/skip | **Confirm Residual/skip** |
| t04 ac-i06-evidence-path | 🟢 Done Pass | **Confirm Pass** |
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

### Residual (not OPEN TASKED — story disposition)

| ID | Note | How close (disposition only) |
|----|------|------------------------------|
| R-G9-FOUNDER-ALLOW | AC-G9-02 live founder Bearer allow not exercised | Operator: AUTH-05 bootstrap → Bearer → probe allow · record Pass evidence · do not invent |
| R-G9-CAST | AC-G9-03 optional cast live Absent | When kids/Miguel Present: probe each role · or keep honesty skip |

### **OPEN = 0** (TASKED) · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Invent founder/cast live Pass | **None** |
| Invent REQ-08 Accepted / Phase 2 Done | **None** |
| Live unauth deny still 401 DualAuth | **Confirm** (P4 curl) |
| Full `npm test` green (535) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 TASKED · Residual continued (founder/cast) · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent founder Pass; no invent REQ-08 Accepted.
