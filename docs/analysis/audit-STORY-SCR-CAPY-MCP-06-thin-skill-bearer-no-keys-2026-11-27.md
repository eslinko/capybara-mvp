# P4 Audit — STORY-SCR-CAPY-MCP-06 (Thin Skill + Bearer; keys never)

- **Тип:** hard audit code/docs vs AC · Soft≠Live · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-27
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source:** pipeline [`STORY-SCR-CAPY-MCP-06-….md`](../tasks/epics/EPIC-SCR-CAPY-MCP/stories/STORY-SCR-CAPY-MCP-06-thin-skill-bearer-no-keys/STORY-SCR-CAPY-MCP-06-thin-skill-bearer-no-keys.md)
- **Pkg tip:** `pkg-000111-20261127-capy-mcp-06-thin-skill-bearer-no-keys`
- **Bullrun ($bullrun):** [`run-summary-20261127-2223-….md`](../tasks/run-reports/run-summary-20261127-2223-STORY-SCR-CAPY-MCP-06-thin-skill-bearer-no-keys.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-MCP/stories/STORY-SCR-CAPY-MCP-06-thin-skill-bearer-no-keys/story-acceptance-gate-STORY-SCR-CAPY-MCP-06-thin-skill-bearer-no-keys.md) → P3 **PASS** `2026-11-27T22:23:42Z` · OPEN=0 · npm 644
- **Deliverables:** `docs/manuals/mcp-thin-skill/` · Soft unit mcp06
- **Метод:** Read pack + mocha MCP-06 + `npm test` · Soft≠Live · no invent Live Pass / deep Skill store / Phase 4 Done
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| Thin pack `/mcp` + Bearer · AC-M07 keys-never · AC-M08 chat≠RoleGate · deep deferred · t01–t04 | story §Acceptance Criteria |
| OOS | Deep Skill store · OAuth invent · custody keys in ChatGPT · Live Pass invent |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| Thin Skill/MCP client config Present Soft (`/mcp` + Bearer slot) | `docs/manuals/mcp-thin-skill/mcp-client.config.json` · url `/mcp` · `CAPY_MCP_BEARER_SECRET` kind bearer · harness t01 | **Pass** |
| Pack assert: no private keys in client payloads (AC-M07) | `KEYS-NEVER-CHECKLIST.md` · harness t03 scans pack · config no `0x…64` Soft | **Pass** |
| Docs: chat cannot bypass RoleGate (AC-M08) | `INSTRUCTIONS.md` «cannot grant role» · DualAuth/RoleGate Soft · harness t02 | **Pass** |
| Bearer UX + `/auth` out-of-band Soft | `INSTRUCTIONS.md` `/auth/challenge` → `/auth/verify` · README operator path Soft | **Pass** |
| Deep packaging deferred honesty | `DEEP-SKILL-DEFERRED.md` · harness t04 Soft | **Pass** |
| Suite | MCP-06 harness **4/4** · `npm test` **644** | **Pass** |

**AC verdict: Pass Soft≠Live. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-MCP-06 | 🟢 Done Soft · OPEN=0 · npm 644 | **Confirm Done** Soft≠Live |
| t01 thin-pack-structure | 🟢 Done Soft | **Confirm Done** |
| t02 bearer-ux-mcp-url | 🟢 Done Soft | **Confirm Done** |
| t03 keys-never-checklist | 🟢 Done Soft | **Confirm Done** |
| t04 deep-skill-deferred-note | 🟢 Done Soft | **Confirm Done** |
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
| F-INFO-01 | Soft≠Live: Soft pack ≠ invent Live Pass / Phase 4 Done | MCP-07 evidence-gated — do not invent |
| F-INFO-02 | Deep Skill store packaging deferred by design | sibling REQ when OP unlocks |
| F-INFO-03 | Checklist/INSTRUCTIONS may *mention* forbidden key names as deny list Soft | intentional Soft · harness excludes those files from payload scan |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Private key env names in `mcp-client.config.json` Soft | **None** |
| Config missing `/mcp` or Bearer slot | **None** |
| Full `npm test` green (644) | **Confirm** Soft≠Live |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done Soft≠Live / P8 per OP (VAL does not advance).
- No invent Live Pass / deep Skill store / Phase 4 Done.
