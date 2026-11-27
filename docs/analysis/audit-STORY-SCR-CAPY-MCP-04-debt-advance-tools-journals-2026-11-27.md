# P4 Audit — STORY-SCR-CAPY-MCP-04 (Debt + advance tools + journals)

- **Тип:** hard audit code vs AC · Soft≠Live · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-27
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source:** pipeline [`STORY-SCR-CAPY-MCP-04-….md`](../tasks/epics/EPIC-SCR-CAPY-MCP/stories/STORY-SCR-CAPY-MCP-04-debt-advance-tools-journals/STORY-SCR-CAPY-MCP-04-debt-advance-tools-journals.md)
- **Pkg tip:** `pkg-000109-20261127-capy-mcp-04-debt-advance-tools-journals`
- **Bullrun ($bullrun):** [`run-summary-20261127-2209-….md`](../tasks/run-reports/run-summary-20261127-2209-STORY-SCR-CAPY-MCP-04-debt-advance-tools-journals.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-MCP/stories/STORY-SCR-CAPY-MCP-04-debt-advance-tools-journals/story-acceptance-gate-STORY-SCR-CAPY-MCP-04-debt-advance-tools-journals.md) → P3 **PASS** `2026-11-27T22:09:21Z` · OPEN=0 · npm 635
- **Deliverables:** `toolRegistry.js` debt/advance · `actionInvoker.js` cases 6/7 · `mcpHttp.js` family supersede Soft
- **Метод:** Read/Grep + mocha MCP-04 + `npm test` · Soft≠Live · no invent Live Pass / REQ-12 Accept / Phase 4 Done
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| REQ §3.3–3.4 debt.* / advance.* · AC-M01 rest · AC-M10 journals · isolated env · t01–t04 | story §Acceptance Criteria |
| OOS | Child repay grants · invent REQ-12 Accept · confirm policy (MCP-05) |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| All listed debt/advance tool_ids Soft (AC-M01 rest) | `toolRegistry.js` 12 `debt.*` + 5 `advance.*` · `assertDebtAdvanceToolsRegistered` · harness t01 | **Pass** |
| Same actionInvoker isolated-env path as MCP-03 | `actionInvoker.js` `DebtLedgerAction` / `AdvanceLedgerAction` + `env: isolatedEnv` · no `router.route` | **Pass** |
| Op+params → CAPYBARA_DEBT_* / ADVANCE_* Soft | `mapArgsToCapybaraEnv` · `mapDebtArgsToEnv` / `mapAdvanceArgsToEnv` · harness t02 | **Pass** |
| Journal side-effects match CLI logical journals Soft (AC-M10) | harness t03: MCP `debt.create` → same ndjson · show card remainder parity Soft | **Pass** |
| No invent alternate debt/advance math | Action wrap only Soft · harness mutate forgive Soft | **Pass** |
| Parent allow Soft debt gate | harness t04 `authorizeMcpToolCall` capabilityId `debt.create` parent Soft | **Pass** |
| Family tools supersede MCP-02 probe names Soft | `mcpHttp.js` skip `PARENT_ONLY` when name in family set | **Pass** |
| Suite | MCP-04 harness **4/4** · `npm test` **635** | **Pass** |

**AC verdict: Pass Soft≠Live. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-MCP-04 | 🟢 Done Soft · OPEN=0 · npm 635 | **Confirm Done** Soft≠Live |
| t01 register-debt-advance-tools | 🟢 Done | **Confirm Done** |
| t02 op-params-env-map | 🟢 Done | **Confirm Done** |
| t03 journal-soft-assert | 🟢 Done | **Confirm Done** |
| t04 soft-units-debt-advance | 🟢 Done | **Confirm Done** |
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
| F-INFO-01 | Soft≠Live: Soft unit ≠ invent Live Pass / Phase 4 Done / REQ-12 Accept | MCP-07 / REQ-12 evidence-gated — do not invent |
| F-INFO-02 | advance.* CatalogAlias→RoleGate Soft residual honesty (gate note) | Soft≠Live · catalog seed residual — not invent REQ-08 |
| F-INFO-03 | Confirm two-phase OOS | MCP-05 |
| F-INFO-04 | Child repay grants Absent this REQ | later wave |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| 51/52 registered as family tools | **None** |
| process.env CAPYBARA_* cross-talk Soft parallel | **None** |
| Full `npm test` green (635) | **Confirm** Soft≠Live |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done Soft≠Live / P8 per OP (VAL does not advance).
- No invent Live Pass / REQ-12 Accept / Phase 4 Done.
