# Identity HTTP edge — operator manual (Phase 2)

**Profile:** `capybara` · **REQ:** [`../requirements/08-identity-http-edge-on-host.md`](../requirements/08-identity-http-edge-on-host.md)  
**Architecture:** [`../architecture/08-identity-http-edge-on-host/`](../architecture/08-identity-http-edge-on-host/)  
**Stories:** EDGE-01…04 · **Host entry:** `npm start` → [`../../host/start.js`](../../host/start.js)

This manual is the AC-I07 deliverable. It documents how to bootstrap and verify the identity HTTP edge on the same process as `GET /health`.

---

## 1. Honesty (AC-I06)

- **`cd capybara && npm test` alone ≠ Phase 2 identity Done.**
- Unit/harness green proves host compose under test (EDGE-01…03). It does **not** prove live DualAuth on Railway, live Supabase (REQ-09), or MetaMask POC (REQ-10).
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

Bootstrap address settings (**separate fields** — never merge):

| Env | Role |
|-----|------|
| `CAPY_POOL_ADDRESS` | Pool public address for bootstrap proofs |
| `PARENT_ADDRESS` | Founder parent public address |

Equal hex values are allowed; fields stay distinct (AC-I04 / REQ-04 AC-A05/A06). See [`.env.example`](../../.env.example).

Missing auth classes → identity ops fail-closed (typically HTTP 503). `GET /health` stays open and must not echo secrets (AC-I05).

**Residual:** default Auth port is the in-process memory double. Live `@supabase/supabase-js` = REQ-09 — not this manual.

---

## 3. Local flows (EDGE-01…03)

Assume local host with env set and `npm start` listening on `$PORT` (examples use `http://127.0.0.1:$PORT`).

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

Product: [`../../host/authHttp.js`](../../host/authHttp.js).

### 3.2 Bootstrap: pool + parent proofs

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

## 4. In-memory residual after redeploy

MembershipStore is **in-memory** for Phase 2 ([`../architecture/08-identity-http-edge-on-host/03-env-verify-coexistence-residual.md`](../architecture/08-identity-http-edge-on-host/03-env-verify-coexistence-residual.md)).

After Railway redeploy / process restart:

- Family bootstrap state is **cleared**.  
- Operator must **re-run bootstrap** (pool + parent proofs).  
- Persistent membership / journals = Phase 3 — not this package.

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
- **Remote** `/auth/*`, `/auth/bootstrap`, and `/v1/capabilities/profile.self` are **not** claimed Present here unless a later live-run records evidence.  
- Treat remote identity edge as **residual** until curl/evidence is attached in a future run-summary/gate.

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

## 6. REQ-10 MetaMask / wallet POC pointer

Terminal MetaMask / address-proof client POC = **REQ-10** when Present:

- [`../requirements/10-wallet-address-proof-client.md`](../requirements/10-wallet-address-proof-client.md)

This manual does **not** implement or invent REQ-10 POC bodies. POC reads `CAPY_POOL_ADDRESS`, drives challenge against this edge, MetaMask Sign, submit verify (arch pointer).

---

## 7. Related links

| Doc | Path |
|-----|------|
| USER-MANUAL (CLI) | [`USER-MANUAL.md`](./USER-MANUAL.md) |
| REQ-08 | [`../requirements/08-identity-http-edge-on-host.md`](../requirements/08-identity-http-edge-on-host.md) |
| REQ-09 (live Supabase residual) | [`../requirements/09-live-supabase-auth-port.md`](../requirements/09-live-supabase-auth-port.md) |
| Arch-08 | [`../architecture/08-identity-http-edge-on-host/00-overview.md`](../architecture/08-identity-http-edge-on-host/00-overview.md) |
| HOST-03 live health gate | [`../tasks/epics/EPIC-SCR-CAPY-HOST/stories/STORY-SCR-CAPY-HOST-03-railway-live-health/story-acceptance-gate-STORY-SCR-CAPY-HOST-03-railway-live-health.md`](../tasks/epics/EPIC-SCR-CAPY-HOST/stories/STORY-SCR-CAPY-HOST-03-railway-live-health/story-acceptance-gate-STORY-SCR-CAPY-HOST-03-railway-live-health.md) |
