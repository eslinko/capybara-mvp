# 08 — Identity HTTP edge on host (Phase 2)

Дата: 2026-11-21  
Источник: Target ROADMAP Phase 2 · REQ-04 live residual · REQ-07 host Done · arch-04 host-primary  
Status: Draft — tech-arch Present (`architecture/08-…`); HTTP auth edge implement **Absent**  
Profile: `capybara` · focus `capybara/`  
Related: [`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md) Phase 2 · implement [`../tasks/backlog-stories/capybara-identity-http-edge/INDEX.md`](../tasks/backlog-stories/capybara-identity-http-edge/INDEX.md) (EDGE-01…12) · parent contract [`04-dual-auth-wallet-supabase-user.md`](04-dual-auth-wallet-supabase-user.md) · host [`07-railway-family-host.md`](07-railway-family-host.md) · live Supabase [`09-live-supabase-auth-port.md`](09-live-supabase-auth-port.md) · wallet client [`10-wallet-address-proof-client.md`](10-wallet-address-proof-client.md) · roles [`03-family-roles-and-capability-matrix.md`](03-family-roles-and-capability-matrix.md) · catalog [`06-role-scoped-capability-catalog.md`](06-role-scoped-capability-catalog.md) · auth core [`../../packages/core/src/auth/`](../../packages/core/src/auth/) · host [`../../host/`](../../host/) · Connector adapter contract [`../../../doge-connector/docs/ops-platform-adapter-contract.md`](../../../doge-connector/docs/ops-platform-adapter-contract.md) (PAUTH-09) · integrator [`../../../doge-connector/docs/manuals/platform-integrator-guide.md`](../../../doge-connector/docs/manuals/platform-integrator-guide.md)  
Architecture: [`../architecture/08-identity-http-edge-on-host/00-overview.md`](../architecture/08-identity-http-edge-on-host/00-overview.md) · siblings [`01`](../architecture/08-identity-http-edge-on-host/01-components-and-http-surface.md) · [`02`](../architecture/08-identity-http-edge-on-host/02-bootstrap-session-and-capability-probe.md) · [`03`](../architecture/08-identity-http-edge-on-host/03-env-verify-coexistence-residual.md) · [`04` Connector CORS + Origin domain](../architecture/08-identity-http-edge-on-host/04-connector-cors-and-challenge-origin.md) · prior [`../architecture/04-dual-auth-wallet-supabase-user/00-overview.md`](../architecture/04-dual-auth-wallet-supabase-user/00-overview.md) · [`../architecture/07-railway-family-host/00-overview.md`](../architecture/07-railway-family-host/00-overview.md)  
Interview report: [`../analysis/zeya888.target-tech-arch-interview-08-identity-http-edge-on-host-2026-11-21.md`](../analysis/zeya888.target-tech-arch-interview-08-identity-http-edge-on-host-2026-11-21.md)  
Interview: Phase 0 dual-auth locks 2026-11-19 · Phase 1 auth-live→Phase 2 2026-11-21 · Phase 2 REQ materialize `2026-11-21T13:43:45Z` · operator lock env/manual/POC `2026-11-21T14:34:00Z` · tech-arch auto UX/arch `2026-11-21T14:42:22Z` · Connector adapter Story-wave lock `2026-11-27` (EDGE-11/12 · Soft≠Live)

Пометка: **live identity edge** на том же Railway host, что закрыл Phase 1. Переносит Phase 0 AUTH modules на HTTP: challenge / verify / session / logout / bootstrap + DualAuthGate перед family capabilities. Не создаёт Express CRUD product API. Naming future routes / manual / POC = acceptance targets; **name ≠ create** until implement / story wave.

---

## 0. Verified as-is

| Seam | Fact |
|------|------|
| Host process | Present — `npm start` / [`../../host/`](../../host/); Railway `https://capybara-mvp.up.railway.app` |
| HTTP surface today | Only `GET /health` → `{"ok":true}` ([`../../host/health.js`](../../host/health.js)); other paths → 404 `not_found` |
| AUTH modules | Present in-process — challenge, bearer session, DualAuthGate, bootstrap ([`../../packages/core/src/auth/`](../../packages/core/src/auth/)) |
| RoleGate / CatalogAlias | Present ([`../../packages/core/src/roleGate/`](../../packages/core/src/roleGate/)); not wired on host HTTP |
| HTTP auth / capability routes | **Absent** |
| Live Supabase Auth port | Residual throw — REQ-09 |
| Wallet proof client | **Present / Accepted** — REQ-10 (`2026-11-24` live A+B) |
| MembershipStore | In-memory Present; persistence = later / Unknown (not Phase 2 invent) |
| `POST /auth/challenge` · `/auth/verify` (as-of EDGE Done) | **Present** — `host/authHttp.js` (Soft≠Live: historical §0 rows above may lag; paths Present) |
| CORS for Connector Origin | **Absent** — gap vs PAUTH-09 contract §3 (EDGE-11) |
| SIWE domain/URI = Connector signing origin | **Absent** (defaults `capybara.local` / `capybara://…` Present) — gap vs PAUTH-09 §4 (EDGE-12) |
| Live Connector→Capybara verify Pass | **Not claimed** until EDGE-11/12 Done + evidence |

---

## 1. Назначение

Навесить на Phase 1 host **production identity edge**: клиент (REQ-10) и будущие MCP/Skill могут завершить dual-auth и вызывать family capabilities только через server-side DualAuthGate → RoleGate/CatalogAlias. Gate Phase 2: unauthenticated capability calls denied; role ACL enforced server-side.

---

## 2. Подтверждённые решения

| Область | Требование |
|---|---|
| Process | Same Railway service / `npm start` entry as REQ-07 (no second product service for MVP) |
| Health | `GET /health` остаётся открытым (без dual-auth) |
| Identity ops | Host exposes HTTP for: issue challenge, verify address proof, session validate, logout, family bootstrap (pool + first parent) — contracts from REQ-04 AC-A02…A06 |
| Gate order | DualAuthGate **before** RoleGate / CatalogAlias on family capability calls (REQ-04 AC-A01 / AC-A03) |
| Session | Bearer until logout/expiry (AUTH transport Present); not invent cookie as required |
| Role source | Membership role — not client UI mode / chat text |
| Capability surface | At least one live family capability path on host that runs DualAuthGate→RoleGate (prove ROADMAP gate); not full Express CRUD catalog |
| Secrets | Session / challenge / Supabase secrets server-side env only (with REQ-09) |
| Pool vs parent env | Bootstrap settings keep **separate** fields: pool address = `CAPY_POOL_ADDRESS`; founder parent address = existing `PARENT_ADDRESS`. Values **may be equal**; concepts must not be merged into one field (REQ-04 AC-A05/A06) |
| Operator manual | Derivative stories for this REQ (and Phase 2 siblings as needed) **must** deliver an operator manual describing bootstrap + live verify steps |
| Terminal POC | Story-delivered POC (detail in REQ-10) drives automated terminal flow that ends in MetaMask sign for `CAPY_POOL_ADDRESS` against this edge |
| Connector CORS | Host must allow Connector signing Origin(s) on `/auth/challenge` and `/auth/verify` (matrix in PAUTH-09 contract §3). Detail AC in **EDGE-11** |
| Connector challenge domain/URI | When request Origin is Connector signing origin, SIWE-class `domain`/`URI` must equal that origin; forbid `capybara.local` / `capybara://…` for Connector flow. Detail AC in **EDGE-12** |
| AC ownership | Connector-adapter acceptance lives in STORY EDGE-11/12 (Scope/AC/Verified/OOS) — this REQ only locks the obligation class |

---

## 3. Out of scope

- Live `@supabase/supabase-js` port body — REQ-09  
- Wallet / MetaMask-class UI / terminal POC body — REQ-10  
- Journals → Supabase — Phase 3  
- MCP tools / ChatGPT Skill — Phase 4  
- Express CRUD family API as product contract  
- Address rebind / wallet recovery — ROADMAP deferred  
- Custody / money-sign (PRD O-02); pool/parent **private keys** for login POC  
- Creating route files / handlers / manual body in this REQ ask (name ≠ create)

---

## 4. Acceptance

| ID | Результат |
|---|---|
| AC-I01 | Unauthenticated family capability call on live host is denied (ROADMAP Phase 2 gate) |
| AC-I02 | After valid dual-auth session, capability call is subject to RoleGate/CatalogAlias (role ACL live server-side) |
| AC-I03 | Host supports challenge → verify → bearer session → logout over HTTP using Phase 0 AUTH contracts |
| AC-I04 | Bootstrap over HTTP requires signed pool address + signed first parent address (REQ-04 AC-A05/A06); pool input resolves from **`CAPY_POOL_ADDRESS`** as distinct setting from `PARENT_ADDRESS` |
| AC-I05 | `GET /health` remains OK without auth and does not leak secrets |
| AC-I06 | Unit/`npm test` green alone does **not** count as Phase 2 identity Done — live host proof required |
| AC-I07 | After derivative stories Done: operator manual Present (how to bootstrap/verify on host); path TBD in stories — name ≠ create here |
| AC-I08 | Connector CORS obligation closed by **EDGE-11** Done (Soft≠Live: story AC; Live Pass not invented here) |
| AC-I09 | Connector Origin→SIWE domain/URI obligation closed by **EDGE-12** Done (Soft≠Live; Live Pass not invented here) |

---

## 5. Named future paths (acceptance targets — not present until implement)

Logical targets only (exact paths TBD in Architect Studio / implement wave):

- Host HTTP handlers for identity ops + gated capability probe (extend [`../../host/`](../../host/) or sibling module)  
- Wire DualAuthGate + RoleGate/CatalogAlias into those handlers  
- Documented public base URL remains Railway host (e.g. `https://capybara-mvp.up.railway.app`)  
- Operator manual artifact (from stories) under `docs/manuals/` or story-agreed path  

**Verified state until implement:** HTTP auth/capability routes Absent; operator manual Absent (see §0).
