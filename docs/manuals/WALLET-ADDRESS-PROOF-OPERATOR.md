# Wallet address-proof — Operator manual (dual channel)

**REQ:** [`../requirements/10-wallet-address-proof-client.md`](../requirements/10-wallet-address-proof-client.md) §2 Operator manual · AC-W07 · AC-W08 · AC-W05 · AC-W04  
**REQ-08 pointer:** [`../requirements/08-identity-http-edge-on-host.md`](../requirements/08-identity-http-edge-on-host.md) AC-I07 (operator bootstrap/verify surface)  
**Architecture:** [`../architecture/10-wallet-address-proof-client/00-overview.md`](../architecture/10-wallet-address-proof-client/00-overview.md) · [`02-channels-and-sign-token.md`](../architecture/10-wallet-address-proof-client/02-channels-and-sign-token.md) · [`03-story-coverage-gate.md`](../architecture/10-wallet-address-proof-client/03-story-coverage-gate.md)  
**Stories:** WPROOF-01..06 (Present) · **WPROOF-07** manual address (G5)  
**Encoding:** one host page JS (`/sign/client.js`) for **both** channels — **no** Channel A/B encoding fork.

> **Honesty:** Live Channel A + B on Railway recorded **PASS** `2026-11-24` (evidence under `manuals/evidence/`). Reject/retry optional rows may stay Residual. Docs alone ≠ invent Pass for other hosts. Phase 2 Done still needs REQ-08/09.

---

## 0. What this manual covers

| Topic | Where |
|-------|-------|
| Channel A — desktop MetaMask **extension** | [`WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md`](./WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md) |
| Channel B — mobile MetaMask **in-app browser** | [`WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md`](./WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md) |
| Dual-channel test matrix | [`WALLET-ADDRESS-PROOF-DUAL-CHANNEL-MATRIX.md`](./WALLET-ADDRESS-PROOF-DUAL-CHANNEL-MATRIX.md) |
| Identity host bootstrap | [`IDENTITY-HTTP-EDGE-MANUAL.md`](./IDENTITY-HTTP-EDGE-MANUAL.md) |
| Terminal POC (`CAPY_POOL_ADDRESS` → mint → poll `/result`) | `cd capybara && npm run wallet-proof-poc` · [`../../cli/wallet-address-proof-poc.js`](../../cli/wallet-address-proof-poc.js) |

---

## 1. Prerequisites (disk facts)

| Need | Present |
|------|---------|
| Host | `cd capybara && npm start` (PORT + identity env per IDENTITY manual / REQ-08) |
| Mint | `CAPY_SIGN_MINT_SECRET` · header `X-Capy-Sign-Mint-Secret` |
| Public base | `CAPY_PUBLIC_BASE_URL` = absolute **HTTPS** origin, no trailing slash |
| Sign address | MetaMask account (POC often uses `CAPY_POOL_ADDRESS`) |
| Channel A | Desktop browser + MetaMask **extension** |
| Channel B | Phone + MetaMask **in-app browser** + HTTPS unique-token URL |

Bare `GET /sign` without token is **not** a valid session start.

---

## 2. Mint (shared — both channels)

```bash
curl -sS -X POST "$HOST/sign/mint" \
  -H 'Content-Type: application/json' \
  -H "X-Capy-Sign-Mint-Secret: $CAPY_SIGN_MINT_SECRET" \
  -d "{\"address\":\"$CAPY_POOL_ADDRESS\"}"
```

Expected shape: `{ ok, signToken, url, challengeId, expiresAt }` · `Cache-Control: no-store`.  
`url` = `{CAPY_PUBLIC_BASE_URL}/sign/{signToken}`.

| Fail | Expected |
|------|----------|
| Secret unset | **503** `ESIGN_MINT_SECRET_UNSET` |
| Wrong/missing header | **401** |
| Base URL unset/invalid | **503** `ESIGN_PUBLIC_BASE_URL_UNSET` |

---

## 3. Channel A — desktop extension (commands + MetaMask)

1. Open mint `url` in a **desktop** browser with MetaMask **extension** (not in-app browser).  
2. Page loads HTML bootstrap (`challengeId`, `message`, `address`, `expiresAt`) while token active **and** challenge pending.  
3. Click **Connect & Sign**.  
4. MetaMask: Connect → approve `personal_sign` of the **exact** bootstrap `message` (UTF-8→hex params `[data, address]` — WPROOF-01; no fork).  
5. Page `POST /auth/verify` `{ challengeId, signature }` only — **no** `signToken` in verify body.  
6. Success → challenge consume → `/result=ok` → HTML re-open fail-closed.  
7. Optional: `GET /sign/{signToken}/result` → `{ status: "ok", … }` until `expiresAt`.

