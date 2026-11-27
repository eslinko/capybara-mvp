# P4 Audit — STORY-SCR-CAPY-EDGE-12 (Connector Origin → SIWE domain/URI)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-27
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-EDGE-12-connector-origin-siwe-domain.md`](../tasks/backlog-stories/capybara-identity-http-edge/STORY-SCR-CAPY-EDGE-12-connector-origin-siwe-domain.md)
- **Pkg tip:** [`pkg-000096-20261127-capy-edge-12-connector-origin-siwe-domain.yaml`](../tasks/capybara-active-packages/pkg-000096-20261127-capy-edge-12-connector-origin-siwe-domain.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261127-1329-STORY-SCR-CAPY-EDGE-12-connector-origin-siwe-domain.md`](../tasks/run-reports/run-summary-20261127-1329-STORY-SCR-CAPY-EDGE-12-connector-origin-siwe-domain.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-EDGE/stories/STORY-SCR-CAPY-EDGE-12-connector-origin-siwe-domain/story-acceptance-gate-STORY-SCR-CAPY-EDGE-12-connector-origin-siwe-domain.md) → P3 **PASS** `2026-11-27T13:29:40Z` · OPEN=0 · npm 567
- **Deliverables:** `host/authHttp.js` (Origin→SIWE · refuse defaults) · `tests/unit/host-edge12-connector-siwe-origin.test.js` · `IDENTITY-HTTP-EDGE-MANUAL.md`
- **Метод:** Read/Grep + mocha EDGE-12 + `npm test` · no invent Live Connector Pass · no Chain ID invent
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-EDGE-12-01…05 · t01–t04 | backlog story §Acceptance Criteria / Technical subtasks |
| OOS | EDGE-11 CORS body · WPROOF-10 · Chain ID / full EIP-4361 · invent Live Pass |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-EDGE-12-01: Connector Origin → message domain = signing host | `deriveSiweDomainUriFromOrigin` → `parsed.host` · `resolveConnectorSiweChallengeOpts` → `issueChallenge({domain})` · harness `^127.0.0.1:8080 wants you` | **Pass** |
| AC-EDGE-12-02: Connector Origin → message URI = absolute origin | `uri = protocol//host` · harness `URI: http://127.0.0.1:8080` / HTTPS railway | **Pass** |
| AC-EDGE-12-03: Connector flow ≠ `capybara.local` / `capybara://auth/challenge` | `assertConnectorSiweMessageNotDefault` · harness excludes · non-Connector keeps defaults | **Pass** |
| Wire Origin on POST `/auth/challenge` | `authHttp.js` L674–680 `resolveConnectorSiweChallengeOpts` → `issueChallenge` | **Pass** |
| Pass into builder | `issueChallenge.js` → `buildSiweClassMessage({domain,uri})` | **Pass** |
| AC-EDGE-12-04: exact UTF-8 `message` signed (not bare challengeId) | harness `wallet.signMessage(challenge.json.message)` → verify 200 | **Pass** |
| AC-EDGE-12-05: Soft≠Live honesty | harness honesty · manual §1 EDGE-12 line | **Pass** |
| Suite | EDGE-12 harness **7/7** · `npm test` **567** | **Pass** |

**AC verdict: Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-EDGE-12 | 🟢 Done · OPEN=0 · npm 567 | **Confirm Done** · Origin→SIWE Present |
| t01 read-challenge-origin | 🟢 Done | **Confirm Done** |
| t02 pass-domain-uri-into-siwe | 🟢 Done | **Confirm Done** |
| t03 refuse-capybara-local-defaults | 🟢 Done | **Confirm Done** |
| t04 soft-live-honesty-harness | 🟢 Done | **Confirm Done** |
| Incomplete TASKED | — | **0** |

**Note (docs residual, not OPEN):** story §Code Facts Soft≠Live line still frames defaults as «≠ Live Origin-aligned Present until implement» — superseded by P3 Present; Verified current state correctly says Present. Not TASKED gap.

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
| F-INFO-01 | Live Connector browser verify Pass not claimed (Soft≠Live) | Operator Live evidence when ready — do not invent |
| F-INFO-02 | Chain ID / full EIP-4361 · WPROOF-10 OOS | Separate stories — name≠create this wave |
| F-INFO-03 | Non-Connector clients still get `capybara.local` defaults (intentional) | By design · harness asserts legacy path |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| CORS allowlist invent/break (EDGE-11) | **None** observed · SIWE opts reuse allowlist only |
| Bare `challengeId` as sign payload | **None** |
| Chain ID invent in message builder | **None** (`buildSiweClassMessage.js` no Chain ID field) |
| Full `npm test` green (567) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent Live Connector Pass; no Chain ID invent.
