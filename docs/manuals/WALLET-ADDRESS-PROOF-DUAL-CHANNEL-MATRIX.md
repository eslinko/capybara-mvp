# Wallet address-proof — Dual-channel test matrix

**REQ:** [`../requirements/10-wallet-address-proof-client.md`](../requirements/10-wallet-address-proof-client.md) AC-W08 · AC-W07 · AC-W04 · AC-W05  
**Architecture:** [`../architecture/10-wallet-address-proof-client/03-story-coverage-gate.md`](../architecture/10-wallet-address-proof-client/03-story-coverage-gate.md) §`/result` scenarios  
**Umbrella:** [`WALLET-ADDRESS-PROOF-OPERATOR.md`](./WALLET-ADDRESS-PROOF-OPERATOR.md)  
**Story:** WPROOF-06

> **Honesty:** Cells cite Present evidence. Live MetaMask A/B = **RESIDUAL — NOT RUN**. Do **not** invent Pass.

---

## 1. Channel coverage (AC-W08)

| Channel | Surface | Procedure | Checklist | Evidence record | Documented procedure | Live AC-W01 |
|---------|---------|-----------|-----------|-----------------|----------------------|-------------|
| **A** | Desktop MetaMask **extension** | [`WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md`](./WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md) | [`…-CHANNEL-A-EVIDENCE-CHECKLIST.md`](./WALLET-ADDRESS-PROOF-CHANNEL-A-EVIDENCE-CHECKLIST.md) | [`evidence/channel-a-desktop-metamask-extension-result.md`](./evidence/channel-a-desktop-metamask-extension-result.md) | **PASS** (Present) | **RESIDUAL — NOT RUN** |
| **B** | Mobile MetaMask **in-app browser** | [`WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md`](./WALLET-ADDRESS-PROOF-CHANNEL-B-MOBILE.md) | [`…-CHANNEL-B-EVIDENCE-CHECKLIST.md`](./WALLET-ADDRESS-PROOF-CHANNEL-B-EVIDENCE-CHECKLIST.md) | [`evidence/channel-b-mobile-metamask-browser-result.md`](./evidence/channel-b-mobile-metamask-browser-result.md) | **PASS** (Present) | **RESIDUAL — NOT RUN** |

Encoding fork A↔B: **None** (same WPROOF-01 page JS).

---

## 2. Shared mint / MetaMask prompts

| Step | Channel A | Channel B | Expected |
|------|-----------|-----------|----------|
| Mint unique-token URL | `POST /sign/mint` | same | `url` + `signToken` · HTTPS public base |
| Open URL | Desktop + **extension** | Phone + **in-app browser** | Correct surface (not the other channel) |
| MetaMask prompt | Connect + `personal_sign` exact bootstrap `message` | same encoding | No product/pool private keys on page (AC-W02) |
| Verify | `POST /auth/verify` `{ challengeId, signature }` | same | Challenge consume on success |
| POC learn OK | Poll `GET /sign/{signToken}/result` only | same | Exit 0 only on `ok` |

---

## 3. Fail paths + arch-03 `/result` scenarios

| Scenario | Expected `/result` / HTML | A | B | Evidence cite |
|----------|---------------------------|---|---|---------------|
| Happy path Sign → verify | → `ok`; HTML re-open fail-closed | Residual live | Residual live | Channel A/B procedures Present |
| Reject / cancel Sign | stays `pending` (non-terminal) | Documented | Documented | A checklist #9 · B checklist #6 |
| Reject + **retry same mint URL** | pending → later `ok` | Documented | Documented | arch-03 · B procedure §2 |
| Bad signature verify | stays `pending`; token usable until TTL | Documented | Documented | arch-02 |
| Expired / unknown / consumed HTML | fail-closed | Documented | Documented | Channel A/B §fail-closed |
| Parallel tabs: reject + success | server `ok` wins | Documented | Documented | arch-03 row |
| Read `ok` after HTML token consumed | `ok` until `expiresAt` | Documented | Documented | arch-03 |
| Result write-fail after consume | login may ok; `/result` pending → POC fail-closed (timeout **or** 4xx) | Documented | Documented | arch-03 |
| Past `expiresAt` / unknown `/result` | 4xx/gone · POC exit ≠ 0 | Documented | Documented | arch-00/02 |

**Operator fill-in:** mark Pass/Fail/Residual on Channel A/B checklists after a real run; update evidence records — do not invent Pass here.

---

## 4. Terminal POC row (soft)

| Check | Status |
|-------|--------|
| `npm run wallet-proof-poc` Present | **PASS** (`cli/wallet-address-proof-poc.js`) |
| Poll `/result` only · no auto-sign | **PASS** (CLI contract) |
| Live human MetaMask via POC | **RESIDUAL** (WPROOF-05 honesty) |

---

## 5. Honesty footer (AC-W05)

- Phase 2 Done does **not** require full SPA or MCP Skill.  
- Login ≠ money.  
- Phase 4: MCP URL handoff — pointer only ([`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md)).  
- REQ-08 AC-I07: contribute via [`WALLET-ADDRESS-PROOF-OPERATOR.md`](./WALLET-ADDRESS-PROOF-OPERATOR.md) + IDENTITY manual.  
- This matrix documents both channels (AC-W08); live cells stay Residual until operator runs.
