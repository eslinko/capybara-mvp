# 12 — Postgres durability: family identity + journals (+ verified proofs)

Дата: 2026-11-27  
Источник: Operator product lock `2026-11-27` (1A + 2B) · EDGE-08 / G8 residual · Target ROADMAP Phase 3 · parent PRD family MVP  
Status: **Draft** — Soft adapters/migrations Present (PGDUR-01…04 Soft≠Live); **Live** redeploy/cast Pass **Residual** · REQ **not** Accepted  
Profile: `capybara` · focus `capybara/`  
Related: [`04-dual-auth-wallet-supabase-user.md`](04-dual-auth-wallet-supabase-user.md) · [`05-family-membership-parent-adds-child.md`](05-family-membership-parent-adds-child.md) · [`08-identity-http-edge-on-host.md`](08-identity-http-edge-on-host.md) · [`09-live-supabase-auth-port.md`](09-live-supabase-auth-port.md) · domain journals [`01-child-debt-accounting.md`](01-child-debt-accounting.md) · [`02-activity-payout-advance.md`](02-activity-payout-advance.md) · Target [`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md) Phase 3 · residual [`../manuals/MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md`](../manuals/MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md) · cast Soft assert [`../tasks/backlog-stories/capybara-postgres-family-identity-and-journals/STORY-SCR-CAPY-PGDUR-06-durable-cast-invite-path-assert.md`](../tasks/backlog-stories/capybara-postgres-family-identity-and-journals/STORY-SCR-CAPY-PGDUR-06-durable-cast-invite-path-assert.md) · stores RAM inject doubles + Postgres adapters Soft · [`../../packages/core/src/auth/ChallengeStore.js`](../../packages/core/src/auth/ChallengeStore.js)  
Architecture: [`../architecture/12-postgres-family-identity-and-journals/00-overview.md`](../architecture/12-postgres-family-identity-and-journals/00-overview.md) · siblings [`01`](../architecture/12-postgres-family-identity-and-journals/01-components-and-client-seam.md) · [`02`](../architecture/12-postgres-family-identity-and-journals/02-logical-data-and-contracts.md) · [`03`](../architecture/12-postgres-family-identity-and-journals/03-runtime-env-packaging-verify.md) · [`04`](../architecture/12-postgres-family-identity-and-journals/04-migration-coexistence-residual.md)  
Interview report (tech-arch): [`../analysis/zeya888.target-tech-arch-interview-12-postgres-family-identity-and-journals-2026-11-27.md`](../analysis/zeya888.target-tech-arch-interview-12-postgres-family-identity-and-journals-2026-11-27.md)  
Interview / product answers: **1A** verified AddressProof durable; pending challenge + Bearer ephemeral · **2B** one REQ = identity **and** journals → Postgres primary (not dual-write as goal) · tech-arch auto-locks `2026-11-27T17:23:20Z`

Пометка: закрывает EDGE-08 / AC-G8 membership+invite durability Residual и Phase 3 journals persistence одним продуктовым REQ **после** Live Pass. Soft≠Live: Soft adapters Present ≠ invent Live Pass / REQ Accepted.

---

## 0. Verified as-is (`2026-11-27T20:17:28Z` refresh · Soft≠Live)

| Seam | Fact |
|------|------|
| Family / Membership / pool / bootstrapped | **Soft Present** — `PostgresMembershipStore` when host `createClient` + Auth config Present (PGDUR-02); else **FailClosed**. RAM `MembershipStore` = **inject / unit only** (AC-P08). Production must not silent-ok empty RAM as SoT (AC-P06). |
| Invite open/accepted | **Soft Present** — `PostgresInviteStore` same compose rule (PGDUR-02). |
| Pending challenge | **Present in RAM** — `ChallengeStore` TTL ~5 min; wipe allowed |
| Bearer session | **Present in RAM** — `BearerSessionStore` TTL; wipe allowed (EDGE-08 carve-out) |
| SignToken | **Present in RAM** — ephemeral; wipe allowed |
| Verified AddressProof | **Soft Present** durable rows — `PostgresVerifiedAddressProofStore` / `verified_address_proofs` after verify (PGDUR-03 Soft). Bootstrap object-path gates on store — AUTH-07 Soft Present Soft≠Live. |
| Supabase Auth users | **Present durable** (REQ-09 Accepted) — create/link only; not membership tables |
| Activity / advance / debt journals | **Soft Present** Postgres journal adapters (PGDUR-04 Soft); NDJSON archive residual |
| App SQL / `supabase/` migrations in `capybara/` | **Soft Present** (PGDUR-01) — Live apply may be Present on operator project; Soft≠Live alone ≠ REQ Done |
| Membership + invite survive redeploy (AC-G8-01/02) | **Live Residual** — Soft adapters Present · Live Pass Absent — [`../manuals/MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md`](../manuals/MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md) · PGDUR-05 Residual |
| Cast write path (bootstrap / invite / verify-bind) | **Soft Present** assert (PGDUR-06 Soft≠Live): compose `store_kind` (`postgres` \| `fail-closed` \| `memory-inject`) via `describeAuthEnvPresence` / startup; cast ops use `runtime.*Store`. Operator `ok` without row = wrong SoT/process — not “fixed” by `CAPY_POOL`/`PARENT` alone. **Live cast Pass Residual OK** — ≠ invent Pass / REQ Accepted. |

---

## 1. Назначение

Сделать **Postgres (Supabase Postgres)** единственным durable source of truth для:

1. **Family identity** — family, membership (role, address, userId), pool identity, bootstrapped flag, invites.  
2. **Verified address proofs** — запись успешного verify (audit / replay gate), без durable pending challenge.  
3. **Domain journals** — activity, advance, debt (логические сущности REQ-01/02), с сохранением mock vs reality split.

После Accept + implement: Railway redeploy **не** требует re-bootstrap / re-invite для уже записанной семьи; journal history читается из Postgres, не как sole SoT из NDJSON.

---

## 2. Подтверждённые решения (operator lock)

| Область | Требование |
|---|---|
| Store target | **Supabase Postgres** (same project family as Auth) — not Mongo, not invent alternate DB for MVP |
| Cutover | **Postgres primary** for in-scope data; dual-write file+DB **не** является целью этого REQ (отмена прежней формулировки Phase 3 «dual-write then primary») |
| Identity entities | Family, Membership, Invite — те же логические поля, что в in-memory stores (REQ-04/05); role на membership |
| Proofs (1A) | Persist **только verified** AddressProof (после успешного `verifyAddressProof` / host verify path). Поля логически: `address`, `challengeId`, `verifiedAt` (+ server-side id / family linkage as Architect locks later) |
| Challenge / Bearer (1A) | Pending `ChallengeStore` + `BearerSessionStore` (+ SignToken) **остаются ephemeral** — wipe on redeploy **не** defect |
| Journals (2B) | Activity + advance + debt ledgers → Postgres primary; mock vs reality split **preserved** |
| Auth users | Continue Supabase Auth bind (REQ-09); this REQ does **not** replace Auth with custom users table |
| Redeploy gate | After bootstrap + open invite (+ optional accept): redeploy → memberships/invites/proofs/journals still resolvable (replaces EDGE-08 Residual) |
| Unit inject | In-memory / test doubles remain for `npm test`; production host must not silently fall back to RAM-only SoT for in-scope entities |
| Secrets | DB credentials server-side env only (Railway); never Git; never `/health` leak |

---

## 3. Логические сценарии

### FR-P01. Bootstrap survives redeploy

1. Founder completes pool+parent bootstrap (REQ-04/08).  
2. Family + founder membership + pool identity written to Postgres.  
3. Host redeploy → DualAuth/RoleGate still resolve founder membership **without** second bootstrap (replay bootstrap still forbidden).

### FR-P02. Invite survives redeploy

1. Parent creates open invite (REQ-05 / INV-04).  
2. Redeploy → invite still open; invitee verify→accept still binds membership with invite role.

### FR-P03. Verified proof durable

1. Successful `/auth/verify` (or core verify) produces AddressProof.  
2. Proof row persisted in Postgres.  
3. Redeploy does **not** erase the verified-proof audit; pending unused challenges may still vanish.

### FR-P04. Journals in Postgres

1. Domain actions that today append NDJSON (activity / advance / debt) write durable rows in Postgres as primary.  
2. Mock mode remains isolated from reality data (existing mock split preserved).  
3. Operator can reconstruct history after redeploy without reading sole SoT from `logs/` files.

### FR-P05. Fail-closed production

Missing/invalid Postgres config on production host → fail closed for durable writes/reads of in-scope entities (no silent empty RAM family as “success”).

---

## 4. Out of scope

- Pending challenge durability / multi-instance challenge sticky store  
- Bearer session or SignToken durability (cookies, Redis, etc.)  
- Address rebind / wallet recovery — ROADMAP deferred  
- MCP / Skill — Phase 4  
- Express CRUD family API as product contract  
- Soft-disable / hard-delete member with history wipe beyond REQ-05 Phase 0 locks  
- Opaque invite token / `family.invite_member` id residual (REQ-05) — not invented here  
- Creating SQL migrations, table files, adapters, or architecture packs in this REQ ask (**name ≠ create**)  
- Claiming Phase 3 Done from this Draft alone  

---

## 5. Acceptance

| ID | Результат |
|---|---|
| AC-P01 | Production host uses Postgres as primary store for Family + Membership (+ pool / bootstrapped). Soft adapters Present (PGDUR-02); Live Pass Residual — Soft≠Live. Cast Soft assert: [`STORY-SCR-CAPY-PGDUR-06`](../tasks/backlog-stories/capybara-postgres-family-identity-and-journals/STORY-SCR-CAPY-PGDUR-06-durable-cast-invite-path-assert.md) |
| AC-P02 | Open and accepted Invites survive host redeploy and remain usable for bind/accept. Soft store Present; Live Residual — same Soft≠Live honesty |
| AC-P03 | Verified AddressProof records persist in Postgres after successful verify; pending challenges may remain ephemeral |
| AC-P04 | Activity, advance, and debt journal history uses Postgres as primary (mock/reality split intact) |
| AC-P05 | After redeploy, prior memberships resolvable for DualAuthGate / RoleGate (closes EDGE-08 AC-G8-01 class) |
| AC-P06 | Missing/invalid DB config fails closed on production durable paths (no silent RAM-only SoT) |
| AC-P07 | Secrets stay server-side env; not committed; not leaked via health/auth error bodies |
| AC-P08 | Memory/test doubles remain for unit tests; `npm test` green alone ≠ Phase 3 / this REQ Done — live redeploy + journal read proof required |
| AC-P09 | Operator evidence / manual path for redeploy + journal check Present after implement wave (path TBD in stories — name ≠ create here) |

---

## 6. Named future paths (acceptance targets — not present until implement)

**Locked (OP + proposal `2026-11-27`):**

- Migrations dir: `capybara/supabase/migrations/` · files `YYYYMMDDHHMMSS_<slug>.sql`  
- Tables: `families` · `memberships` · `invites` · `verified_address_proofs` · `activity_journal_entries` · `advance_journal_entries` · `debt_journal_entries`  
- Journal `mode` ∈ {`mock`,`gfl_reality`}  
- Backlog: [`../tasks/backlog-stories/capybara-postgres-family-identity-and-journals/`](../tasks/backlog-stories/capybara-postgres-family-identity-and-journals/) · proposal [`../analysis/proposal-pgdur-stories-2026-11-27.md`](../analysis/proposal-pgdur-stories-2026-11-27.md)

Soft Present: SQL migrations · durable adapters (PGDUR-01…04). Still Residual until Live Pass: operator redeploy/cast evidence (PGDUR-05/06 Soft≠Live) — ≠ REQ Accepted from Soft alone.

**Verified state until implement:** migrations/adapters/evidence **Absent** on disk; §0 RAM + NDJSON remain SoT.
