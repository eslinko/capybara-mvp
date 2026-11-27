# P4 Audit — STORY-SCR-CAPY-PGDUR-03 (Persist verified AddressProof)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-27
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source:** pipeline [`STORY-SCR-CAPY-PGDUR-03-….md`](../tasks/epics/EPIC-SCR-CAPY-PGDUR/stories/STORY-SCR-CAPY-PGDUR-03-verified-proof-persist/STORY-SCR-CAPY-PGDUR-03-verified-proof-persist.md)
- **Pkg tip:** `pkg-000100-20261127-capy-pgdur-03-verified-proof-persist`
- **Bullrun ($bullrun):** [`run-summary-20261127-1833-….md`](../tasks/run-reports/run-summary-20261127-1833-STORY-SCR-CAPY-PGDUR-03-verified-proof-persist.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-PGDUR/stories/STORY-SCR-CAPY-PGDUR-03-verified-proof-persist/story-acceptance-gate-STORY-SCR-CAPY-PGDUR-03-verified-proof-persist.md) → P3 **PASS** `2026-11-27T18:33:58Z` · OPEN=0 · npm 588
- **Deliverables:** `PostgresVerifiedAddressProofStore` · `VerifiedAddressProofStore` · `host/authHttp.js` `/auth/verify` persist · harness
- **Метод:** Read/Grep + mocha PGDUR-03 + `npm test` · Soft≠Live · live survival → PGDUR-05
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-P03 · ephemeral ChallengeStore · optional familyId · t01–t03 | story §Acceptance Criteria / Technical subtasks |
| OOS | Durable pending challenges · Bearer/SignToken · invent columns · invent Live Pass |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-P03: persist after successful verify → `verified_address_proofs` | `PostgresVerifiedAddressProofStore.addVerifiedProof` `.from('verified_address_proofs')` · `authHttp.js` `/auth/verify` after `verifyAddressProof` · harness | **Pass** |
| Fields: address, challengeId, verifiedAt(+Ms), server id | store insert row · harness `vap-` id | **Pass** |
| `familyId` optional | store null omit · host `familyId \|\| null` · harness null + string | **Pass** |
| Pending ChallengeStore ephemeral (not a defect) | `verifyAddressProof` consumes · harness pendingCount 0 · REQ 1A note | **Pass** |
| Runtime wire: createClient → Postgres proof store | `resolveMembershipInviteStores` · harness instanceOf Postgres | **Pass** |
| Memory double injectable Soft≠Live | `VerifiedAddressProofStore` inject · harness | **Pass** |
| Suite | PGDUR-03 harness **6/6** · `npm test` **588** | **Pass** |

**AC verdict: Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-PGDUR-03 | 🟢 Done · OPEN=0 · npm 588 | **Confirm Done** · persist Present Soft≠Live |
| t01 proof-writer-after-verify | 🟢 Done | **Confirm Done** |
| t02 optional-family-id | 🟢 Done | **Confirm Done** |
| t03 unit-verify-row-ephemeral-challenge | 🟢 Done | **Confirm Done** |
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
| F-INFO-01 | Soft≠Live: unit ≠ invent Live Pass / REQ-12 Done · live row survival → PGDUR-05 | Evidence-gated PGDUR-05 — do not invent |
| F-INFO-02 | Without `createClient`, proof store falls back to in-memory `VerifiedAddressProofStore` (membership FailClosed) | Production `server.js` supplies createClient · Soft residual for bare runtime |
| F-INFO-03 | Persist await is on verify success path — DB insert failure fails request (not silent skip) | By design · not OPEN |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| ChallengeStore durable invent / pending DDL | **None** (ephemeral consume) |
| Required familyId invent | **None** |
| Full `npm test` green (588) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code patches; no invent Live Pass / REQ-12 Done.
