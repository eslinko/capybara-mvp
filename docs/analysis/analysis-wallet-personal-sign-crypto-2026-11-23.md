# Crypto investigation: `personal_sign` ↔ Capybara challenge/verify

**Дата:** 2026-11-23  
**Правила:** analysis.mdc — сверка с `packages/core` + ethers v6; EIP/MetaMask docs as external norms for client wire (cited)  
**Скоуп:** encoding, recovery, token URL invent-risks для REQ-10; **без** implement / stories materialize  
**Parents:** [`../requirements/10-wallet-address-proof-client.md`](../requirements/10-wallet-address-proof-client.md) · gap [`analysis-wallet-personal-sign-client-gap-2026-11-23.md`](./analysis-wallet-personal-sign-client-gap-2026-11-23.md)

---

## 1. Verified server contract (Present)

| Item | Fact | Path |
|------|------|------|
| Message | SIWE-class UTF-8 string, `\n`-joined lines; default domain `capybara.local`, URI `capybara://auth/challenge`; **no** `Chain ID` field | [`buildSiweClassMessage.js`](../../packages/core/src/auth/buildSiweClassMessage.js) |
| Issue | `normalizeAddress` → nonce/id = 16 random bytes hex; TTL default **5 min**; store full `message` on record | [`issueChallenge.js`](../../packages/core/src/auth/issueChallenge.js) |
| Verify | `ethers.verifyMessage(challenge.message, signature.trim())` → normalize recovered → must equal `challenge.address` → `consume` | [`verifyAddressProof.js`](../../packages/core/src/auth/verifyAddressProof.js) |
| Replay | `ChallengeStore`: get/consume fail if consumed (`EAUTH_CHALLENGE_REPLAY`); unknown id → `EAUTH_UNKNOWN_CHALLENGE` | [`ChallengeStore.js`](../../packages/core/src/auth/ChallengeStore.js) |
| Library | ethers **^6.17.0** (workspace lock) | `package-lock.json` |
| Unit sign | `wallet.signMessage(challenge.message)` — same family as `verifyMessage` | host/auth unit tests |

**Implication:** Client must produce a signature that **`ethers.verifyMessage(utf8String, sig)`** accepts for the **exact** stored `message` string (byte-identical, including newlines).

---

## 2. ERC-191 / ethers semantics (norm + match)

`ethers.verifyMessage(message, signature)` (string `message`):

1. UTF-8 encode `message` → bytes `M`.  
2. Digest = `keccak256( "\x19Ethereum Signed Message:\n" || decimalAscii(len(M)) || M )` (ERC-191 version `0x45`).  
3. ECDSA recover → address.

MetaMask `personal_sign` applies the **same** prefix when signing; the wallet must be given the **same** `M`.

### Client wire lock (must not invent at execute)

| ID | Lock | Rationale |
|----|------|-----------|
| **C1** | Pass to `personal_sign` the **UTF-8 bytes of `challenge.message` as `0x`-hex** (`ethers.hexlify(ethers.toUtf8Bytes(message))`), address checksum/lowercase per provider; **do not** `keccak` on the page before Sign | Matches ethers `verifyMessage(string)`; avoids “double-hash” and “sign challengeId” mistakes |
| **C2** | Params order: MetaMask `personal_sign` → `[data, address]` (data first) | MetaMask / EIP-1193 convention; wrong order → recovery fail or wrong account prompts |
| **C3** | Do **not** sign the bare `challengeId` string | Server verifies `challenge.message` only |
| **C4** | Preserve exact newlines/spaces; no HTML `<textarea>` normalization without round-trip proof; prefer JSON/`textContent` load of server message | Byte mismatch → `EAUTH_INVALID_SIGNATURE` |
| **C5** | Submit verify with **same** `challengeId` issued with that message + full signature hex from wallet | Host API contract |

**Test vector requirement (implement stories):** one fixed test key: message UTF-8 hex, digest, signature, recovered address — assert page encoding path equals `Wallet.signMessage` / `verifyMessage` (C6). **Expected `params[0]` hex is a checked-in constant** for the fixture (not recomputed only via the same helper under test).

---

## 3. What verify does **not** check today

