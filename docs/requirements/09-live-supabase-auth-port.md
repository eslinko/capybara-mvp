# 09 — Live Supabase Auth port (Phase 2)

Дата: 2026-11-21 · tech-arch `2026-11-24T13:17:11Z`  
Источник: Target ROADMAP Phase 2 · REQ-04 AC-A02/A04 · AUTH-02 residual (`createLiveSupabaseAuthPortResidual`)  
Status: Draft — tech-arch Present (`architecture/09-…`); live `@supabase/supabase-js` implement **Absent**  
Profile: `capybara` · focus `capybara/`  
Related: [`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md) Phase 2 · backlog [`../tasks/backlog-stories/capybara-live-supabase-auth-port/`](../tasks/backlog-stories/capybara-live-supabase-auth-port/) (SBPORT-01…04 Todo) · proposal [`../analysis/proposal-sbport-stories-2026-11-24.md`](../analysis/proposal-sbport-stories-2026-11-24.md) · parent [`04-dual-auth-wallet-supabase-user.md`](04-dual-auth-wallet-supabase-user.md) · HTTP edge [`08-identity-http-edge-on-host.md`](08-identity-http-edge-on-host.md) · wallet [`10-wallet-address-proof-client.md`](10-wallet-address-proof-client.md) · host [`07-railway-family-host.md`](07-railway-family-host.md) · port [`../../packages/core/src/auth/supabaseAuthPort.js`](../../packages/core/src/auth/supabaseAuthPort.js)  
Architecture: [`../architecture/09-live-supabase-auth-port/00-overview.md`](../architecture/09-live-supabase-auth-port/00-overview.md) · siblings [`01`](../architecture/09-live-supabase-auth-port/01-port-contract-and-bind.md) · [`02`](../architecture/09-live-supabase-auth-port/02-host-wiring-env-fail-closed.md) · [`03`](../architecture/09-live-supabase-auth-port/03-packaging-verify-deploy-residual.md) · prior dual-auth [`../architecture/04-dual-auth-wallet-supabase-user/00-overview.md`](../architecture/04-dual-auth-wallet-supabase-user/00-overview.md) · packaging/env [`../architecture/04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md`](../architecture/04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md)  
Interview: Phase 0 dual-auth locks 2026-11-19 (Supabase Auth bind) · Phase 2 REQ materialize `2026-11-21T13:43:45Z` · target-tech-arch [`../analysis/zeya888.target-tech-arch-interview-09-live-supabase-auth-port-2026-11-24.md`](../analysis/zeya888.target-tech-arch-interview-09-live-supabase-auth-port-2026-11-24.md)

Пометка: заменить **residual** live port на рабочий Supabase Auth bind после валидного address proof. Memory double остаётся для unit tests. Env keyMap + bind/host/packaging locks = arch-09 (interview `2026-11-24`). **name ≠ create** client wiring until implement wave.

---

## 0. Verified as-is

| Seam | Fact |
|------|------|
| Memory double | Present — `createMemorySupabaseAuthDouble` ([`supabaseAuthPort.js`](../../packages/core/src/auth/supabaseAuthPort.js)) |
| Live port | Present as **residual** — `createLiveSupabaseAuthPortResidual()` throws `EAUTH_BIND_FAILED` («Live Supabase Auth port is residual…») |
| Bind helper | Present — `bindAddressToAuthUser` (uses port) |
| `@supabase/supabase-js` in product host path | **Absent** as working live client |
| Railway host | Present (REQ-07); Supabase secrets not claimed configured |
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

## 5. Named future paths (acceptance targets — not present until implement)

Logical targets only (form in arch-09; name ≠ create until implement):

- Live port implementation beside [`supabaseAuthPort.js`](../../packages/core/src/auth/supabaseAuthPort.js) (or replace residual body)  
- Railway env keys: `SUPABASE_URL` · `SUPABASE_SECRET_KEY` (+ alias `SUPABASE_SERVICE_ROLE_KEY`) · `CAPY_BEARER_SECRET` — see [`../architecture/09-live-supabase-auth-port/02-host-wiring-env-fail-closed.md`](../architecture/09-live-supabase-auth-port/02-host-wiring-env-fail-closed.md)  
- Host wiring that selects live port when config Present (no silent memory) — arch-09 `02`

**Verified state until implement:** live port = residual throw (see §0); tech-arch Present.
