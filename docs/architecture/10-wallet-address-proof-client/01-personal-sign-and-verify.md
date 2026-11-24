# 01 — `personal_sign` encoding and host verify

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-23` · **rev:** validator FAIL wave3 `/result` transitions  
**SSOT invent-risks:** [`../../analysis/analysis-wallet-personal-sign-crypto-2026-11-23.md`](../../analysis/analysis-wallet-personal-sign-crypto-2026-11-23.md) §2–3

## SIWE-class (this package)

**Meaning here:** host builds a deterministic multi-line UTF-8 string in the *shape* of EIP-4361-inspired login text via Present `buildSiweClassMessage` (domain, address, statement, URI, Version, Nonce, Issued At, Expiration Time).

**Explicit:** this Phase 2 package does **not** require full EIP-4361 compliance. **No `Chain ID` field** in the message and **no** host verify of chain (C7). “SIWE-class” ≠ “must implement every SIWE field.”

### domain / uri (web mint)

| Field | Lock |
|-------|------|
| `domain` | Public hostname from `CAPY_PUBLIC_BASE_URL` (no scheme/port junk — hostname only) when minting a web sign session |
| `uri` | **Canonical page URI without token:** `{CAPY_PUBLIC_BASE_URL}/sign` (no `signToken` in signed URI) |
| Token in logs | **Forbidden** to log raw `signToken` or put it in analytics; prefer `Referrer-Policy: no-referrer` on sign responses |

## Decided locks — encoding (execute must not invent)

1. **Sign payload = exact `challenge.message` string** as stored by `issueChallenge` (C3, C4).  
2. **Before Sign, page MUST NOT:** `trim` the message; Unicode-normalize (NFC/NFKC); rewrite `\r\n`↔`\n`; prepend ERC-191 prefix manually; keccak/hash the message; sign `challengeId`.  
3. **Browser call (only allowed form):**  
   `ethereum.request({ method: 'personal_sign', params: [hexUtf8, fromAddress] })`  
   where `hexUtf8 = ethers.hexlify(ethers.toUtf8Bytes(message))` (ethers v6), `fromAddress` = connected account. Params order **`[data, address]`** (C1, C2).  
4. **Verify path unchanged:** host `ethers.verifyMessage(challenge.message, signature.trim())` — page does not reimplement recovery for acceptance. (Host may trim signature; **message** must remain untrimmed bytes as stored.)  
5. **Golden vector (C6):** fixture message includes **non-ASCII** (e.g. Cyrillic) **and** a newline. Harness asserts:  
   - exact RPC `params[0]` equals a **checked-in constant hex string** for that fixture (independent of the production helper under test — do **not** only recompute via the same helper);  
   - optionally also equals `hexlify(toUtf8Bytes(fixtureMessage))` from a reference path;  
   - signature from that RPC path (or equivalent `Wallet.signMessage(fixtureMessage)`) is accepted by Present `verifyAddressProof` / `ethers.verifyMessage`.  
6. **EOA only (C9).** ERC-1271 OOS.  
7. **Same encoding both channels (C15).**

## Client UX fail-closed (page)

| Situation | Required behavior |
|-----------|-------------------|
| No EIP-1193 provider | Show error; do not pretend Sign succeeded; no verify POST |
| User rejects Sign | Catch; optionally `POST /sign/{signToken}/client-event` `{ "type":"wallet_reject" }` for telemetry/ack — **must not** terminalize `/result` (stays `pending`); show cancel; **retry same mint** while token+challenge still pending; no verify POST on reject |
| Method unsupported | Show error; no verify POST |
| Account changes mid-flow | **Abort/ignore** any in-flight `personal_sign` promise; never POST verify with a late signature from the previous account; clear pending UI; require Connect+Sign again with **current** account; if recovered signer ≠ challenge.address → host `EAUTH_WRONG_SIGNER` |
| Token/HTML bootstrap fail (token dead or challenge not pending) | Show host error; no Sign |

## Host failure mapping (Present verify)

| User/crypto failure | Host code |
|---------------------|-----------|
| Bad/mangled signature | `EAUTH_INVALID_SIGNATURE` |
| Wrong account | `EAUTH_WRONG_SIGNER` |
| Expired challenge | `EAUTH_CHALLENGE_EXPIRED` |
| Replay challenge | `EAUTH_CHALLENGE_REPLAY` |

Token-specific errors → [`02-channels-and-sign-token.md`](./02-channels-and-sign-token.md) (HTML/`/result`/mint), not `/auth/verify` body.

## Non-goals

Custom keccak on page · signing `challengeId` · forking encoding per desktop/mobile · putting `signToken` into signed `uri` · requiring Chain ID in message for Phase 2 Done · verifying golden hex only by re-running the same helper under test.
