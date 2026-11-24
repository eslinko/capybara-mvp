# 02 — Dual channels and unique-token URL

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-23` · **rev:** validator FAIL wave3 `/result` transitions  
**REQ:** AC-W08 · AC-W09  
**Crypto:** C8, C10–C15

## Chosen token model (single)

**Token opens challenge only** — and only while the challenge is still **pending**.

- `GET /sign/{signToken}` returns **HTML with server bootstrap** JSON (`challengeId`, `message`, `address`, `expiresAt`) **only if** token is active **and** bound challenge would still succeed `ChallengeStore.get` as pending.  
- **No** separate resolve JSON required for Sign UX; bootstrap is the delivery.  
- Completion = ordinary `POST /auth/verify` with `{ challengeId, signature }` — **`signToken` not in verify body**.  
- On **successful** verify order: (1) **challenge consumed** (login SoT) → (2) **write `result=ok`** → (3) mark token consumed for HTML → respond verify JSON.  
- **If `result=ok` write fails after challenge consume:** login still ok; HTML fail-closed; **`/result` stays `pending`** → POC exit ≠ 0 on **first of** local timeout **or** `/result` 4xx after `expiresAt` (do **not** promise ok). Residual: host log.  
- **If result written then token mark fails:** login ok; POC gets `ok`; HTML still fail-closed (challenge gone).  
- Acceptance split:  
  - «verify ok + result written → POC `ok`; re-open HTML fails»  
  - «verify ok + result write failed → POC fail-closed (timeout or 4xx, whichever first); re-open HTML fails; login still done»  
- Pending token alone is **not** enough after challenge death.

`GET /sign/{signToken}/result` = POC/status JSON only (not message bootstrap). See [`00-overview.md`](./00-overview.md).

Phase 2 operator opens URL manually. **MCP consumer** that returns the URL = ROADMAP Phase 4 residual only.

---

## Shared start: mint (both channels)

1. Caller (Terminal POC) `POST` mint sign-session with address (`CAPY_POOL_ADDRESS` for POC).  
2. **Mint auth (locked):** header `X-Capy-Sign-Mint-Secret` must equal env `CAPY_SIGN_MINT_SECRET`.  
   - Env **unset** → mint **503** fail-closed.  
   - Wrong/missing header → **401**.  
3. Host: require `CAPY_PUBLIC_BASE_URL` (absolute HTTPS origin, no trailing slash) — **if unset → mint fail-closed**.  
4. Host: `issueChallenge(store, address, { domain: hostnameFromBaseUrl, uri: baseUrl + '/sign' })`.  
5. Host: create `signToken` (store rules) bound **1:1** to that `challengeId`; init result status `pending`.  
6. Return `{ signToken, url: baseUrl + '/sign/' + signToken, challengeId, expiresAt }` (`Cache-Control: no-store`).

**Re-mint:** new challenge + new token; **must not** attach two active tokens to one challengeId.

---

## Delivery: HTML bootstrap (single model)

| Request | Returns when valid | Fail-closed / notes |
|---------|-------------------|---------------------|
| `GET /sign/{signToken}` | HTML + embedded bootstrap `{ challengeId, message, address, expiresAt }` | Unknown / expired / consumed token **or** challenge missing/not pending |
| `GET /sign/{signToken}/result` | `{ status: pending\|ok, … }` residual-safe | Unknown token / past `expiresAt`. After HTML token consumed, **`ok` remains readable until `expiresAt`**. `wallet_reject` does **not** produce terminal `failed` |
| `POST /sign/{signToken}/client-event` | Ack; **does not** set terminal `/result` status (`wallet_reject` leaves `pending`) | Bad token; after `ok` → no-op (server `ok` precedence) |

Headers: `Cache-Control: no-store`; Sign HTML: `Referrer-Policy: no-referrer`. No raw `signToken` in application logs.

---

## Channel A — Desktop MetaMask extension

1. Mint URL (POC). Bare `/sign` without token is **not** a valid start.  
2. Open `url` in desktop browser with MetaMask **extension**.  
3. Page uses **bootstrap** from HTML → Connect → `personal_sign` ([`01-…`](./01-personal-sign-and-verify.md)).  
4. Page `POST /auth/verify` `{ challengeId, signature }`.  
5. Host on success: consume challenge → `result=ok` → mark token. POC learns via **`/result` poll only**. Cancel → retry same URL; POC keeps polling.

## Channel B — Mobile MetaMask in-app browser

1. Same mint URL.  
2. Operator opens URL in **MetaMask browser**.  
3. Same page JS (C15).  
4. Same verify / consume / result. Wallet reject → optional `client-event`; `/result` stays `pending`; POC continues until `ok` or fail-closed (local timeout **or** 4xx/`expiresAt` — first wins; not immediate fail on reject).

---

## SignTokenStore rules

| Rule | Lock |
|------|------|
| Entropy | CSPRNG; ≥16 bytes; lowercase hex (32+ chars) |
| Binding | Exactly one `challengeId` per active `signToken` |
| TTL | `expiresAtMs` ≤ challenge `expiresAtMs` |
| HTML unknown/expired/consumed | Fail-closed |
| HTML OK | Token active **and** challenge **pending**; do **not** consume token on page load (refresh allowed while both alive) |
| Verify success order | (1) challenge consume (2) write `result=ok` (3) mark token consumed for HTML |
| Result write fail after consume | `/result` stays `pending` → POC exit ≠ 0 on first of local timeout **or** 4xx after `expiresAt`; login still done; HTML fail-closed |
| POC fail-closed polling | Stop on **first** of: local timeout **or** `/result` HTTP 4xx/gone (past `expiresAt` / unknown) |
| `ok` after token consumed | `/result` returns `ok` until session `expiresAt`; then 4xx/gone |
| `ok` precedence | Server `ok` beats any client-event; post-`ok` client-event = no-op |
| `wallet_reject` | Does **not** terminalize `/result`; status stays `pending` |
| Verify bad signature | Challenge stays pending; token usable until TTL/success/invalidate; result stays `pending` |
| Parallel verify / tabs | One success → `ok`; reject elsewhere does not override |
| Re-open HTML after success | Fail-closed |
| Redeploy | In-memory cleared — residual |
| Result poll | Bound to mint `signToken` only |

**Source of truth for “login done”:** successful `/auth/verify` (challenge consume). Token consume + `/result` are follow-on for URL death and POC.

---

## Public base URL

Env: **`CAPY_PUBLIC_BASE_URL`** (HTTPS origin). Absolute `url`, `domain`, canonical `uri` `{base}/sign`. Missing → mint fails.

## Path lock

| Path | Role |
|------|------|
| `/sign/{signToken}` | HTML + bootstrap |
| `/sign/{signToken}/result` | POC status JSON |
| `/sign/{signToken}/client-event` | Page → host wallet_reject (non-terminal) |
| `/sign` | Canonical uri **without** token (not a session start) |

## OOS here

WalletConnect as Phase 2 Done · ChatGPT WebView-only · MCP as Channel B opener (ROADMAP Phase 4) · verify body requiring `signToken` · separate resolve JSON for Sign UX · alternate POC result mechanisms · terminalizing POC on MetaMask cancel via `failed`.
