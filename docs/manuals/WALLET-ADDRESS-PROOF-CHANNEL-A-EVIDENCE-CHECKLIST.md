# Channel A — evidence checklist (AC-W08 A · AC-W01)

**Procedure:** [`WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md`](./WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md)  
**Do not invent rows.** Mark each item Pass / Fail / Residual after a real operator run.

| # | Check | AC | Pass / Fail / Residual | Notes |
|---|-------|-----|------------------------|-------|
| 1 | Host reachable; mint env Present (`CAPY_SIGN_MINT_SECRET`, `CAPY_PUBLIC_BASE_URL` HTTPS) | — | | |
| 2 | `POST /sign/mint` returns `url` + unique `signToken` for Sign address | AC-W09 class | | |
| 3 | Opened `url` in **desktop** browser with MetaMask **extension** (not in-app browser) | AC-W08 A | | |
| 4 | Page showed Connect/Sign; no product/pool **private keys** on page | AC-W02 | | |
| 5 | Signed **exact** bootstrap `message` via `personal_sign` (same encoding as WPROOF-01 — no fork) | AC-W08 A | | |
| 6 | `POST /auth/verify` `{ challengeId, signature }` succeeded on host-under-test | AC-W01 | | |
| 7 | Re-open same `/sign/{token}` fail-closed after success | AC-W09 | | |
| 8 | `GET /sign/{token}/result` → `ok` (or documented write-fail residual) | arch-02 | | |
| 9 | Reject/cancel left `/result` `pending`; retry same URL possible while pending | AC-W04 | | |
| 10 | No separate encoding path vs mobile Channel B page JS | AC-W08 | | |

**Live MetaMask:** leave AC-W01 row **Residual** until a human run is recorded — do **not** invent Pass from unit tests alone.
