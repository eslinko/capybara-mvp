# 01 — Components and client seam

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-27T17:23:20Z`  
**Interview locks:** Q1 A · Q2 A · Q5 A · Q9 A

## As-is (code)

| Seam | Fact |
|------|------|
| Membership / Invite mount | `createAuthRuntime` defaults `new MembershipStore()` / `new InviteStore()` — [`../../../host/authHttp.js`](../../../host/authHttp.js) (~402–406) |
| MembershipStore | In-memory Maps; comment «no Supabase / no persistence» — [`../../../packages/core/src/membership/MembershipStore.js`](../../../packages/core/src/membership/MembershipStore.js) |
| InviteStore | In-memory — [`../../../packages/core/src/invite/InviteStore.js`](../../../packages/core/src/invite/InviteStore.js) |
| Auth client | Live Auth via `@supabase/supabase-js` (REQ-09 Present) |
| Journals | NDJSON writers in core (`daily-payments`, `advance`, `debt`) |

## Target components

| Component | Role |
|-----------|------|
| Postgres-backed Membership store | Implements **same method surface** as `MembershipStore` (createFamily, addMembership, bindUserId, setPoolIdentity, markBootstrapped, lookups) |
| Postgres-backed Invite store | Same surface as `InviteStore` (create, findOpenInviteByTo, markAccepted, …) |
| Verified proof persistence | After successful `verifyAddressProof` / host verify — insert durable row; does **not** replace `ChallengeStore` |
| Journal writer seam | Shared core writers for activity / advance / debt; backend = Postgres primary |
| Service `supabase-js` client | Single client factory for Auth **and** table access (interview Q1 A) |

## Client seam (Q1 A)

- **Use** `@supabase/supabase-js` with service/secret key: Auth Admin API (unchanged) + table `.from` / RPC for durable entities.  
- **Do not** add a separate `pg` / `DATABASE_URL` driver for MVP (Q1/Q8).  
- Same Supabase project family as Auth (REQ-12 §2).

## Injection / trust (Q2 A · Q9 A)

| Condition | Behavior |
|-----------|----------|
| Unit / inject | Memory (or test) doubles via `createAuthRuntime` opts — AC-P08 |
| Production durable mode | Postgres adapters when Supabase env Present |
| Missing/invalid env | Fail-closed on durable read/write paths — no silent empty RAM family as success (AC-P06) |
| Process | Same Railway host `npm start`; CLI shares journal writer seam (no separate journal worker) |

## Trust boundaries

| Boundary | Rule |
|----------|------|
| Browser / Connector / wallet | Never receives service role key; never writes membership DDL |
| Host / CLI server | May use service client for tables + Auth |
| Supabase Auth | Users only — role stays on membership (REQ-04/09) |
| Postgres | Durable identity + proofs + journals |
