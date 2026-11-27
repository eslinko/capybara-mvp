# Identity HTTP edge — operator manual (Phase 2)

**Profile:** `capybara` · **REQ:** [`../requirements/08-identity-http-edge-on-host.md`](../requirements/08-identity-http-edge-on-host.md)  
**Architecture:** [`../architecture/08-identity-http-edge-on-host/`](../architecture/08-identity-http-edge-on-host/)  
**Stories:** EDGE-01…06 · EDGE-11 (CORS) · **Host entry:** `npm start` → [`../../host/start.js`](../../host/start.js)

This manual is the AC-I07 deliverable. It documents how to bootstrap and verify the identity HTTP edge on the same process as `GET /health`.

---

## 1. Honesty (AC-I06 · Soft≠Live)

- **`cd capybara && npm test` alone ≠ Phase 2 identity Done.**
- Unit/harness green proves host compose under test (EDGE-01…03 · EDGE-11 CORS). It does **not** prove live DualAuth on Railway, live Supabase (REQ-09), MetaMask POC (REQ-10), or **Live Connector Pass**.
- EDGE-11 unit green ≠ invent Live Connector CORS Pass (AC-EDGE-11-04). Same-origin Connector mock ≠ CORS substitute.
- Do **not** claim Phase 2 Done from this manual or from unit green alone.

---

## 2. Env checklist

Required for identity routes (`/auth/*`, `/v1/capabilities/profile.self`) — production keyMap in [`../../host/authHttp.js`](../../host/authHttp.js):

| Env | Role |
|-----|------|
| `SUPABASE_URL` | Auth port URL class |
| `SUPABASE_SECRET_KEY` | Server secret key (optional alias: `SUPABASE_SERVICE_ROLE_KEY`) |
| `CAPY_BEARER_SECRET` | Bearer signing secret |
| `PORT` | Listen port (`npm start` fail-closed without it) |
| `CAPY_CONNECTOR_CORS_ORIGINS` | Optional comma-separated extra Connector Origins for `/auth/challenge|verify` CORS (EDGE-11). Defaults always allow `http://127.0.0.1:8080` + `http://localhost:8080`. Never `*`. Soft≠Live. |

Bootstrap address settings (**separate fields** — never merge):

| Env | Role |
|-----|------|
| `CAPY_POOL_ADDRESS` | Pool public address for bootstrap proofs |
| `PARENT_ADDRESS` | Founder parent public address |

Equal hex values are allowed; fields stay distinct (AC-I04 / REQ-04 AC-A05/A06). See [`.env.example`](../../.env.example).  
**B1 (AUTH-06):** pool identity is set **only at bootstrap** — [`POOL-AT-BOOTSTRAP-NO-LATE-API.md`](POOL-AT-BOOTSTRAP-NO-LATE-API.md). Do **not** invent a late pool founder API (**rejected B2**).

Missing auth classes → identity ops fail-closed (typically HTTP 503). `GET /health` stays open and must not echo secrets (AC-I05).

### 2.1 Local `.env` load (host vs CLI)

**Present (EDGE-05):** [`../../host/start.js`](../../host/start.js) calls [`../../host/loadHostDotenv.js`](../../host/loadHostDotenv.js) on `require.main` **before** `main()` / `resolveListenPort`. Loader reuses CLI path SSOT `CAPYBARA_DOTENV_PATH` + `dotenv` with **no overwrite** of keys already set in `process.env` (platform / Railway win). Missing `.env` → silent continue (image may have no file).

| Entry | How env reaches the process |
|-------|-----------------------------|
| Capybara **host** (`npm start` → `host/start.js`) | `loadHostDotenv` → `CAPYBARA_DOTENV_PATH` into `process.env` (no overwrite) · then `main()` |
| Capybara **CLI** / config | [`../../packages/core/src/config/index.js`](../../packages/core/src/config/index.js) — `dotenv.config({ path: CAPYBARA_DOTENV_PATH })` (unless `CAPYBARA_LAZY_CONFIG=1`) |

