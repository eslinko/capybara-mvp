# P4 Audit — STORY-SCR-CAPY-EDGE-11 (Connector CORS on `/auth/challenge|verify`)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-27
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-EDGE-11-connector-cors-auth.md`](../tasks/backlog-stories/capybara-identity-http-edge/STORY-SCR-CAPY-EDGE-11-connector-cors-auth.md)
- **Pkg tip:** [`pkg-000095-20261127-capy-edge-11-connector-cors-auth.yaml`](../tasks/capybara-active-packages/pkg-000095-20261127-capy-edge-11-connector-cors-auth.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261127-1323-STORY-SCR-CAPY-EDGE-11-connector-cors-auth.md`](../tasks/run-reports/run-summary-20261127-1323-STORY-SCR-CAPY-EDGE-11-connector-cors-auth.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-EDGE/stories/STORY-SCR-CAPY-EDGE-11-connector-cors-auth/story-acceptance-gate-STORY-SCR-CAPY-EDGE-11-connector-cors-auth.md) → P3 **PASS** `2026-11-27T13:23:08Z` · OPEN=0 · npm 560
- **Deliverables:** `host/authHttp.js` (allowlist · OPTIONS · fail-closed) · `tests/unit/host-edge11-connector-cors.test.js` · `.env.example` · `IDENTITY-HTTP-EDGE-MANUAL.md`
- **Метод:** Read/Grep + mocha EDGE-11 + `npm test` · no invent Live Connector Pass
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-EDGE-11-01…05 · t01–t04 | backlog story §Acceptance Criteria / Technical subtasks |
| OOS | EDGE-12 SIWE domain/URI · WPROOF-10 · Connector product · invent Live Pass · `*` |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-EDGE-11-01: Allowed Origin → ACAO echo (not `*`) on challenge/verify | `host/authHttp.js` `resolveAllowedConnectorOrigin` + `connectorCorsResponseHeaders` · `tryHandleAuthRequest` writes `corsHeaders` on POST · harness ACAO asserts | **Pass** |
| Defaults local `127.0.0.1:8080` / `localhost:8080` + `CAPY_CONNECTOR_CORS_ORIGINS` extras | `DEFAULT_CONNECTOR_CORS_ORIGINS` · `resolveConnectorCorsAllowlist` · `.env.example` L46–49 · manual §2 | **Pass** |
| AC-EDGE-11-02: OPTIONS → 204 · `POST,OPTIONS` · `Content-Type,Accept` | `authHttp.js` L581–591 · harness OPTIONS both paths | **Pass** |
| AC-EDGE-11-03: Unknown Origin fail-closed (no `*`) | extras filter `o !== '*'` · origin `=== '*'` → null · unknown → no ACAO header · harness | **Pass** |
| AC-EDGE-11-04: Soft≠Live honesty | harness honesty object · manual §1 EDGE-11 line · story fence | **Pass** |
| AC-EDGE-11-05: challenge/verify body contracts unchanged | harness body shape keys · verify returns token/userId/proof | **Pass** |
| Compose wiring | `host/server.js` `tryHandleAuthRequest` | **Pass** |
| CORS scoped to challenge/verify only | `isConnectorCorsAuthPath` · harness session/bootstrap false | **Pass** |
| Suite | EDGE-11 harness **9/9** · `npm test` **560** | **Pass** |

**AC verdict: Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-EDGE-11 | 🟢 Done · OPEN=0 · npm 560 | **Confirm Done** · CORS Present on challenge/verify |
| t01 cors-origin-allowlist | 🟢 Done | **Confirm Done** |
| t02 options-preflight-auth | 🟢 Done | **Confirm Done** |
| t03 fail-closed-unknown-origin | 🟢 Done | **Confirm Done** |
| t04 soft-live-honesty-harness | 🟢 Done | **Confirm Done** |
| Incomplete TASKED | — | **0** |

**Note (docs residual, not OPEN):** story §Code Facts still lists «CORS headers as-is **Absent** under `host/`» — superseded by P3 Present in `authHttp.js`; Verified current state correctly says Present. Not TASKED gap.

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
| F-INFO-01 | Live Connector browser CORS Pass not claimed (Soft≠Live) | Operator Live evidence when ready — do not invent |
| F-INFO-02 | EDGE-12 SIWE domain/URI · WPROOF-10 OOS | Separate stories — name≠create this wave |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Wildcard `*` ACAO invent | **None** (stripped from env; never emitted) |
| CORS on `/auth/session|bootstrap` | **None** (path stamp only challenge/verify) |
| Body contract break | **None** (harness keys) |
| Full `npm test` green (560) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent Live Connector Pass; no EDGE-12 invent.