| Gap | Fact | Phase 2 stance |
|-----|------|----------------|
| `Chain ID` in message | Absent in builder | **C7:** network switch = UX only; verify EOA recovery only. Do not invent chainId into message without REQ change |
| Browser `Origin` vs SIWE `domain` | Not checked in `verifyAddressProof` | **C8:** for web Sign sessions, **issue** challenge with `domain` = public host hostname (env e.g. public base URL host); page served on that host. Hard Origin header bind = residual harden (document, optional later story) |
| ERC-1271 smart accounts | `verifyMessage` = EOA recovery | **C9:** OOS Phase 2 — EOA MetaMask accounts only |
| Signature malleability / EIP-2 | ethers handles typical MetaMask `v` | Rely on ethers; no custom recovery code on page |

---

## 4. Unique-token URL (REQ AC-W09) — crypto/security class

Operator lock: URL carries **unique one-time token**, not a long-lived secret.

| ID | Lock | Notes |
|----|------|-------|
| **C10** | `signToken` = CSPRNG ≥16 bytes hex; maps 1:1 → `challengeId` | Opacity; arch 02 |
| **C11** | Token TTL ≤ challenge TTL; expired/unknown/consumed **or** challenge not pending → HTML fail-closed | Align `expiresAtMs`; pending token alone ≠ enough after challenge death |
| **C12** | **Token-open-only:** HTML bootstrap returns exact `message`+`challengeId` only while token active **and** challenge pending; verify body `{challengeId,signature}` **without** token; on success: consume challenge **first**, then mark token + write `result=ok` | URL dies after login; `/auth/verify` unchanged; arch 00/02 wave2 |
| **C13** | HTTPS Sign URL; `no-store`; no token in logs/referrer; canonical signed `uri` = `{base}/sign` **without** token | arch 01–02 |
| **C14** | No pool private keys or bearer secrets in page/URL | AC-W02 |

**Locked flow (arch 00/02, FAIL wave2):**

1. `POST` mint (header `X-Capy-Sign-Mint-Secret` = `CAPY_SIGN_MINT_SECRET`) → `issueChallenge` + `signToken→challengeId` + absolute `/sign/{signToken}`.  
2. `GET /sign/{signToken}` → HTML + bootstrap **iff** token+challenge pending (refresh OK while both alive).  
3. `personal_sign` (C1–C5) → `POST /auth/verify` (no token in body); wallet reject → `POST …/client-event`.  
4. On verify success: challenge consume → token mark + `result=ok`.  
5. Terminal POC learns host OK **only** via poll `GET /sign/{signToken}/result`.

---

## 5. Dual channels (no crypto fork)

| Channel | Provider | Same crypto locks |
|---------|----------|-------------------|
| Desktop extension | `window.ethereum` / EIP-6963 | C1–C5 identical |
| Mobile MetaMask browser | In-app browser provider | C1–C5 identical; entry = open token URL (C10–C14) |

**C15:** One signing page implementation; two entry docs/tests — **no** separate encoding per channel.

ChatGPT in-app browser alone = OOS (REQ-10). MCP returns URL = Phase 4.

---

## 6. Invent-risk register (must be owned by stories after OP approve)

| ID | Risk if agent invents | Must be closed by |
|----|----------------------|-------------------|
| C1 | Wrong `personal_sign` encoding | Sign page story |
| C2 | Params order | Sign page story |
| C3 | Sign `challengeId` | Sign page + manual |
| C4 | Newline/HTML mangling | Sign page + vector test |
| C5 | Verify payload mismatch | Sign page + POC |
| C6 | Missing golden vector | Unit/harness story |
| C7 | Fake chainId gate on server | Arch lock: no |
| C8 | domain/origin drift | Mint sign-session domain policy |
| C9 | ERC-1271 scope creep | OOS explicit |
| C10–C14 | Weak/replayable token URL | Token store story |
| C15 | Dual encoding forks | Single page + dual test stories |

---

## 7. Residual / next

- Architect package: [`../architecture/10-wallet-address-proof-client/`](../architecture/10-wallet-address-proof-client/00-overview.md)  
- Phase 3: story **proposal** + coverage matrix vs this register — **OP approve before materialize**
