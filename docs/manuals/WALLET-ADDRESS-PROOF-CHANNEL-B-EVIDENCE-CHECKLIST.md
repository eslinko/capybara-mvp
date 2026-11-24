# Channel B — evidence checklist (AC-W08 B · AC-W01)

**Procedure:** [`WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md`](./WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md)  
**Do not invent rows.** Mark Pass / Fail / Residual after a real operator run.

| # | Check | AC | Pass / Fail / Residual | Notes |
|---|-------|-----|------------------------|-------|
| 1 | Mint returns HTTPS unique-token `url` | AC-W09 class | | |
| 2 | Opened `url` in **MetaMask in-app browser** (not desktop extension / ChatGPT-only) | AC-W08 B | | |
| 3 | Same page JS / encoding as Channel A (no fork) | AC-W08 | | |
| 4 | Connect + `personal_sign` exact bootstrap `message` | AC-W08 B | | |
| 5 | `POST /auth/verify` succeeded on host-under-test | AC-W01 | | |
| 6 | Reject/cancel → `/result` stayed `pending` | AC-W04 / arch-02 | | |
| 7 | Retry **same** mint URL after reject while pending | AC-W08 B | | |
| 8 | POC (or operator) kept polling `/result` (non-terminal reject) | arch-02 | | |
| 9 | After success: `/result` → `ok`; HTML re-open fail-closed | arch-02 | | |
| 10 | No product/pool private keys on page | AC-W02 | | |

**Live MetaMask mobile:** leave AC-W01 **Residual** until a human in-app-browser run is recorded — do **not** invent Pass.
