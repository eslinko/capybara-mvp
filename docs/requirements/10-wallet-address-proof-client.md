# 10 — Wallet address-proof client (Phase 2)

Дата: 2026-11-21 · locks refresh `2026-11-23`  
Источник: Target ROADMAP Phase 2 · REQ-04 wallet UI residual · arch-04 host-primary hybrid  
Status: Draft — ready for tech planning / Architect Studio (wallet proof client **Absent**)  
Profile: `capybara` · focus `capybara/`  
Related: [`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md) Phase 2 · parent [`04-dual-auth-wallet-supabase-user.md`](04-dual-auth-wallet-supabase-user.md) · HTTP edge [`08-identity-http-edge-on-host.md`](08-identity-http-edge-on-host.md) · Supabase [`09-live-supabase-auth-port.md`](09-live-supabase-auth-port.md) · host [`07-railway-family-host.md`](07-railway-family-host.md) · challenge [`../../packages/core/src/auth/`](../../packages/core/src/auth/) · gap note [`../analysis/analysis-wallet-personal-sign-client-gap-2026-11-23.md`](../analysis/analysis-wallet-personal-sign-client-gap-2026-11-23.md) · method map [`../analysis/analysis-wallet-poc-vs-zeya888-methodology-2026-11-23.md`](../analysis/analysis-wallet-poc-vs-zeya888-methodology-2026-11-23.md)  
Architecture: [`../architecture/10-wallet-address-proof-client/00-overview.md`](../architecture/10-wallet-address-proof-client/00-overview.md) · parent dual-auth [`../architecture/04-dual-auth-wallet-supabase-user/00-overview.md`](../architecture/04-dual-auth-wallet-supabase-user/00-overview.md) · crypto [`../analysis/analysis-wallet-personal-sign-crypto-2026-11-23.md`](../analysis/analysis-wallet-personal-sign-crypto-2026-11-23.md) · story proposal (OP gate) [`../analysis/proposal-wproof-stories-2026-11-23.md`](../analysis/proposal-wproof-stories-2026-11-23.md)  
Interview: Phase 0 locks 2026-11-19 (non-custodial MetaMask/SIWE-class) · Phase 2 REQ materialize `2026-11-21T13:43:45Z` · operator lock terminal POC + `CAPY_POOL_ADDRESS` `2026-11-21T14:34:00Z` · operator lock **dual Sign channels + unique-token URL** `2026-11-23`

Пометка: **минимальный** non-custodial proof client — достаточно, чтобы человек завершил challenge→подпись→bind против live host (REQ-08). Не полный family SPA, не CAPYUI revival, не MCP Skill. Login-подпись ≠ on-chain money signature. Derivative stories must ship **terminal-driven POC**, **dual-channel test matrix**, и contribute to **operator manual** (REQ-08 AC-I07). Crypto encoding / token semantics — **Architect + early crypto note before stories** (не invent в этом REQ). **name ≠ create** until implement wave.

---

## 0. Verified as-is

| Seam | Fact |
|------|------|
| SIWE-class challenge/verify in core | Present (`issueChallenge`, `verifyAddressProof`, `buildSiweClassMessage`) |
| Host HTTP auth for client | **Present** — REQ-08 / EDGE-01…04 (`/auth/challenge`, `/auth/verify`, …); live remote identity residual honesty per EDGE manual |
| MetaMask / wallet UI / proof page / POC | **Absent** under `capybara/` |
| Product money keys in browser | Forbidden (REQ-07 AC-H05; ROADMAP invariant) |
| Server-side `personal_sign` / custody login keys | Forbidden (gap note §1; REQ-04) |
| Superseded CAPYUI / Express SPA tracks | Not Target Path (ROADMAP superseded) |
| Sign model | Host issues `challengeId` + exact UTF-8 `message`; wallet signs **`message`** (not bare `challengeId`); client submits `challengeId` + `signature` — see gap note |

---

## 1. Назначение

Дать участнику семьи способ **доказать владение address** через сторонний некастодиальный wallet против live identity edge — без передачи private keys серверу, browser-custody product money keys, или ChatGPT.

---

## 2. Подтверждённые решения

| Область | Требование |
|---|---|
| Wallet class | Non-custodial (MetaMask-class / SIWE-class) — Level 1 of REQ-04 |
| Client scope | Minimal proof surface: obtain challenge from host, request signature via wallet UI, submit proof, receive/hold bearer for subsequent calls |
| Host dependency | Talks to REQ-08 identity HTTP edge (not invent parallel auth server) |
| Sign page | Minimal signing page served from host (or same-origin path TBD in arch); browser JS calls EIP-1193 `personal_sign` over the **exact** host `message` |
| What to sign | Exact challenge **`message`** string — **not** the literal `challengeId` string |
| Dual Sign channels (test / live matrix) | **Both required** for detailed testing: (1) **Desktop** — browser with MetaMask **extension** → Connect → Sign; (2) **Mobile** — open HTTPS signing-page URL in **MetaMask in-app browser** → Connect/Sign |
| Unique-token URL | Mobile (and shareable) signing URL carries a **unique one-time token** (not a long-lived secret in the clear). Fail-closed replay/expiry semantics = **arch / crypto note** (requirement class here only) |
| Login ≠ money | Proof signature is login/bind only — not pool/child money-sign (PRD O-02 later) |
| Keys | No product pool/child private keys in the client; no server custody of login keys; host does **not** invoke `personal_sign` |
| Pool address env | POC/default pool proof target = **`CAPY_POOL_ADDRESS`** from `capybara/.env` (public address only). Distinct from `PARENT_ADDRESS` even when values match |
| Terminal automation | Story POC: **start from terminal**; script reads `CAPY_POOL_ADDRESS`, drives host challenge/verify (REQ-08), bridges human Sign (desktop and/or opens token URL), returns proof/session. Pure headless MetaMask without human Sign is **not** required |
| MCP URL handoff | MCP/Skill may later return signing URL + “open in MetaMask browser” instruction to the consumer — **Phase 4 consume**; **not** a Phase 2 Done blocker (AC-W05) |
| Operator manual | Stories document both channels + MetaMask steps (feeds REQ-08 AC-I07) |
| Not required for Phase 2 Done | Full family dashboard, payouts UI, MCP Skill chrome, Express CRUD screens, ChatGPT in-app browser as sole channel |

### Test process (operator lock — automate what can be automated)

1. Operator fills `CAPY_POOL_ADDRESS` in `capybara/.env` (MetaMask account that will Sign).  
2. Host env ready (REQ-08 Present; REQ-09 live bind when configured).  
3. From terminal: run story POC entry (npm script / node CLI — path TBD in stories).  
4. POC loads `CAPY_POOL_ADDRESS`, requests challenge from host for that address (or mint unique-token URL that resolves to the same challenge/`message`).  
5. **Channel A — Desktop:** open signing page (or POC bridge) in browser with MetaMask **extension** → human Connect + Sign of exact `message`.  
6. **Channel B — Mobile:** open the **unique-token HTTPS URL** in **MetaMask browser** → human Connect + Sign of exact `message`.  
7. Client/POC submits `challengeId` + `signature` to host → verify → bind/session (REQ-09 when live).  
8. Terminal prints OK / bearer residual-safe summary (no secret dumps). Optional second pass for `PARENT_ADDRESS` when bootstrap needs distinct parent proof.  
9. Operator manual + **test matrix** record both channels, expected MetaMask prompts, and fail paths (reject / cancel / bad signature / expired token).

Crypto encoding (`personal_sign` params, UTF-8 vs hex, domain/origin vs SIWE-class fields) — **do not invent in this REQ**; Architect + early crypto investigation before story materialize (delivery plan фаза 2 → 3 stop for OP story-list approve).

---

## 3. Out of scope

- Host `/auth/*` route implementation — REQ-08 (Present)  
- Live Supabase port body — REQ-09  
- Journals / SPA product shell — Phase 3 / superseded tracks  
- MCP + ChatGPT Skill implementation / “return URL” tool body — **Phase 4** (pointer only here)  
- Relying on **ChatGPT in-app browser alone** as the Sign channel  
- Server-side `personal_sign` or inventing a new SIWE format from scratch (core message builder Present)  
- Address rebind / recovery — ROADMAP deferred  
- Custody / money-sign flows; storing pool private key for «auto-sign without MetaMask»  
- Creating UI/static/POC/arch/story files in this REQ amend (name ≠ create)

---

## 4. Acceptance

| ID | Результат |
|---|---|
| AC-W01 | Operator/participant can complete address proof against live host using a non-custodial wallet (or documented equivalent wallet bridge) |
| AC-W02 | Client never requires product money / pool private keys for login proof |
| AC-W03 | Successful proof yields usable dual-auth session for REQ-08 gated calls (with REQ-09 live bind when configured) |
| AC-W04 | Failure paths (reject / cancel / bad signature) do not grant family capabilities |
| AC-W05 | Minimal client only — Phase 2 Done does **not** require full family SPA or MCP Skill |
| AC-W06 | Terminal-started POC Present (via stories): reads **`CAPY_POOL_ADDRESS`**, drives host challenge, requires MetaMask Sign for that address, completes verify against live host |
| AC-W07 | Operator manual section for the POC Present after derivative stories (commands + MetaMask steps for **both** channels); name ≠ create in this REQ file alone |
| AC-W08 | Documented + executable **test matrix** covers **both** desktop MetaMask **extension** and mobile **MetaMask-browser** unique-token URL flows |
| AC-W09 | Signing page URL uses a **unique one-time token**; token fail-closed (replay / expiry / unknown) per Architect crypto note — requirement class here; exact wire format TBD arch |

---

## 5. Named future paths (acceptance targets — not present until implement)

Logical targets only (form TBD Architect / stories after crypto note + OP story-list approve):

- Minimal signing page + unique-token route on host (path TBD)  
- Terminal POC entry under `capybara/` (path TBD)  
- Dual-channel operator manual / test matrix section (shared with REQ-08 AC-I07)  
- Backlog package `capybara-wallet-address-proof` (or agreed name) — **name ≠ create** until OP-approved story list  
- Explicit login≠money note in client/operator docs  
- Phase 4: MCP tool returns signing URL + open-in-MetaMask instruction (consume)

**Verified state until implement:** wallet proof client Absent; POC Absent; dual-channel manual Absent (EDGE manual pointer only); unique-token URL Absent (see §0).
