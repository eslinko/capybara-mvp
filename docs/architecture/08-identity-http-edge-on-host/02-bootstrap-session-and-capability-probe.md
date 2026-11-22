# Bootstrap, session, and capability probe

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-21T14:42:22Z`  
**REQ:** [`../../requirements/08-identity-http-edge-on-host.md`](../../requirements/08-identity-http-edge-on-host.md) AC-I01…I04 · §2 Pool vs parent · Terminal POC pointer  
**Interview:** DP4-A · DP6-A · DP7-A

## Login / session flow

1. Client requests challenge for an address (`/auth/…`).  
2. Non-custodial wallet signs (REQ-10 / MetaMask — OOS body here).  
3. Client submits proof → verify → bind (REQ-09 port) → bearer session.  
4. Later calls send `Authorization: Bearer`.  
5. Logout invalidates bearer (AUTH `logoutBearer` contract).

## Bootstrap flow (multi-step — DP7-A)

Aligned with core `bootstrapPoolAndFounder` (pool proof + parent proof; AC-A05/A06):

1. Challenge + verify for **pool** address (default from env `CAPY_POOL_ADDRESS`).  
2. Challenge + verify for **parent** address (default from env `PARENT_ADDRESS`) — may equal pool hex; fields stay separate.  
3. `POST` bootstrap with both AddressProofs → founder parent membership + pool identity in MembershipStore.  
4. Second bootstrap on live family → reject (core behavior).

Host must not merge pool and parent into one settings field.

## Capability probe (AC-I01 / AC-I02)

| Item | Lock |
|------|------|
| Capability id | `profile.self` (coarse RoleGate Present) |
| Unauth | DualAuthGate deny (AC-I01) |
| Authed | DualAuthGate allow → CatalogAlias/RoleGate on `profile.self` (AC-I02) |
| Response | Minimal membership/role echo (U3 — no invent domain payloads) |

Not a full family API. Journals / payouts / invite HTTP = other REQ/phases.

## REQ-10 POC consume (pointer only)

Terminal POC reads `CAPY_POOL_ADDRESS`, drives challenge against this edge, MetaMask Sign, submit verify — see REQ-10 AC-W06. This arch does not materialize POC files.
