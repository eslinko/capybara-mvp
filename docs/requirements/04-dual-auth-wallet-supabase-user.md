# 04 — Dual auth: wallet signature → Supabase user

Дата: 2026-11-19  
Источник: Phase 0 interview (Capybara V / operator) · parent PRD O-01  
Status: Draft — AUTH-01…04 **Done** (core modules); live residual → Phase 2 REQ-08…10  
Profile: `capybara` · focus `capybara/`  
Related: [`03-family-roles-and-capability-matrix.md`](03-family-roles-and-capability-matrix.md) · [`05-family-membership-parent-adds-child.md`](05-family-membership-parent-adds-child.md) · Phase 2 [`08-identity-http-edge-on-host.md`](08-identity-http-edge-on-host.md) · [`09-live-supabase-auth-port.md`](09-live-supabase-auth-port.md) · [`10-wallet-address-proof-client.md`](10-wallet-address-proof-client.md) · host [`07-railway-family-host.md`](07-railway-family-host.md) · [`../product/CAPYBARA-FAMILY-MVP-PRODUCT-REQUIREMENTS.md`](../product/CAPYBARA-FAMILY-MVP-PRODUCT-REQUIREMENTS.md) §16 · Target [`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md) Phase 0 · membership [`../../packages/core/src/membership/`](../../packages/core/src/membership/) · ROLE epic [`../tasks/epics/EPIC-SCR-CAPY-ROLE/EPIC-SCR-CAPY-ROLE.md`](../tasks/epics/EPIC-SCR-CAPY-ROLE/EPIC-SCR-CAPY-ROLE.md)  
Implement: [`../tasks/backlog-stories/capybara-dual-auth/INDEX.md`](../tasks/backlog-stories/capybara-dual-auth/INDEX.md) · epic [`../tasks/backlog-stories/capybara-dual-auth/EPIC-SCR-CAPY-AUTH.md`](../tasks/backlog-stories/capybara-dual-auth/EPIC-SCR-CAPY-AUTH.md) · wave [`../tasks/run-reports/operator-waves/wave-20261120-capy-auth.md`](../tasks/run-reports/operator-waves/wave-20261120-capy-auth.md)  
Architecture: [`../architecture/04-dual-auth-wallet-supabase-user/00-overview.md`](../architecture/04-dual-auth-wallet-supabase-user/00-overview.md) · roles arch [`../architecture/03-family-roles-and-capability-matrix/00-overview.md`](../architecture/03-family-roles-and-capability-matrix/00-overview.md)  
Interview report (tech-arch): [`../analysis/zeya888.target-tech-arch-interview-04-dual-auth-wallet-supabase-user-2026-11-20.md`](../analysis/zeya888.target-tech-arch-interview-04-dual-auth-wallet-supabase-user-2026-11-20.md)  
Interview: dialog lock 2026-11-19 (A1–A5 + Q1–Q3); tech-arch decisions auto-accepted 2026-11-20T07:29:49Z

Пометка: контракт идентичности Phase 0. Core AUTH modules Present. Railway host = Phase 1 Done (REQ-07). Live HTTP edge / live `@supabase/supabase-js` / wallet proof client = **Phase 2** ([REQ-08](08-identity-http-edge-on-host.md) · [REQ-09](09-live-supabase-auth-port.md) · [REQ-10](10-wallet-address-proof-client.md)). Не санкционирует перенос private keys в браузер или ChatGPT. Operator accept AC / Phase 0 Done — отдельно.

---

## 0. Verified runtime (as-of AUTH Done)

### ROLE seams (unchanged)

| Seam | Fact |
|------|------|
| MembershipStore + optional `userId` | [`../../packages/core/src/membership/MembershipStore.js`](../../packages/core/src/membership/MembershipStore.js) — `addMembership`, `listMembershipsByUserId`, `setPoolIdentity`, `markBootstrapped` |
| ActorContext copies `userId` when Present | [`../../packages/core/src/membership/actorContext.js`](../../packages/core/src/membership/actorContext.js) |
| RoleGate | [`../../packages/core/src/roleGate/`](../../packages/core/src/roleGate/) — role only; **not** DualAuthGate |

### AUTH modules (Present)

Barrel: [`../../packages/core/src/auth/`](../../packages/core/src/auth/) ([`index.js`](../../packages/core/src/auth/index.js)).

| Seam | Path / fact |
|------|-------------|
| SIWE-class challenge / verify | `issueChallenge`, `verifyAddressProof`, `buildSiweClassMessage`, `ChallengeStore` |
| Supabase Auth port + bind | `createMemorySupabaseAuthDouble`, `bindAddressToAuthUser`; live port = residual throw (`createLiveSupabaseAuthPortResidual`) |
| Bearer session | `issueBearerSession`, `validateBearer`, `logoutBearer`, `BearerSessionStore` (transport = bearer; not cookie) |
| DualAuthGate before RoleGate | `dualAuthGate`, `runWithDualAuthThenRoleGate`, `resolveMembershipForSession` |
| Bootstrap pool + founder | `bootstrapPoolAndFounder`, `assertBootstrapInput` |

**Still Absent / residual (do not claim Phase 2 Done):** live `@supabase/supabase-js` client (→ REQ-09); live unauth/role ACL gate honesty on host (→ REQ-08). **Present:** MetaMask / wallet proof client (**REQ-10 Accepted** `2026-11-24`). CLI DualAuthGate wiring as product Done = CLI residual. Railway family host = Present (REQ-07 Accepted).

**Post-bootstrap members (pointer):** Invite modules Present under [`../../packages/core/src/invite/`](../../packages/core/src/invite/) (REQ-05 / INV Done) — consume AUTH bind; not dual-auth invent.

---

## 1. Назначение

Обязательная двухступенчатая авторизация участника семьи:

1. Proof владения **address** подписью через сторонний некастодиальный wallet (класс MetaMask / SIWE).  
2. Bind к **Supabase user**; роль живёт на **membership** (user × family), не в тексте чата агента.

Без завершённого dual-auth family capabilities недоступны.

---

## 2. Подтверждённые решения

| Область | Требование |
|---|---|
| Уровень 1 | Challenge + подпись address некастодиальным wallet |
| Уровень 2 | После валидной подписи — create/link Supabase user; server session/token |
| Роль | На membership (и invite); не «роль в JWT на глаз», не промпт GPT |
| Gate | Нет dual-auth → отказ на любой family capability |
| Сессия | До logout или expiry (достаточно для MVP) |
| Login vs money | Login-подпись **≠** on-chain money signature (custody/money-sign — later) |
| Deploy | Приложение деплоится **на семью** |
| Bootstrap | Процесс подключает подписью **pool address** и **первый parent** address; parent address **может совпадать или не совпадать** с pool account. Env settings (Phase 2 lock): pool = `CAPY_POOL_ADDRESS`, founder parent = `PARENT_ADDRESS` — separate fields even if values equal (see REQ-08/10) |
| Address rebind | Смена address / перепривязка к user — **не Phase 0**; см. ROADMAP «Deferred beyond Phase 0» |

---

## 3. Bootstrap (логическая последовательность)

1. Family deploy instance.  
2. Bootstrap: proof **pool address** + proof **first parent address** (same or different).  
3. Create founder parent membership + bind pool identity for the family.  
4. Дальнейшие родители и дети — только через invite (REQ-05), не повторный bootstrap.

---

## 4. Out of scope

- Invite / parent-adds-child — REQ-05  
- Capability ACL table — REQ-06  
- Custody ключей пула/детей, повторная подпись на каждый transfer — later REQ / O-02  
- Address recovery / rebind — ROADMAP deferred  

---

## 5. Acceptance

| ID | Результат |
|---|---|
| AC-A01 | Capability без dual-auth отклоняется |
| AC-A02 | Валидная подпись address приводит к bind Supabase user |
| AC-A03 | Роль для действий берётся из membership, не из клиентского UI-режима |
| AC-A04 | Сессия действует до logout/expiry |
| AC-A05 | Bootstrap требует signed pool address и signed first parent address. **«Signed»** = prior successful `/auth/verify` **recorded** in verified AddressProof store (durable row / Soft inject), **not** a client-claimed `{address}` object alone. Object-path forge without store row → reject — story [`STORY-SCR-CAPY-AUTH-07-bootstrap-require-verified-proof`](../tasks/backlog-stories/capybara-dual-auth/STORY-SCR-CAPY-AUTH-07-bootstrap-require-verified-proof.md) (Soft≠Live Soft gate Present; **≠** invent Live Pass / REQ-04 Accepted) |
| AC-A06 | First parent address может равняться или отличаться от pool address |
| AC-A07 | Phase 0 не включает address rebind; пункт есть в Target ROADMAP deferred |
