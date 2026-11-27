# P4 Audit — STORY-SCR-CAPY-PGDUR-02 (Membership + Invite Postgres adapters)

- **Тип:** hard audit code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-27
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source:** pipeline [`STORY-SCR-CAPY-PGDUR-02-….md`](../tasks/epics/EPIC-SCR-CAPY-PGDUR/stories/STORY-SCR-CAPY-PGDUR-02-membership-invite-postgres-adapters/STORY-SCR-CAPY-PGDUR-02-membership-invite-postgres-adapters.md)
- **Pkg tip:** `pkg-000099-20261127-capy-pgdur-02-membership-invite-postgres-adapters`
- **Bullrun ($bullrun):** [`run-summary-20261127-1822-….md`](../tasks/run-reports/run-summary-20261127-1822-STORY-SCR-CAPY-PGDUR-02-membership-invite-postgres-adapters.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-PGDUR/stories/STORY-SCR-CAPY-PGDUR-02-membership-invite-postgres-adapters/story-acceptance-gate-STORY-SCR-CAPY-PGDUR-02-membership-invite-postgres-adapters.md) → P3 **PASS** `2026-11-27T18:22:09Z` · OPEN=0 · npm 582
- **Deliverables:** `PostgresMembershipStore` · `PostgresInviteStore` · `FailClosed*` · `createServiceClient.js` · `authHttp.resolveMembershipInviteStores` · `server.js` createClient compose
- **Метод:** Read/Grep + mocha PGDUR-02 + `npm test` · Soft≠Live · no invent Live Pass / REQ-12 Done
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-P01 · P02 · P06 · P07 · P08 · t01–t04 | story §Acceptance Criteria / Technical subtasks |
| OOS | PGDUR-03 proof · 04 journals · 05 Live redeploy · `pg`/`DATABASE_URL` · challenge/Bearer durability |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-P01: production primary = Postgres `families`/`memberships` | `PostgresMembershipStore.js` `.from('families'|'memberships')` · `resolveMembershipInviteStores` + `createHostServer` passes `tryLoadSupabaseCreateClient` / inject `createClient` | **Pass** |
| AC-P02: invites durable via `invites` | `PostgresInviteStore.js` `.from('invites')` · harness round-trip add/list/accept | **Pass** |
| AC-P06: missing/invalid → FailClosed · no silent RAM SoT | `!config` → FailClosed* · no `createClient` → FailClosed* · client throw → FailClosed* · harness | **Pass** |
| AC-P08: memory doubles injectable · ≠ Phase 3 Done | opts `membershipStore`/`inviteStore` win · harness honesty Soft≠Live | **Pass** |
| AC-P07: secrets not in auth error bodies | `sanitizePublicAuthMessage` harness redacts key+bearer | **Pass** |
| Shared client | `packages/core/src/supabase/createServiceClient.js` `createServiceSupabaseClient` · no `pg`/`DATABASE_URL` | **Pass** |
| Suite | PGDUR-02 harness **6/6** · `npm test` **582** | **Pass** |

**AC verdict: Pass. OPEN = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-PGDUR-02 | 🟢 Done · OPEN=0 · npm 582 | **Confirm Done** · adapters + fail-closed Present |
| t01 membership-postgres-adapter | 🟢 Done | **Confirm Done** |
| t02 invite-postgres-adapter | 🟢 Done | **Confirm Done** |
| t03 host-wiring-fail-closed | 🟢 Done | **Confirm Done** |
| t04 unit-inject-doubles | 🟢 Done | **Confirm Done** |
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
| F-INFO-01 | Soft≠Live: unit/adapters ≠ invent REQ-12 Done / Live redeploy Pass | PGDUR-05 evidence-gated — do not invent |
| F-INFO-02 | Partial inject (`membershipStore` XOR `inviteStore`) falls back other side to RAM | AC-P08 inject path by design · production uses both Postgres or both FailClosed |
| F-INFO-03 | Live Auth project apply + redeploy proof OOS this story | Soft residual · PGDUR-01 apply + PGDUR-05 |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Silent `new MembershipStore()` when config Present without createClient | **None** (FailClosed) |
| Invent `pg` / `DATABASE_URL` | **None** |
| Memory inject removed | **None** (AC-P08 harness) |
| Full `npm test` green (582) | **Confirm** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code patches; no invent Live Pass / REQ-12 Done.
