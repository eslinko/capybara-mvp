# Wallet address-proof — Channel B (MetaMask in-app browser)

**REQ:** [`../requirements/10-wallet-address-proof-client.md`](../requirements/10-wallet-address-proof-client.md) §2 Dual Sign channels (2) · Unique-token URL · Test §6 · AC-W08 B · AC-W01  
**Architecture:** [`../architecture/10-wallet-address-proof-client/02-channels-and-sign-token.md`](../architecture/10-wallet-address-proof-client/02-channels-and-sign-token.md) §Channel B  
**Stories:** WPROOF-01 (same page JS) · WPROOF-02 (mint/`/result`) · **WPROOF-04** (this procedure)  
**Encoding:** **same** host page JS as Channel A / WPROOF-01 — **no** encoding fork.

> **Honesty:** Executable procedure only. Live MetaMask **in-app browser** prove against host-under-test is **operator-run**; do not invent AC-W01 live PASS from docs/unit alone.

---

## 0. Prerequisites (disk facts)

| Need | Present path / env |
|------|-------------------|
| Host | `cd capybara && npm start` (PORT + identity env per REQ-08 / IDENTITY manual) |
| Mint secret | `CAPY_SIGN_MINT_SECRET` |
| Public base | `CAPY_PUBLIC_BASE_URL` = absolute **HTTPS** origin (mobile must open HTTPS unique-token URL) |
| Sign address | MetaMask account that will Sign (often `CAPY_POOL_ADDRESS`) |
| Mobile | **MetaMask in-app browser** (not desktop extension — that is Channel A) |

Bare `GET /sign` without token is **not** a valid session start. ChatGPT-only WebView and MCP URL handoff = OOS / Phase 4.

Sibling Channel A: [`WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md`](./WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md).

---

## 1. Mint a unique-token HTTPS URL (WPROOF-02)

```bash
curl -sS -X POST "$HOST/sign/mint" \
  -H 'Content-Type: application/json' \
  -H "X-Capy-Sign-Mint-Secret: $CAPY_SIGN_MINT_SECRET" \
  -d "{\"address\":\"$CAPY_POOL_ADDRESS\"}"
```

Use returned `url` (`{CAPY_PUBLIC_BASE_URL}/sign/{signToken}`). Same mint auth fail-closed as Channel A (503/401).

---

## 2. MetaMask in-app browser flow (Channel B)

1. Transfer / open **`url`** on the phone **inside MetaMask’s in-app browser** (not Safari/Chrome alone without MetaMask browser; not desktop extension).  
2. Page loads the **same** HTML bootstrap + `/sign/client.js` as Channel A (`challengeId`, `message`, `address`, `expiresAt`).  
3. Connect → `personal_sign` exact bootstrap `message` (WPROOF-01 encoding — no fork).  
4. Page `POST /auth/verify` `{ challengeId, signature }` only.  
5. Success: consume → `/result=ok` → HTML re-open fail-closed.  
6. POC (when Present) polls **only** `GET /sign/{signToken}/result`.

### Cancel / reject then retry (arch-02 lock)

- User rejects Sign → optional `POST …/client-event` `{ "type":"wallet_reject" }`.  
- **`/result` stays `pending`** (non-terminal).  
- **Retry the same mint URL** while token + challenge pending.  
- POC **keeps polling** until `ok` or fail-closed (local timeout **or** `/result` 4xx/`expiresAt` — first wins). Do **not** treat reject as immediate POC fail.

---

## 3. What “pass” means for Channel B

| Check | Pass means |
|-------|------------|
| AC-W08 B (procedure) | This procedure + checklist executable; same page JS as Channel A |
| AC-W01 (live) | Human completed Connect+Sign+verify in MetaMask **in-app browser** against host-under-test |

---

## 4. Related artifacts

| Artifact | Path |
|----------|------|
| Evidence checklist | [`WALLET-ADDRESS-PROOF-CHANNEL-B-EVIDENCE-CHECKLIST.md`](./WALLET-ADDRESS-PROOF-CHANNEL-B-EVIDENCE-CHECKLIST.md) |
| Recorded result (WPROOF-06 input) | [`evidence/channel-b-mobile-metamask-browser-result.md`](./evidence/channel-b-mobile-metamask-browser-result.md) |
| Channel A (no fork reference) | [`WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md`](./WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md) |
| Arch Channel B | [`../architecture/10-wallet-address-proof-client/02-channels-and-sign-token.md`](../architecture/10-wallet-address-proof-client/02-channels-and-sign-token.md) |