**Local start** (from `capybara/` root — fill package `.env` from [`.env.example`](../../.env.example)):

```bash
npm start
```

- No `set -a` / `source .env` dance required when package `.env` is Present with `PORT` + auth keyMap.
- Railway / prod: set the same keys in **platform** env (platform wins over file). `.env` is not baked into the image (HOST packaging).
- Never dump env/secrets in start logs (AC-H02 / AC-I05).

Cross-app Node start pattern (reference study; residual closed by EDGE-05/06): [`../analysis/analysis-arweave-uploader-node-env-startup-2026-11-22.md`](../analysis/analysis-arweave-uploader-node-env-startup-2026-11-22.md).

**Auth port (post SBPORT-01…05):** production host selects live port when auth env Present (`resolveAuthPort` in [`../../host/authHttp.js`](../../host/authHttp.js)); missing env fail-closed; units inject memory. **Live Supabase Auth bind proof** (real project `userId` after Sign→verify) = REQ-09 AC-S05 — see [`LIVE-SUPABASE-AUTH-PORT-HONESTY.md`](LIVE-SUPABASE-AUTH-PORT-HONESTY.md). Current bind evidence: **PASS** [`evidence/live-supabase-auth-bind-result.md`](evidence/live-supabase-auth-bind-result.md) · REQ-09 **Accepted** `2026-11-25`. Unit green alone ≠ invent Pass; Phase 2 full Done still needs REQ-08 ACL (AC-I06).

---

## 3. Local flows (EDGE-01…03)

Assume local host started with `npm start` after package `.env` is filled (`PORT` + auth keyMap — see §2.1; host loads `CAPYBARA_DOTENV_PATH` on entry). Examples use `http://127.0.0.1:$PORT`.

### 3.1 Session: challenge → verify → session → logout

```bash
# 1) Challenge for a wallet address
curl -sS -X POST "http://127.0.0.1:${PORT}/auth/challenge" \
  -H 'Content-Type: application/json' \
  -d '{"address":"0xYOUR_WALLET"}'

# 2) Sign returned `message` with the wallet; then verify
curl -sS -X POST "http://127.0.0.1:${PORT}/auth/verify" \
  -H 'Content-Type: application/json' \
  -d '{"challengeId":"…","signature":"0x…"}'
# Response includes Bearer `token` and `proof` (for bootstrap)

# 3) Validate session
curl -sS "http://127.0.0.1:${PORT}/auth/session" \
  -H "Authorization: Bearer ${TOKEN}"

# 4) Logout
curl -sS -X POST "http://127.0.0.1:${PORT}/auth/logout" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Example** (local `PORT=18080`, address = `CAPY_POOL_ADDRESS` from package `.env`):

```bash
# 1) Challenge
curl -sS -X POST "http://127.0.0.1:18080/auth/challenge" \
  -H 'Content-Type: application/json' \
  -d '{"address":"0xBd9A51792c36D21Dc203320d7055ED8e305E41Ef"}'

# 2) Sign returned `message` (MetaMask / wallet) → then verify
curl -sS -X POST "http://127.0.0.1:18080/auth/verify" \
  -H 'Content-Type: application/json' \
  -d '{"challengeId":"…","signature":"0x…"}'
# Response: Bearer `token` + `proof`

# 3) Session
curl -sS "http://127.0.0.1:18080/auth/session" \
  -H "Authorization: Bearer ${TOKEN}"

# 4) Logout
curl -sS -X POST "http://127.0.0.1:18080/auth/logout" \
  -H "Authorization: Bearer ${TOKEN}"
