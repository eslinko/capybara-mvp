# P4 Audit — STORY-SCR-CAPY-WPROOF-07 (Sign manual address entry / G5)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-25
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-WPROOF-07-sign-manual-address-entry.md`](../tasks/backlog-stories/capybara-wallet-address-proof/STORY-SCR-CAPY-WPROOF-07-sign-manual-address-entry.md)
- **Pkg tip:** [`pkg-000087-20261125-capy-wproof-07-sign-manual-address-entry.yaml`](../tasks/capybara-active-packages/pkg-000087-20261125-capy-wproof-07-sign-manual-address-entry.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261125-1523-STORY-SCR-CAPY-WPROOF-07-sign-manual-address-entry.md`](../tasks/run-reports/run-summary-20261125-1523-STORY-SCR-CAPY-WPROOF-07-sign-manual-address-entry.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-WPROOF/stories/STORY-SCR-CAPY-WPROOF-07-sign-manual-address-entry/story-acceptance-gate-STORY-SCR-CAPY-WPROOF-07-sign-manual-address-entry.md) → P3 **PASS** `2026-11-25T15:23:34Z` · OPEN=0 · npm 519
- **Code anchors:** `host/signHttp.js` (`#capy-address` · bind-address · `/sign/client.js`) · `host/signTokenStore.js` `rebindChallenge` · `host/signClient.js` · `tests/unit/host-sign-manual-address.test.js`
- **Метод:** Read/Glob/Grep + mocha WPROOF-07 + `npm test` · no product edits · no invent live MetaMask Pass
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-G5-01..04 | backlog / pipeline story §Acceptance Criteria |
| OOS | Remove mint secret invent · custody keys · INV-05 bind · live MetaMask Pass invent |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-G5-01: Operator can set address by hand before Connect & Sign | `signHttp.js` `renderSignPageHtml` L78–79 editable `#capy-address` · harness HTML includes field | **Pass** |
| AC-G5-02: Proof for entered only; MM mismatch fail-closed | `POST …/bind-address` + `rebindChallenge` · browser + `signClient.js` compare connected≠entered → mismatch / no `personal_sign` · harness rebind + mismatch + verify typed | **Pass** |
| AC-G5-03: No product/pool private keys on page | Page copy L77 · Grep privateKey in HTML path Absent · harness asserts | **Pass** |
| AC-G5-04: Channel A/B encoding unchanged | Golden `encodePersonalSignData` · browser `utf8ToHex`/`buildParams` · `buildPersonalSignParams` intact | **Pass** |
| Operator note Tristan/Bastian/Miguel | Scenario Step 3 · `WALLET-ADDRESS-PROOF-OPERATOR.md` §3a | **Pass** |
| Suite | `npm test` this audit → **519** passing · WPROOF-07 file **6/6** | **Pass** |
| Live MetaMask Pass | Gate/scenario honesty · not invented | **Pass** (honesty) |

**AC verdict: 4/4 Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-WPROOF-07 | 🟢 Done · OPEN=0 · npm 519 | **Confirm Done** · AC-G5 Present in code |
| t01 manual-address-ux | 🟢 Done | **Confirm Done** |
| t02 challenge-bound-to-entered-address | 🟢 Done | **Confirm Done** |
| t03 encoding-dual-channel-intact | 🟢 Done | **Confirm Done** |
| t04 operator-note-invitees | 🟢 Done | **Confirm Done** |
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
| F-INFO-02 | Live MetaMask / invitee Pass not claimed (REQ-10 honesty) · INV-05 bind still G4 | OOS / later stories |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Crypto fork / encoding change | **None** (golden intact) |
| Custody keys on Sign page | **None** |
| Mint-only fixed address (no edit) | **Closed** — editable field + bind-address |
| Full `npm test` green (519) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent live MetaMask Pass; no invent Phase 2 Done.
