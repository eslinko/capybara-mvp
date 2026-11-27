# P4 Audit — STORY-SCR-CAPY-MCP-05 (CAPY_MODE + confirm_token RAM TTL)

- **Тип:** hard audit code vs AC · Soft≠Live · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-27
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source:** pipeline [`STORY-SCR-CAPY-MCP-05-….md`](../tasks/epics/EPIC-SCR-CAPY-MCP/stories/STORY-SCR-CAPY-MCP-05-mode-confirm-token-ram/STORY-SCR-CAPY-MCP-05-mode-confirm-token-ram.md)
- **Pkg tip:** `pkg-000110-20261127-capy-mcp-05-mode-confirm-token-ram`
- **Bullrun ($bullrun):** [`run-summary-20261127-2217-….md`](../tasks/run-reports/run-summary-20261127-2217-STORY-SCR-CAPY-MCP-05-mode-confirm-token-ram.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-MCP/stories/STORY-SCR-CAPY-MCP-05-mode-confirm-token-ram/story-acceptance-gate-STORY-SCR-CAPY-MCP-05-mode-confirm-token-ram.md) → P3 **PASS** `2026-11-27T22:17:33Z` · OPEN=0 · npm 640
- **Deliverables:** `host/mcp/confirmTokenStore.js` · `actionInvoker.js` Phase A/B · Soft unit mcp05
- **Метод:** Read/Grep + mocha MCP-05 + `npm test` · Soft≠Live · no invent Live Pass / Redis / Phase 4 Done
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-M06 mock · two-phase confirm_token · RAM TTL 300s · deny invalid · no durable invent · t01–t05 | story §Acceptance Criteria |
| OOS | Sole `confirm: true` policy · Redis/DB store · invent Live Pass / Phase 4 Done |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| Mock default does not move live funds Soft (AC-M06) | `actionNeedsConfirmToken` · default mode `mock` · harness t03 Soft · transfer throws Soft | **Pass** |
| TTY/`confirmPayment` paths → preview + valid `confirm_token` Soft | `executeFamilyAction` Phase A mint · Phase B consume · harness t02 Soft | **Pass** |
| Reality money-class requires confirm_token Soft | actions 2/3/6 always · 4/7 + `advance.issue` in `gfl_reality` Soft · harness t03 | **Pass** |
| Token RAM TTL 300s; invalid/expired/missing → deny | `confirmTokenStore.js` `DEFAULT_TTL_MS=300_000` · consume codes · harness t01/t04 | **Pass** |
| No invent durable confirm store | ctor `backend!=='ram'` → `EMCP_CONFIRM_DURABLE_FORBIDDEN` · harness t05 | **Pass** |
| Sole `confirm:true` not sole policy | Phase A still mints when `confirm:true` without token Soft · harness t02 | **Pass** |
| Suite | MCP-05 harness **5/5** · `npm test` **640** | **Pass** |

**AC verdict: Pass Soft≠Live. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-MCP-05 | 🟢 Done Soft · OPEN=0 · npm 640 | **Confirm Done** Soft≠Live |
| t01 confirm-token-store-ram-ttl | 🟢 Done Soft | **Confirm Done** |
| t02 preview-token-execute-wire | 🟢 Done Soft | **Confirm Done** |
| t03 mock-vs-reality-ac-m06 | 🟢 Done Soft | **Confirm Done** |
| t04 deny-units-token | 🟢 Done Soft | **Confirm Done** |
| t05 no-durable-invent | 🟢 Done Soft | **Confirm Done** |
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
| F-INFO-01 | Soft≠Live: Soft unit ≠ invent Live Pass / Phase 4 Done | MCP-07 evidence-gated — do not invent |
| F-INFO-02 | Durable Redis/DB confirm store intentionally Absent (OP lock) | keep RAM-only until OP unlock |
| F-INFO-03 | Soft actorMembershipId fallback `soft-anonymous-actor` when args omit id | Soft residual · DualAuth membership wire honesty |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Sole confirm:true commits money Soft | **None** (Phase A) |
| Redis/postgres ConfirmTokenStore invent | **None** (ctor throw) |
| Full `npm test` green (640) | **Confirm** Soft≠Live |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done Soft≠Live / P8 per OP (VAL does not advance).
- No invent Live Pass / Redis durable / Phase 4 Done.