```

`challengeId` / `signature` / `TOKEN` — из ответов шагов 1–2.

Product: [`../../host/authHttp.js`](../../host/authHttp.js).

### 3.2 Bootstrap: pool + parent proofs (A1 — dual Sign → one bootstrap)

**Operator contract (AUTH-05):** [`FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md`](FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md).  
**Lock:** Sign/`verify` alone = Auth user **only** (≠ founder). Founder membership requires **one** `POST /auth/bootstrap` with **both** proofs. Do **not** invent founder-only / split-bootstrap API (**rejected A2**). AC-A05/A06 field separation unchanged.

1. Challenge+verify for **pool** address (default env `CAPY_POOL_ADDRESS`).  
2. Challenge+verify for **parent** address (default env `PARENT_ADDRESS`) — may equal pool hex.  
3. `POST /auth/bootstrap` with both AddressProofs (from verify `proof` fields, or challengeId+signature pairs).

```bash
curl -sS -X POST "http://127.0.0.1:${PORT}/auth/bootstrap" \
  -H 'Content-Type: application/json' \
  -d '{
    "poolProof": { "address":"…", "challengeId":"…", "verifiedAt":"…", "verifiedAtMs":0 },
    "parentProof": { "address":"…", "challengeId":"…", "verifiedAt":"…", "verifiedAtMs":0 }
  }'
```

- Omitting `familyId` → host generates one (U4).  
- Second bootstrap on a live family → reject (`EAUTH_BOOTSTRAP_REPLAY` / HTTP 409).

### 3.3 Capability probe `profile.self`

```bash
# Unauth → deny (AC-I01)
curl -sS -i "http://127.0.0.1:${PORT}/v1/capabilities/profile.self"

# Authed → DualAuthGate → CatalogAlias/RoleGate; minimal membership/role echo (AC-I02)
curl -sS -X POST "http://127.0.0.1:${PORT}/v1/capabilities/profile.self" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"clientClaimedRole":"child","familyId":"fam-…"}'
# Client-claimed role is ignored; role comes from membership only.
```

Product: [`../../host/capabilityProbe.js`](../../host/capabilityProbe.js).

### 3.4 Health coexistence

```bash
curl -sS "http://127.0.0.1:${PORT}/health"
# expect: {"ok":true} — no env/secret leak
```

---

## 4. In-memory residual after redeploy (G8 / EDGE-08)

MembershipStore **and** InviteStore are **in-memory** for Phase 2 ([`../architecture/08-identity-http-edge-on-host/03-env-verify-coexistence-residual.md`](../architecture/08-identity-http-edge-on-host/03-env-verify-coexistence-residual.md) · [`MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md`](MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md)).

After Railway redeploy / process restart:

- Family bootstrap + memberships are **cleared**.  
- Open / accepted invites in InviteStore are **cleared**.  
- Operator must **re-run bootstrap** (pool + parent proofs) and **re-createInvite** as needed.  
- Bearer sessions / SignTokens are TTL/ephemeral — wipe on restart is **allowed** honesty (not membership durability Done).  
- Persistent membership / invite store / journals = Phase 3 — **not** invented by EDGE-08 docs.  
- **Residual:** do not invent live multi-step onboarding Pass across redeploys while in-memory (AC-G8-03/04).

---

## 5. Live Railway section (honesty / residual)

### 5.1 Proven (HOST-03)

Remote **health** Present (HOST-03 gate evidence):

```bash
curl -sS https://host-production-54a9d4ce.up.railway.app/health
# documented Present: HTTP 200 {"ok":true}
```

Documented public alias in REQ-07/08: `https://capybara-mvp.up.railway.app/health` (operator ROADMAP accept). Prefer the HOST-03 service URL above when citing deploy evidence.

### 5.2 Identity edge on remote — residual (do not invent PASS)

As of this manual:

- EDGE-01…03 code is Present in-repo and green under **unit**.  
- **Live unauth** `GET /v1/capabilities/profile.self` → **401 deny Pass** recorded EDGE-09 — [`evidence/live-acl-profile-self-unauth-deny-result.md`](evidence/live-acl-profile-self-unauth-deny-result.md).  
- **Live founder allow / cast** = **Residual** until Bearer evidence — [`evidence/live-acl-profile-self-residual.md`](evidence/live-acl-profile-self-residual.md) · checklist [`LIVE-ACL-PROFILE-SELF-PROOF.md`](LIVE-ACL-PROFILE-SELF-PROOF.md).  
- Remote `/auth/*` bootstrap + authed probe: do **not** invent Pass / REQ-08 Accepted / Phase 2 Done (AC-I06).

