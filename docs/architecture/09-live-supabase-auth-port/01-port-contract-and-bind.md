# 01 — Port contract and bind semantics

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-24T13:17:11Z`

## Port contract (unchanged shape)

Same logical port as memory double ([`supabaseAuthPort.js`](../../../packages/core/src/auth/supabaseAuthPort.js)):

```
createOrLinkUser(AddressProof) → { userId, address, created }
```

- `AddressProof`: `address`, `challengeId`, `verifiedAt`, `verifiedAtMs` (as today).  
- `userId`: Supabase Auth user id (UUID string from Auth).  
- `created: true` on first create; `false` on link to existing.  
- Fail → `EAUTH_BIND_FAILED` / `EAUTH_BAD_PAYLOAD` (existing error vocabulary).

Consumer: [`bindAddressToAuthUser.js`](../../../packages/core/src/auth/bindAddressToAuthUser.js) — no HTTP invent.

## Identity key (interview lock A)

**Synthetic email** (not a real inbox) as Admin Auth stable key:

```
{normalizeAddress(address)}@capybara.local
```

- Use existing `normalizeAddress` (checksum/lower discipline already in core).  
- Also set Auth metadata `address` = normalized address (app_metadata preferred for server-owned claims; implement must not invent DDL tables).

## Create / link algorithm (interview lock A)

1. Build synthetic email from proof address.  
2. `auth.admin.createUser` with that email + metadata.address; no password login path required for MVP (disable email confirm as needed for Admin-created users — exact SDK flags at implement).  
3. On success → `{ userId, address, created: true }`.  
4. On “already exists” (SDK duplicate) → resolve user by email (Admin get/list) → `{ userId, address, created: false }`.  
5. Empty userId → `EAUTH_BIND_FAILED`.

Do **not** use custom `users` table as Auth substitute (AUTH-02 / REQ-09 lock).

## Trust

| Boundary | Must | Must not |
|----------|------|----------|
| Port ← bind helper | Valid AddressProof already verified by host | Trust client-supplied userId |
| Port → Supabase | Service-role / secret key server-side only | Expose key in responses |
| Role | Membership remains role source | Treat Auth user as role |

## Non-goals

Email inbox delivery · magic link UX · address rebind · Phase 3 membership rows in Supabase.
