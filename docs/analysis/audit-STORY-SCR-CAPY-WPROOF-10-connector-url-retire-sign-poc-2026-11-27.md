# P4 Audit — STORY-SCR-CAPY-WPROOF-10 (`DOGESTONIA_CONNECTOR_URL` + retire Sign POC)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-27
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-WPROOF-10-connector-url-retire-sign-poc.md`](../tasks/backlog-stories/capybara-wallet-address-proof/STORY-SCR-CAPY-WPROOF-10-connector-url-retire-sign-poc.md)
- **Pkg tip:** [`pkg-000097-20261127-capy-wproof-10-connector-url-retire-sign-poc.yaml`](../tasks/capybara-active-packages/pkg-000097-20261127-capy-wproof-10-connector-url-retire-sign-poc.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261127-1337-STORY-SCR-CAPY-WPROOF-10-connector-url-retire-sign-poc.md`](../tasks/run-reports/run-summary-20261127-1337-STORY-SCR-CAPY-WPROOF-10-connector-url-retire-sign-poc.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-WPROOF/stories/STORY-SCR-CAPY-WPROOF-10-connector-url-retire-sign-poc/story-acceptance-gate-STORY-SCR-CAPY-WPROOF-10-connector-url-retire-sign-poc.md) → P3 **PASS** `2026-11-27T13:37:42Z` · OPEN=0 · npm 572
- **Deliverables:** `host/connectorLaunch.js` · `host/server.js` (Sign retired default) · `tests/unit/host-wproof10-connector-launch-retire-sign.test.js` · manuals / `.env.example`
- **Метод:** Read/Grep + mocha WPROOF-10 + `npm test` · no invent Live Connector Pass
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-WPROOF-10-01…06 · t01–t04 | backlog story §Acceptance Criteria / Technical subtasks |
| OOS | Connector `CONNECTOR_PLATFORMS` · EDGE-11/12 body · invent Live Pass · commit `.env` secrets |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-WPROOF-10-01: reads `DOGESTONIA_CONNECTOR_URL`; fail-closed when required missing | `host/connectorLaunch.js` `readDogestoniaConnectorUrl` · launch → 503 `ECONNECTOR_URL_REQUIRED` · harness | **Pass** |
| AC-WPROOF-10-02: launch URL `mode=platform-auth` + `platform=capybara` | `buildConnectorPlatformAuthLaunchUrl` · `GET /connector/launch` JSON + `?redirect=1` → 302 · no address in URL | **Pass** |
| AC-WPROOF-10-03: `/sign/*` unreachable on default compose | `server.js` `enableSignHttp` default false · `start.js` `createHostServer({ env })` no opt-in · harness `/sign/mint` ≠ 200 | **Pass** |
| AC-WPROOF-10-04: `/auth/challenge|verify` · invite · Bearer remain | `server.js` auth→invite→connector→(opt sign)→probe · harness challenge→verify Bearer token | **Pass** |
| Bootstrap / invite compose wire | `tryHandleAuthRequest` bootstrap path Present · `tryHandleInviteRequest` still composed | **Pass** (compose Present; WPROOF-10 harness does not re-assert invite/bootstrap HTTP) |
| AC-WPROOF-10-05: Soft≠Live docs honesty | `WALLET-ADDRESS-PROOF-OPERATOR.md` · `IDENTITY-HTTP-EDGE-MANUAL.md` · harness honesty | **Pass** |
| AC-WPROOF-10-06: no client mint secrets after retire | default compose does not serve Sign client · `.env.example` name-only + residual mint note for harness | **Pass** |
| Suite | WPROOF-10 harness **5/5** · `npm test` **572** | **Pass** |

**AC verdict: Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-WPROOF-10 | 🟢 Done · OPEN=0 · npm 572 | **Confirm Done** · launch Present · Sign default retired |
| t01 env-keymap-connector-url | 🟢 Done | **Confirm Done** |
| t02 launch-url-platform-auth | 🟢 Done | **Confirm Done** |
| t03 retire-sign-http-compose | 🟢 Done | **Confirm Done** (option A · Soft residual `enableSignHttp`) |
| t04 docs-soft-live-honesty | 🟢 Done | **Confirm Done** |
| Incomplete TASKED | — | **0** |

**Note (docs residual, not OPEN):** story §Code Facts Soft line «Key Present locally ≠ Live redirect Present until implement» superseded by P3 Present launch; Verified current state correctly says Present. Not TASKED gap.

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
| F-INFO-01 | Live Connector browser Pass not claimed (Soft≠Live) | Operator Live evidence when ready — do not invent |
| F-INFO-02 | `signHttp.js` module + `enableSignHttp` Soft residual for historical unit harness | Option A by design · default product path retired |
| F-INFO-03 | Historical Sign mint/docs sections retained under Soft≠Live honesty | Manual marks primary UX = Connector |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Default `npm start` serves Sign mint/page | **None** (`start.js` no `enableSignHttp`) |
| Auth challenge/verify break | **None** (harness 200 + Bearer) |
| Address leaked into launch URL | **None** (harness no `0x…` in URL) |
| Secrets committed in `.env.example` | **None** (commented name-only placeholders) |
| Full `npm test` green (572) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent Live Connector Pass; no secrets invent.
