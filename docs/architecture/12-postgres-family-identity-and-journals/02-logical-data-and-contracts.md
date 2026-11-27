# 02 — Logical data and contracts

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-27T17:23:20Z`  
**Interview locks:** Q3 A · Q4 A · Q5 A  
**Honesty:** logical entities only — **no invented DDL column lists** beyond REQ + as-is store fields.

## Entity tables (Q3 A)

Separate logical tables (or equivalent relations), not one JSON blob:

| Logical entity | Source fields (as-is / REQ) | Notes |
|----------------|----------------------------|-------|
| Family | `id`, `label?`, `poolAddress?`, `bootstrapped?` | MembershipStore family map |
| Membership | `id`, `familyId`, `role` ∈ {parent,child}, `address`, `userId?` | Role on membership |
| Invite | `id`, `from`, `to`, `role`, `familyId`, `status` ∈ {open,accepted}, `displayName?`, `fromMembershipId?` | InviteStore |
| VerifiedAddressProof | `address`, `challengeId`, `verifiedAt` (+ server id); `familyId` **optional** | REQ 1A · Q4 A |
| Activity / Advance / Debt journal entries | Existing event payloads from NDJSON writers | Mode `mock` \| `gfl_reality` preserved |

Exact SQL names (PGDUR-01 Present under `capybara/supabase/migrations/`):  
`families` · `memberships` · `invites` · `verified_address_proofs` · `activity_journal_entries` · `advance_journal_entries` · `debt_journal_entries`.  
Journals: `mode` + `payload` jsonb (NDJSON event object). Soft≠Live — migrations ≠ invent REQ-12 Done.

## Verified proof contract (Q4 A)

- Persist **only after** successful verify (consumed challenge → AddressProof).  
- Required logical: `address`, `challengeId`, `verifiedAt` (and server-side id).  
- `familyId` optional/null when membership not yet known (e.g. first invitee verify).  
- Pending `ChallengeStore` entries remain ephemeral (REQ §2 / §4).

## Journal contract (Q5 A)

- Writers today: activity [`ndjsonLogReader.js` / `ndjsonLogWriter.js`](../../../packages/core/src/daily-payments/), advance [`advanceWriter.js`](../../../packages/core/src/advance/advanceWriter.js), debt [`debtWriter.js`](../../../packages/core/src/debt/debtWriter.js).  
- Target: same call sites → Postgres primary; mock vs reality split intact (REQ AC-P04).  
- Dual-write-as-goal **not** required (REQ §2 cutover lock).

## Invariants carried forward

- Address → one role globally (MembershipStore).  
- Role immutable; no soft-delete invent beyond REQ-05.  
- Auth userId bind ≠ membership row (REQ-09 stays Auth).  
- Replay bootstrap still forbidden when family bootstrapped in Postgres.
