# P4 Audit — STORY-SCR-CAPY-WPROOF-09 (Sign POC founder bootstrap assist / G-POC-04)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-26
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-WPROOF-09-sign-poc-bootstrap-assist.md`](../tasks/backlog-stories/capybara-wallet-address-proof/STORY-SCR-CAPY-WPROOF-09-sign-poc-bootstrap-assist.md)
- **Pkg tip:** [`pkg-000093-20261126-capy-wproof-09-sign-poc-bootstrap-assist.yaml`](../tasks/capybara-active-packages/pkg-000093-20261126-capy-wproof-09-sign-poc-bootstrap-assist.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261126-1046-STORY-SCR-CAPY-WPROOF-09-sign-poc-bootstrap-assist.md`](../tasks/run-reports/run-summary-20261126-1046-STORY-SCR-CAPY-WPROOF-09-sign-poc-bootstrap-assist.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-WPROOF/stories/STORY-SCR-CAPY-WPROOF-09-sign-poc-bootstrap-assist/story-acceptance-gate-STORY-SCR-CAPY-WPROOF-09-sign-poc-bootstrap-assist.md) → P3 **PASS** `2026-11-26T10:47:41Z` · OPEN=0 · npm 548
- **Code anchors:** `host/signHttp.js` `buildBootstrapAssistBody` · `#btn-copy-bootstrap` · `#btn-post-bootstrap` · `#bootstrap-result` · `tests/unit/host-sign-poc-bootstrap-assist.test.js`
- **Метод:** Read/Glob/Grep + mocha WPROOF-09 + `npm test` · no invent live Pass · no founder-only invent
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-P05/P06 · AC-A06 · replay/missing-proof | backlog story §Acceptance Criteria |
| OOS | Split-bootstrap (A2) · late pool · INV-07 · invent live Pass |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-P05: Copy bootstrap JSON from captured proof | `#btn-copy-bootstrap` · `buildBootstrapAssistBody` · `JSON.stringify(built.body)` | **Pass** |
| AC-P06: Optional POST `/auth/bootstrap` → familyId / error | `#btn-post-bootstrap` · `fetch('/auth/bootstrap')` · `#bootstrap-result` shows `familyId`/`bootstrapped` or `Bootstrap failed: <code>` | **Pass** |
| Same-address: one proof for pool+parent (AC-A06) | `poolProof: proof, parentProof: proof` same object · unit asserts equality | **Pass** |
| No second bootstrap invent; replay/missing fail-closed | Dual-proof only · `EAUTH_BOOTSTRAP_MISSING_PROOF` · HTTP error line surfaces host codes (incl. replay if returned) · no founderOnly/latePool in client | **Pass** |
| Suite | WPROOF-09 harness **6/6** · `npm test` **548** | **Pass** |

**AC verdict: Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-WPROOF-09 | 🟢 Done · OPEN=0 · npm 548 | **Confirm Done** · A1 assist Present |
| t01 build-bootstrap-body | 🟢 Done | **Confirm Done** |
| t02 copy-bootstrap-json | 🟢 Done | **Confirm Done** |
| t03 optional-post-bootstrap | 🟢 Done | **Confirm Done** |
| t04 bootstrap-replay-fail-closed | 🟢 Done | **Confirm Done** (missing-proof unit + HTTP surface) |
| t05 unit-host-bootstrap-assist-harness | 🟢 Done | **Confirm Done** · 6/6 |
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

### Residual (not OPEN TASKED)

| ID | Note | How close (disposition only) |
|----|------|------------------------------|
| F-INFO-01 | Live MetaMask / bootstrap Pass not claimed (AC-P10) — unit/HTML contract only | Operator live when needed — do not invent Pass |
| F-INFO-02 | Explicit `EAUTH_BOOTSTRAP_REPLAY` string not asserted in unit (generic HTTP `json.error` surface) | Host still returns replay code; page prints it — optional unit string OOS |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Founder-only / split-bootstrap invent | **None** |
| Late pool API invent | **None** |
| Dual-proof fields dropped | **None** |
| Full `npm test` green (548) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent live Pass; no invent A2 split-bootstrap.
