# 03 — Story coverage gate

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-23` · **rev:** validator FAIL wave3 `/result` transitions

## Delivery-plan phases (this wallet-proof workstream)

| Id | Name | Meaning |
|----|------|---------|
| **D1** | REQ | REQ-10 amend |
| **D2** | Arch + crypto | This package + crypto analysis |
| **D3** | Story **proposal** | Draft list + coverage matrix — **OP approve** |
| **D4** | Materialize stories | Write backlog package files + tech tasks |
| **D5** | Implement | Code / POC |

Do **not** call D4 “Phase 4”. **ROADMAP Phase 4** = MCP + Skill product phase (URL handoff tool body) — orthogonal label.

## Blockers closed in arch

| Wave | Blocker | Lock | Where |
|------|---------|------|-------|
| 2 | How POC learns host OK | Poll `GET /sign/{signToken}/result` only | [`00-overview.md`](./00-overview.md) |
| 2 | Resolve / HTML after challenge death | Payload only if token active **and** challenge pending | [`02-channels-and-sign-token.md`](./02-channels-and-sign-token.md) |
| 3 | `/result` transitions | `wallet_reject` non-terminal; server `ok` precedence; `ok` readable until `expiresAt`; result-write-fail → POC fail-closed (local timeout **or** 4xx/`expiresAt`, first wins) | [`00-overview.md`](./00-overview.md) · [`02-…`](./02-channels-and-sign-token.md) |

Proposal coverage matrix must point these rows at 00/02 (see proposal sync).

## Rule

Do **not** materialize backlog story files until OP approves:

[`../../analysis/proposal-wproof-stories-2026-11-23.md`](../../analysis/proposal-wproof-stories-2026-11-23.md)

(or a successor revision OP names). **Keep D3 OP approve before materialize.**

### Proposal must include

1. Story keys + one-line scopes + depends.  
2. **Coverage matrix** where each row is invent-risk **C1–C15** and each **AC-W01…W09**, and columns include:  
   - owner story id;  
   - **architectural lock** (file + section in 01/02/00);  
   - **verification** (unit / channel test / manual);  
   - or **OOS** with explicit basis.  
   Owner story alone is insufficient.  
3. Explicit residuals: ROADMAP Phase 4 MCP, ChatGPT-only, ERC-1271, etc.  
4. Tech tasks that point at 01–02 locks (encoding / token-open-only / `/result` poll / HTML+challenge gate / mint secret / `/result` transitions) so execute agents do not invent.

### `/result` scenarios that must appear in proposal / story acceptance

| Scenario | Expected |
|----------|----------|
| Reject then retry same mint | `/result` stays `pending` through reject; later verify → `ok`; POC exit 0 |
| Parallel tab: reject + success | Server `ok` wins; POC `ok` |
| Read `ok` after token consumed for HTML | `GET /result` still returns `ok` until `expiresAt` |
| Result write fails after challenge consume | Login done; HTML fail-closed; POC exit ≠ 0 on **first of** local timeout **or** `/result` 4xx after `expiresAt` |

After OP approve → **D4** materialize `capybara-wallet-address-proof` with those tasks.
