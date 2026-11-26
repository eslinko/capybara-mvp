# P4 Audit — STORY-SCR-CAPY-WPROOF-08 (Sign POC debug statuses + copy / G-POC)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-26
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-WPROOF-08-sign-poc-debug-statuses-and-copy.md`](../tasks/backlog-stories/capybara-wallet-address-proof/STORY-SCR-CAPY-WPROOF-08-sign-poc-debug-statuses-and-copy.md)
- **Pkg tip:** [`pkg-000092-20261126-capy-wproof-08-sign-poc-debug-statuses-and-copy.yaml`](../tasks/capybara-active-packages/pkg-000092-20261126-capy-wproof-08-sign-poc-debug-statuses-and-copy.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261126-1038-STORY-SCR-CAPY-WPROOF-08-sign-poc-debug-statuses-and-copy.md`](../tasks/run-reports/run-summary-20261126-1038-STORY-SCR-CAPY-WPROOF-08-sign-poc-debug-statuses-and-copy.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-WPROOF/stories/STORY-SCR-CAPY-WPROOF-08-sign-poc-debug-statuses-and-copy/story-acceptance-gate-STORY-SCR-CAPY-WPROOF-08-sign-poc-debug-statuses-and-copy.md) → P3 **PASS** `2026-11-26T10:40:39Z` · OPEN=0 · npm 542
- **Code anchors:** `host/signHttp.js` (`renderSignPageHtml` · `renderSignClientBrowserJs`) · `tests/unit/host-sign-poc-debug-statuses.test.js`
- **Метод:** Read/Glob/Grep + mocha WPROOF-08 + `npm test` · no invent live MetaMask Pass · no product edits
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-P01…P04 · P08/P09 · P10 honesty | backlog story §Acceptance Criteria |
| OOS | WPROOF-09 bootstrap · INV-07 · Connector · invent live MetaMask Pass |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-P01: Ordered statuses bind→connect→sign→verify→outcome | HTML `#status-steps` L96–101 · `STEP_ORDER` + `advanceTo` in client JS · harness | **Pass** |
| AC-P02: Success shows `userId` + `address` | `#out-userid` / `#out-address` · `showSuccessCapture` · Verified line | **Pass** |
| AC-P03: Copy proof · Bearer · verify JSON | `#btn-copy-*` · `__CAPY_LAST_VERIFY__` · clipboard from page memory | **Pass** |
| AC-P04: Fail paths status + error code | `EMISMATCH_ACCOUNT` · `ESIGN_WALLET_REJECT` · `Verify failed:` · `failAt` | **Pass** |
| AC-P08/P09: POC residual · same host · no product keys | `#poc-banner` residual · `/sign/client.js` · no private keys copy | **Pass** |
| Lock: `/auth/verify` body unchanged | Client still `JSON.stringify({ challengeId, signature })` only · harness AC-P10 | **Pass** |
| Suite | WPROOF-08 harness **7/7** · `npm test` **542** | **Pass** |

**AC verdict: Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-WPROOF-08 | 🟢 Done · OPEN=0 · npm 542 | **Confirm Done** · POC surface Present in `signHttp.js` |
| t01 ordered-status-steps | 🟢 Done | **Confirm Done** |
| t02 userid-address-on-success | 🟢 Done | **Confirm Done** |
| t03 copy-proof-bearer-verify-json | 🟢 Done | **Confirm Done** |
| t04 fail-closed-status-error | 🟢 Done | **Confirm Done** |
| t05 poc-residual-banner | 🟢 Done | **Confirm Done** |
| t06 unit-host-status-copy-harness | 🟢 Done | **Confirm Done** · 7/7 |
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
| F-INFO-01 | Live MetaMask Pass not claimed (AC-P10) — unit/HTML contract only | Operator live Sign when needed — do not invent Pass |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| `/auth/verify` body invent (extra fields) | **None** |
| Product/pool private keys on Sign page | **None** |
| Separate Sign origin invent | **None** (same-host `/sign/client.js`) |
| Full `npm test` green (542) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent live MetaMask Pass; no invent Phase 2 Done.
