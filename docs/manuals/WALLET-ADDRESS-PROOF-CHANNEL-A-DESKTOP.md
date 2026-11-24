# Wallet address-proof — Channel A (desktop MetaMask extension)

**REQ:** [`../requirements/10-wallet-address-proof-client.md`](../requirements/10-wallet-address-proof-client.md) §2 Dual Sign channels (1) · Test process §5 · AC-W08 A · AC-W01  
**Architecture:** [`../architecture/10-wallet-address-proof-client/00-overview.md`](../architecture/10-wallet-address-proof-client/00-overview.md) · [`02-channels-and-sign-token.md`](../architecture/10-wallet-address-proof-client/02-channels-and-sign-token.md) §Channel A  
**Stories:** WPROOF-01 (page) · WPROOF-02 (mint/`/result`) · **WPROOF-03** (this procedure)  
**Encoding:** same host page JS as WPROOF-01 — **no** separate encoding fork vs Channel B.

> **Honesty:** This document is the **executable procedure**. A live MetaMask extension pass against a host-under-test is **operator-run**; do not treat unit-green alone as AC-W01 live PASS.

---

## 0. Prerequisites (disk facts)

| Need | Present path / env |
|------|-------------------|
| Host | `cd capybara && npm start` (PORT + identity env per REQ-08 / IDENTITY manual) |
| Mint secret | `CAPY_SIGN_MINT_SECRET` (unset → mint 503) |
| Public base | `CAPY_PUBLIC_BASE_URL` = absolute **HTTPS** origin, no trailing slash (unset → mint 503) |
| Sign address | MetaMask account that will Sign (often `CAPY_POOL_ADDRESS` for POC) |
| Desktop | Browser with MetaMask **extension** installed and unlocked |

Bare `GET /sign` without token is **not** a valid session start (arch-02).

---

## 1. Mint a unique-token URL (preferred — WPROOF-02)

From a machine that can reach the host (replace `$HOST` with origin, e.g. `https://…` or tunnel URL matching `CAPY_PUBLIC_BASE_URL`):

```bash
curl -sS -X POST "$HOST/sign/mint" \
  -H 'Content-Type: application/json' \
  -H "X-Capy-Sign-Mint-Secret: $CAPY_SIGN_MINT_SECRET" \
  -d "{\"address\":\"$CAPY_POOL_ADDRESS\"}"
```

Expected JSON (shape): `{ ok, signToken, url, challengeId, expiresAt }` with `Cache-Control: no-store`.  
`url` = `{CAPY_PUBLIC_BASE_URL}/sign/{signToken}`.

Fail-closed (do not invent workarounds):

| Condition | Expected |
|-----------|----------|
| Secret unset | **503** `ESIGN_MINT_SECRET_UNSET` |
| Wrong/missing header | **401** |
| Base URL unset/invalid | **503** `ESIGN_PUBLIC_BASE_URL_UNSET` |

---

## 2. Desktop extension flow (Channel A)

1. Open **`url`** from mint in a **desktop** browser where MetaMask is an **extension** (not MetaMask in-app browser — that is Channel B / WPROOF-04).  
2. Page loads HTML bootstrap (`challengeId`, `message`, `address`, `expiresAt`) only while token active **and** challenge pending.  
3. Click **Connect & Sign** (or equivalent on page).  
4. MetaMask: Connect → approve `personal_sign` of the **exact** bootstrap `message` (WPROOF-01 encoding: UTF-8→hex params `[data, address]` — do not fork).  
5. Page posts `POST /auth/verify` with `{ challengeId, signature }` only — **no** `signToken` in verify body.  
6. On success: host consumes challenge → writes `/result=ok` → HTML re-open fail-closed.  
7. Optional POC poll: `GET /sign/{signToken}/result` → `{ status: "ok", … }` until `expiresAt`.

### Cancel / reject

- User rejects Sign → page may `POST …/client-event` `{ "type":"wallet_reject" }`; **`/result` stays `pending`**.  
- Retry the **same** mint URL while token + challenge pending.

### Fail-closed HTML

Unknown / expired / consumed token **or** challenge missing/not pending → HTML fail-closed (typically 404 JSON). No encoding invent.

---

## 3. What “pass” means for Channel A

| Check | Pass means |
|-------|------------|
| AC-W08 A (procedure) | This procedure + checklist executable without a separate crypto/encoding fork |
| AC-W01 (live) | Human completed Connect+Sign+verify against **live/host-under-test** with non-custodial MetaMask extension; session/proof usable per host response |

Unit tests for mint/page/encoding ≠ live AC-W01 PASS.

---

## 4. Related artifacts

| Artifact | Path |
|----------|------|
| Evidence checklist | [`WALLET-ADDRESS-PROOF-CHANNEL-A-EVIDENCE-CHECKLIST.md`](./WALLET-ADDRESS-PROOF-CHANNEL-A-EVIDENCE-CHECKLIST.md) |
| Recorded result (WPROOF-06 input) | [`evidence/channel-a-desktop-metamask-extension-result.md`](./evidence/channel-a-desktop-metamask-extension-result.md) |
| Identity host ops | [`IDENTITY-HTTP-EDGE-MANUAL.md`](./IDENTITY-HTTP-EDGE-MANUAL.md) |
| Arch Channel A | [`../architecture/10-wallet-address-proof-client/02-channels-and-sign-token.md`](../architecture/10-wallet-address-proof-client/02-channels-and-sign-token.md) |
