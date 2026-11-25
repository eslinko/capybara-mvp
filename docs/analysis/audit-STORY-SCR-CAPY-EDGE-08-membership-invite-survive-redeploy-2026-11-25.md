# P4 Audit — STORY-SCR-CAPY-EDGE-08 (membership+invite survive redeploy / G8)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-25
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-EDGE-08-membership-invite-survive-redeploy.md`](../tasks/backlog-stories/capybara-identity-http-edge/STORY-SCR-CAPY-EDGE-08-membership-invite-survive-redeploy.md)
- **Pkg tip:** [`pkg-000090-20261125-capy-edge-08-membership-invite-survive-redeploy.yaml`](../tasks/capybara-active-packages/pkg-000090-20261125-capy-edge-08-membership-invite-survive-redeploy.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261125-1545-STORY-SCR-CAPY-EDGE-08-membership-invite-survive-redeploy.md`](../tasks/run-reports/run-summary-20261125-1545-STORY-SCR-CAPY-EDGE-08-membership-invite-survive-redeploy.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-EDGE/stories/STORY-SCR-CAPY-EDGE-08-membership-invite-survive-redeploy/story-acceptance-gate-STORY-SCR-CAPY-EDGE-08-membership-invite-survive-redeploy.md) → P3 **PASS** · disposition **Residual continued** · OPEN TASKED=0 · npm 531
- **Deliverables:** `MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md` · IDENTITY §4 · scenario G8 warn · `edge08-membership-invite-redeploy-residual.test.js`
- **Code anchors:** `host/authHttp.js` `createAuthRuntime` · `MembershipStore.js` / `InviteStore.js` (in-memory Maps)
- **Метод:** Read/Glob/Grep + mocha EDGE-08 + `npm test` · no product edits · no invent durability Done / Phase 3 DDL
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-G8-01..04 | backlog story §Acceptance Criteria |
| DoD this wave | Explicit **Residual continued** (durability Absent) + honesty AC-G8-03/04 |
| OOS | Phase 3 journals DDL · invent durable store |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-G8-01: Memberships survive redeploy for DualAuth/RoleGate | Code: `MembershipStore` in-memory Maps · `createAuthRuntime` `new MembershipStore()` · residual manual §2 **Absent** | **Residual** (Absent — honesty labeled; ≠ invent Present) |
| AC-G8-02: Open invites accept-able after redeploy | Code: `InviteStore` in-memory · residual §2 **Absent** | **Residual** (Absent — labeled) |
| AC-G8-03: If durability Absent → Residual-label + forbid invent multi-step Pass | `MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md` · IDENTITY §4 · scenario Non-claims G8 · harness | **Pass** |
| AC-G8-04: npm/docs alone ≠ durability Done | Residual honesty · harness · no DDL invent · gate disposition | **Pass** |
| Session/SignToken TTL carve-out | Residual §3 · IDENTITY · allowed ephemeral | **Pass** (documented) |
| Suite | EDGE-08 harness **4/4** · `npm test` **531** | **Pass** |

**AC DoD this wave:** AC-G8-03/04 Pass · AC-G8-01/02 Residual continued (not invent Done).

**Verdict: PASS** · OPEN TASKED = **0** · durability Present = **Absent / Residual continued**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-EDGE-08 | 🟢 Done · Residual continued · OPEN=0 | **Confirm Done** for honesty DoD · durability still Absent |
| t01 durability-requirement | 🟢 Done | **Confirm Done** — requirement + Absent labeled |
| t02 session-sign-token-residual | 🟢 Done | **Confirm Done** |
| t03 residual-until-present | 🟢 Done | **Confirm Done** |
| t04 post-redeploy-verify-criterion | 🟢 Done | **Confirm Done** — criterion docs; not exercised |
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
| R-G8-DURABILITY | AC-G8-01/02 Absent: MembershipStore + InviteStore process memory (`authHttp.js` L249–250 · store constructors). Mid-run Railway redeploy wipes family. | Future durable store / Phase 3 journals — do **not** invent this wave; when Present run residual §5 post-redeploy criterion |
| F-INFO-01 | Post-redeploy live exercise not claimed | Residual §5 — optional later evidence |

### **OPEN = 0** (TASKED) · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Invent durable store / Phase 3 DDL Done | **None** |
| Invent multi-step live Pass across redeploy | **None** |
| In-memory mounts removed silently | **None** — still default new stores |
| Full `npm test` green (531) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 TASKED · Residual continued · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent durability Present; no invent Phase 3 DDL Done.
