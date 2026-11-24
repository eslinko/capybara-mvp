# 09 — Live Supabase Auth port (Phase 2)

Дата: 2026-11-21 · tech-arch `2026-11-24T13:17:11Z`  
Источник: Target ROADMAP Phase 2 · REQ-04 AC-A02/A04 · AUTH-02 residual (`createLiveSupabaseAuthPortResidual`)  
Status: Draft — SBPORT-01…03 code Present; **live bind proof Residual** (AC-S05) · not Accepted  
Profile: `capybara` · focus `capybara/`  
Honesty: [`../manuals/LIVE-SUPABASE-AUTH-PORT-HONESTY.md`](../manuals/LIVE-SUPABASE-AUTH-PORT-HONESTY.md) · residual [`../manuals/evidence/live-supabase-auth-bind-residual.md`](../manuals/evidence/live-supabase-auth-bind-residual.md)  
Related: [`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md) Phase 2 · backlog [`../tasks/backlog-stories/capybara-live-supabase-auth-port/`](../tasks/backlog-stories/capybara-live-supabase-auth-port/) · proposal [`../analysis/proposal-sbport-stories-2026-11-24.md`](../analysis/proposal-sbport-stories-2026-11-24.md) · parent [`04-dual-auth-wallet-supabase-user.md`](04-dual-auth-wallet-supabase-user.md) · HTTP edge [`08-identity-http-edge-on-host.md`](08-identity-http-edge-on-host.md) · wallet [`10-wallet-address-proof-client.md`](10-wallet-address-proof-client.md) · host [`07-railway-family-host.md`](07-railway-family-host.md) · port [`../../packages/core/src/auth/supabaseAuthPort.js`](../../packages/core/src/auth/supabaseAuthPort.js)  
Architecture: [`../architecture/09-live-supabase-auth-port/00-overview.md`](../architecture/09-live-supabase-auth-port/00-overview.md) · siblings [`01`](../architecture/09-live-supabase-auth-port/01-port-contract-and-bind.md) · [`02`](../architecture/09-live-supabase-auth-port/02-host-wiring-env-fail-closed.md) · [`03`](../architecture/09-live-supabase-auth-port/03-packaging-verify-deploy-residual.md) · prior dual-auth [`../architecture/04-dual-auth-wallet-supabase-user/00-overview.md`](../architecture/04-dual-auth-wallet-supabase-user/00-overview.md) · packaging/env [`../architecture/04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md`](../architecture/04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md)  
Interview: Phase 0 dual-auth locks 2026-11-19 (Supabase Auth bind) · Phase 2 REQ materialize `2026-11-21T13:43:45Z` · target-tech-arch [`../analysis/zeya888.target-tech-arch-interview-09-live-supabase-auth-port-2026-11-24.md`](../analysis/zeya888.target-tech-arch-interview-09-live-supabase-auth-port-2026-11-24.md)

Пометка: SBPORT-01…03 implement Present (factory · host selection · packaging). **Live bind proof** (Railway + real project + Sign→`userId`) remains **Residual** until operator evidence Pass — AC-S05. Memory double stays for unit inject. Docs / `npm test` alone ≠ Accepted.

---

## 0. Verified as-is

| Seam | Fact |
|------|------|
| Memory double | Present — `createMemorySupabaseAuthDouble` (unit inject) |
| Live factory | Present — `createLiveSupabaseAuthPort` (SBPORT-01); legacy residual labeled |
| Host selection | Present — `resolveAuthPort` config→live / fail-closed (SBPORT-02) |
| `@supabase/supabase-js` packaging | Present — `@capybara/core` + Dockerfile workspace install (SBPORT-03) |
| Bind helper | Present — `bindAddressToAuthUser` |
| Live bind proof (real project `userId`) | **Residual / Absent** — [`../manuals/evidence/live-supabase-auth-bind-residual.md`](../manuals/evidence/live-supabase-auth-bind-residual.md) |
| Railway host | Present (REQ-07); live Supabase project bind not claimed |
| Membership persistence in Supabase | **Absent** / Unknown — not this REQ (journals = Phase 3) |

---

## 1. Назначение

Обеспечить **уровень 2** dual-auth на production host: после валидной подписи address — create/link **Supabase user** через live Auth port; session issuance остаётся AUTH bearer (REQ-04 AC-A02 / AC-A04). Без live port Phase 2 identity edge (REQ-08) не может честно закрыть bind.

---

## 2. Подтверждённые решения

| Область | Требование |
|---|---|
| Provider | Supabase Auth (interview lock AUTH-02) — not invent alternate IdP for Phase 2 Done |
| Port contract | Same logical port as memory double: create/link user after address proof; fail-closed on missing/invalid config |
| Secrets | Supabase URL / server credentials only in Railway (or equivalent) env — never Git; never returned by `/health` or auth error bodies |
| Tests | Unit tests continue to use memory double; live proof = remote host + real project (or documented operator residual if project Absent) |
| Role | Role stays on membership — Supabase user is bind target, not role source (REQ-04 AC-A03) |
| Coexistence | Residual throw must not remain the production host wiring after Phase 2 Done |

---

## 3. Out of scope

- HTTP route shapes — REQ-08  
- Wallet UI — REQ-10 (**Accepted** `2026-11-24`; next consumer of this port) 
- Journals / membership DDL → Supabase tables — Phase 3 (unless Architect later splits; not invent here)  
- Address rebind / recovery — ROADMAP deferred  
- MCP / Skill — Phase 4  
- Baking keys into Git or client bundles  
- Creating live client files in this REQ ask (name ≠ create)

---

## 4. Acceptance

| ID | Результат |
|---|---|
| AC-S01 | Production host uses a live Supabase Auth port (not `createLiveSupabaseAuthPortResidual` throw) for address→user bind |
| AC-S02 | Valid address proof leads to create/link Supabase user (REQ-04 AC-A02) on live config |
| AC-S03 | Missing/invalid Supabase env fails closed (no silent memory fallback in production) |
| AC-S04 | Secrets remain server-side env only; not committed; not leaked via health/auth responses |
| AC-S05 | Memory double remains available for unit tests; `npm test` green alone ≠ Phase 2 Supabase Done |

---

## 5. Live proof / residual (AC-S05)

Operator checklist + residual template: [`../manuals/LIVE-SUPABASE-AUTH-PORT-HONESTY.md`](../manuals/LIVE-SUPABASE-AUTH-PORT-HONESTY.md).

| Path | State |
|------|-------|
| Code (SBPORT-01…03) | Present |
| Live bind Pass evidence | **Absent** → Residual labeled |
| REQ-09 Accepted / Phase 2 Done | **Not claimed** from unit or docs alone |

Env keyMap: `SUPABASE_URL` · `SUPABASE_SECRET_KEY` (+ `SUPABASE_SERVICE_ROLE_KEY`) · `CAPY_BEARER_SECRET` — arch-09 `02`.
