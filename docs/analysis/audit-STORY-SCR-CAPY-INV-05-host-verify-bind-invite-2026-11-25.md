# P4 Audit — STORY-SCR-CAPY-INV-05 (host verify bind invite / G4)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-25
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-INV-05-host-verify-bind-invite.md`](../tasks/backlog-stories/capybara-family-invite/STORY-SCR-CAPY-INV-05-host-verify-bind-invite.md)
- **Pkg tip:** [`pkg-000088-20261125-capy-inv-05-host-verify-bind-invite.yaml`](../tasks/capybara-active-packages/pkg-000088-20261125-capy-inv-05-host-verify-bind-invite.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261125-1532-STORY-SCR-CAPY-INV-05-host-verify-bind-invite.md`](../tasks/run-reports/run-summary-20261125-1532-STORY-SCR-CAPY-INV-05-host-verify-bind-invite.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-INV/stories/STORY-SCR-CAPY-INV-05-host-verify-bind-invite/story-acceptance-gate-STORY-SCR-CAPY-INV-05-host-verify-bind-invite.md) → P3 **PASS** `2026-11-25T15:32:18Z` · OPEN=0 · npm 524
- **Code anchors:** `host/authHttp.js` `/auth/verify` · `findOpenInviteByTo` · `bindInviteeAndAccept` · `assertInviteeNoFamilyCaps` · `tests/unit/host-verify-bind-invite.test.js`
- **Метод:** Read/Glob/Grep + mocha INV-05 + `npm test` · no product edits · no invent live MetaMask Pass
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-G4-01..05 | backlog / pipeline story §Acceptance Criteria |
| OOS | INV-04 create · opaque token · INV-06 Miguel · live Pass invent |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-G4-01: Open invite + verify → Membership Invite.role + Auth userId + Invite accepted | `authHttp.js` L527–561 → `bindInviteeAndAccept` · harness happy path `inviteAccepted` + `membershipRole=child` + invite `accepted` | **Pass** |
| AC-G4-02: No open invite → Auth-only | L562–568 `bindAddressToAuthUser` · `inviteAccepted: false` · no membership | **Pass** |
| AC-G4-03: Proof/`to` mismatch → deny | Harness inviteId mismatch → 403 `EINVITE_PROOF_MISMATCH` · `mapAuthError` L407 · invite stays open | **Pass** |
| AC-G4-04: Pre-accept no family caps (AC-M06) | L532–540 `assertInviteeNoFamilyCaps` before accept · harness deny `EINVITE_PRE_ACCEPT_NO_CAPS` | **Pass** |
| AC-G4-05: Client-claimed role ignored | L503–505 capture + pass to core · harness claimed `parent`/`child` ≠ Invite.role → membership from Invite | **Pass** |
| Suite | INV-05 harness **5/5** · `npm test` **524** passing | **Pass** |
| Scenario honesty | Step 3 G4 Present · live Pass not invented | **Pass** |

**AC verdict: 5/5 Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-INV-05 | 🟢 Done · OPEN=0 · npm 524 | **Confirm Done** · verify→bind Present |
| t01 resolve-open-invite-by-to | 🟢 Done | **Confirm Done** |
| t02 wire-bind-invitee-and-accept | 🟢 Done | **Confirm Done** |
| t03 no-invite-auth-only-path | 🟢 Done | **Confirm Done** |
| t04 ac-m06-pre-accept | 🟢 Done | **Confirm Done** |
| t05 unit-host-harness | 🟢 Done | **Confirm Done** · 5/5 |
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
| F-INFO-01 | Backlog `$story` AC checkboxes still `[ ]` while pipeline/gate Done — docs sync lag | OP refresh backlog AC `[x]` — not product gap |
| F-INFO-02 | Live MetaMask / Railway Pass not claimed · family onboarding Done not claimed | Honesty / OOS |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Verify invents membership without open invite | **None** |
| Client-claimed role drives membership | **None** |
| Opaque invite token | **None** |
| Full `npm test` green (524) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent live MetaMask Pass; no invent family onboarding Done.