Full procedure: [`WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md`](./WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md).

### 3a. Manual address (WPROOF-07 / G5) — Tristan / Bastian / Miguel

Family invitees type/paste their own address on the Sign page (not only consume mint-fixed bootstrap).

1. Operator mints URL (`POST /sign/mint` with secret) — mint body address may be placeholder/pool; invitee will override on page.  
2. Invitee opens `url` → editable **Wallet address** field (`#capy-address`, prefilled from bootstrap).  
3. **Type/paste** Tristan / Bastian / Miguel / founder address → **Connect & Sign**.  
4. Page `POST /sign/{signToken}/bind-address` `{ address }` → challenge rebound to entered address (idempotent if same).  
5. MetaMask account **must** match entered address — mismatch → fail-closed (no `personal_sign` / no fake Pass).  
6. Same encoding / dual-channel locks as §3–§4 (no crypto fork).  
7. Docs/unit alone ≠ invent live MetaMask Pass (REQ-10 honesty).

Family scenario Step 3: [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](./FAMILY-ONBOARDING-OPERATOR-SCENARIO.md).

---

## 4. Channel B — MetaMask in-app browser (commands + MetaMask)

1. Open the **same** mint `url` **inside MetaMask’s in-app browser** (HTTPS; not Safari/Chrome alone; not desktop extension).  
2. Same page JS / bootstrap / encoding as Channel A.  
3. Connect → `personal_sign` exact `message` → `POST /auth/verify` `{ challengeId, signature }`.  
4. Success → `/result=ok` → HTML fail-closed on re-open.  
5. POC / operator polls **only** `GET /sign/{signToken}/result`.

Full procedure: [`WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md`](./WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md).

---

## 5. Fail paths (both channels)

| Path | Expected behavior |
|------|-------------------|
| User **reject / cancel** Sign | Optional `POST …/client-event` `{ "type":"wallet_reject" }`; **`/result` stays `pending`** (non-terminal) |
| **Retry** after reject | Same mint URL while token + challenge pending |
| **Bad signature** verify | Challenge stays pending; `/result` stays `pending`; token usable until TTL/success |
| **Expired / unknown / consumed** token HTML | Fail-closed (typically 404 JSON) |
| Past `expiresAt` on `/result` | HTTP 4xx/gone → POC fail-closed |
| Result **write-fail** after consume | Login may still be done; HTML fail-closed; `/result` stays `pending` → POC exit ≠ 0 on first of local timeout **or** 4xx/`expiresAt` |
| Parallel tabs: reject + success | Server `ok` wins; reject does not override |

---

## 6. Terminal POC (soft — WPROOF-05)

From `capybara/`:

```bash
# Env: CAPY_POOL_ADDRESS, CAPY_SIGN_MINT_SECRET, CAPY_PUBLIC_BASE_URL
# Optional: CAPY_POC_HOST, CAPY_POC_POLL_MS, CAPY_POC_TIMEOUT_MS
npm run wallet-proof-poc
# or: node cli/wallet-address-proof-poc.js
```

- Mints → prints sign URL for **human** MetaMask → polls **`/result` only**.  
- Exit 0 only on `status: ok`. Reject/pending keep polling.  
- Fail-closed: first of local timeout **or** `/result` 4xx.  
- No bearer/secret dump; **no** private-key auto-sign.

---

## 7. Honesty / OOS (AC-W05)

| Claim | Fact |
|-------|------|
| Minimal client | Phase 2 Done does **not** require full family SPA or MCP Skill (AC-W05) |
| Login ≠ money | Proof signature is login/bind only — **not** pool/child money-sign |
| Phase 4 MCP | MCP/Skill may later return signing URL + “open in MetaMask browser” — **Phase 4 consume**; not a Phase 2 Done blocker · see [`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md) Phase 4 |
| REQ-08 AC-I07 | This umbrella + Channel A/B procedures contribute the wallet-proof operator surface; identity host bootstrap remains [`IDENTITY-HTTP-EDGE-MANUAL.md`](./IDENTITY-HTTP-EDGE-MANUAL.md) |
| Live MetaMask A/B | **PASS** Railway `2026-11-24` — see matrix + evidence records · reject/retry Residual where not run |

**Out of scope here:** implementing MCP/Skill chrome · inventing new auth routes · ADMIN/mockups · inventing live PASS.