Suggested verify commands (run only after a deploy that includes EDGE code + auth env):

```bash
BASE=https://host-production-54a9d4ce.up.railway.app
curl -sS -i "$BASE/health"
curl -sS -i -X POST "$BASE/auth/challenge" -H 'Content-Type: application/json' \
  -d '{"address":"0x…"}'
curl -sS -i "$BASE/v1/capabilities/profile.self"
```

If challenge/probe returns unexpected 404/502/empty — document residual; do **not** invent Phase 2 live Done.

---

## 6. REQ-09 live Supabase bind honesty (pointer)

Live create/link after address proof = **REQ-09** AC-S05:

- Operator checklist + residual template: [`LIVE-SUPABASE-AUTH-PORT-HONESTY.md`](LIVE-SUPABASE-AUTH-PORT-HONESTY.md)
- Pass evidence: [`evidence/live-supabase-auth-bind-result.md`](evidence/live-supabase-auth-bind-result.md) · historical residual: [`evidence/live-supabase-auth-bind-residual.md`](evidence/live-supabase-auth-bind-residual.md)
- REQ: [`../requirements/09-live-supabase-auth-port.md`](../requirements/09-live-supabase-auth-port.md)

Live bind Pass recorded `2026-11-25` — see evidence. `npm test` green alone ≠ invent Pass.

---

## 7. REQ-10 MetaMask / wallet POC pointer

Terminal MetaMask / address-proof client POC = **REQ-10** when Present:

- [`../requirements/10-wallet-address-proof-client.md`](../requirements/10-wallet-address-proof-client.md)
- Channel A (desktop MetaMask **extension**) procedure: [`WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md`](./WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md)
- Channel A evidence / residual record: [`evidence/channel-a-desktop-metamask-extension-result.md`](./evidence/channel-a-desktop-metamask-extension-result.md)
- Channel B (MetaMask **in-app browser**) procedure: [`WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md`](./WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md)
- Channel B evidence / residual record: [`evidence/channel-b-mobile-metamask-browser-result.md`](./evidence/channel-b-mobile-metamask-browser-result.md)

This manual does **not** invent live MetaMask PASS. POC reads `CAPY_POOL_ADDRESS`, drives challenge against this edge, MetaMask Sign, submit verify (arch pointer).

---

## 8. Related links

| Doc | Path |
|-----|------|
| USER-MANUAL (CLI) | [`USER-MANUAL.md`](./USER-MANUAL.md) |
| REQ-08 | [`../requirements/08-identity-http-edge-on-host.md`](../requirements/08-identity-http-edge-on-host.md) |
| REQ-09 · AC-S05 honesty | [`LIVE-SUPABASE-AUTH-PORT-HONESTY.md`](LIVE-SUPABASE-AUTH-PORT-HONESTY.md) · [`../requirements/09-live-supabase-auth-port.md`](../requirements/09-live-supabase-auth-port.md) |
| Arch-08 | [`../architecture/08-identity-http-edge-on-host/00-overview.md`](../architecture/08-identity-http-edge-on-host/00-overview.md) |
| HOST-03 live health gate | [`../tasks/epics/EPIC-SCR-CAPY-HOST/stories/STORY-SCR-CAPY-HOST-03-railway-live-health/story-acceptance-gate-STORY-SCR-CAPY-HOST-03-railway-live-health.md`](../tasks/epics/EPIC-SCR-CAPY-HOST/stories/STORY-SCR-CAPY-HOST-03-railway-live-health/story-acceptance-gate-STORY-SCR-CAPY-HOST-03-railway-live-health.md) |
