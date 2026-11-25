# P4 Audit — STORY-SCR-CAPY-INV-04 (host HTTP createInvite / G3)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-25
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-INV-04-host-http-create-invite.md`](../tasks/backlog-stories/capybara-family-invite/STORY-SCR-CAPY-INV-04-host-http-create-invite.md)
- **Pkg tip:** [`pkg-000086-20261125-capy-inv-04-host-http-create-invite.yaml`](../tasks/capybara-active-packages/pkg-000086-20261125-capy-inv-04-host-http-create-invite.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261125-1509-STORY-SCR-CAPY-INV-04-host-http-create-invite.md`](../tasks/run-reports/run-summary-20261125-1509-STORY-SCR-CAPY-INV-04-host-http-create-invite.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-INV/stories/STORY-SCR-CAPY-INV-04-host-http-create-invite/story-acceptance-gate-STORY-SCR-CAPY-INV-04-host-http-create-invite.md) → P3 claimed PASS · npm **513** (stale vs this audit)
- **Focus:** `host/inviteHttp.js` · InviteStore mount · fail-closed · no opaque token invent
- **Code anchors:** `host/inviteHttp.js` · `host/authHttp.js` `createAuthRuntime` L243 · `host/server.js` compose · `packages/core/src/invite/createInvite.js` · `tests/unit/host-invite-http-create.test.js`
- **Метод:** Read/Glob/Grep + `npm test` / mocha INV-04 · no product edits · no invent AC
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-G3-01..05 | backlog story §Acceptance Criteria |
| OOS | Opaque token · INV-05 bind · EDGE-08 persistence · invent `family.invite_member` |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-G3-01: Bearer parent creates open Invite `to`+`role` on host HTTP | `inviteHttp.js` `POST /auth/invite` → core `createInvite` · harness parent create 200 + `status=open` | **Pass** |
| AC-G3-02: Non-parent / unauth / non-bootstrapped → deny | Harness: unauth 401 `EAUTH_DUAL_DENY` · non-parent 403 `EROLEGATE_DENY` · non-bootstrapped 403 `EINVITE_NOT_BOOTSTRAPPED` · empty `to` 400 · mapInviteError | **Pass** |
| AC-G3-03: Co-parent `role=parent` same path | Harness co-parent case · core `assertRole` allows parent | **Pass** |
| AC-G3-04: Invite visible for accept by `to` | `findOpenInviteByTo` + response `openForToId` · store `listOpenByToInFamily` | **Pass** |
| AC-G3-05: Docs/unit ≠ family onboarding Done | Scenario Step 2 Status · gate honesty · `start.js` L11 AC-G3-05 cite | **Pass** (honesty intent Present) |
| InviteStore on host runtime | `createAuthRuntime` L243 `inviteStore: opts.inviteStore \|\| new InviteStore()` · server passes through | **Pass** |
| Wire core createInvite (DualAuth → RoleGate) | `inviteHttp.js` L136–152 · `createInvite.js` L111–134 `dualAuthGate` then `FAMILY_MEMBERS_SETTINGS` | **Pass** |
| No opaque token invent | Response fields id/from/to/role/familyId/status only · InviteStore/createInvite Grep token/opaque → Absent | **Pass** |

**AC-G3 product/docs verdict: 5/5 Pass.**

**Suite (wave claim):** `npm test` this audit → **511 passing / 2 failing** (not 513). Failures: `host-entry-dotenv.test.js` + `host-entry-health.test.js` — regex `/≠ Phase 2 Done|not claimed/i` vs `start.js` L11 `≠ Phase 2 / family onboarding Done` (slash breaks contiguous `Phase 2 Done`). INV-04 harness alone: **9/9 Pass**.

**Verdict: PASS** (AC-G3) · **OPEN=1** suite honesty regression

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-INV-04 | 🟢 Done · gate PASS · OPEN=0 · npm 513 | **Confirm Done** for AC-G3 · **OPEN=1** npm suite · npm **513 claim stale** |
| t01 mount InviteStore | 🟢 Done | **Confirm Done** |
| t02 HTTP createInvite surface | 🟢 Done | **Confirm Done** · `POST /auth/invite` |
| t03 wire core createInvite | 🟢 Done | **Confirm Done** |
| t04 fail-closed | 🟢 Done | **Confirm Done** |
| t05 unit/host harness | 🟢 Done | **Confirm Done** (INV-04 file 9/9) · full suite not green |
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
| **G-INV-04-START-HONESTY-REGEX** | Medium | INV-04 wave edited `host/start.js` L11 honesty to `≠ Phase 2 / family onboarding Done`, breaking EDGE-05/HOST-01 tests expecting `≠ Phase 2 Done` or `not claimed`. Full `npm test` red (511/2). Gate/run-summary claimed **513 passing** — falsified now. | Restore honesty wording that still matches AC-I06/AC-G3-05 **and** existing test regex (or update tests in lockstep); re-run `npm test` → green; correct gate/bullrun npm count. Do not invent Phase 2 Done. |

### Residual / Info (not OPEN)

| ID | Note | How close (disposition only) |
|----|------|------------------------------|
| F-INFO-01 | Live Tristan/Bastian operator Pass not claimed (scenario Step 2) · in-memory InviteStore = EDGE-08 residual | OOS / later stories |

### **OPEN = 1** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Opaque invite token introduced | **None** |
| DualAuth/RoleGate bypassed on host create | **None** |
| InviteStore absent on runtime | **None** |
| Full `npm test` green (claimed 513) | **Regressed** — see G-INV-04-START-HONESTY-REGEX |

---

## 4. Next label only

- OP: P4 **PASS** (AC-G3) · OPEN=1 (`G-INV-04-START-HONESTY-REGEX` Medium) · may P5 disposition / P7 per OP (VAL does not advance).
- No code/doc patches proposed here; no invent opaque token; no invent live invite Pass.
