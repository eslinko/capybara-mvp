# 03 — Bootstrap: pool and founder

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-27T20:01:22Z` (AUTH-07 trust extend) · prior `2026-11-20T07:29:49Z`

## In scope of this arch (F1-A)

Bootstrap is a first-class dual-auth flow for the family instance — not deferred out of REQ-04 (AC-A05, AC-A06).

## Logical sequence (REQ §3)

1. Family deploy instance (per-family host).  
2. Bootstrap proofs: **signed pool address** + **signed first parent address** (same or different accounts — AC-A06).  
3. Create founder **parent** membership; bind pool identity for the family; link Supabase user for the founder parent after dual-auth.  
4. Further parents/children — **only via invite** (REQ-05); repeat bootstrap on a live family → refuse (product rule; invite mechanics OOS here).

## Trust notes

- Both addresses require SIWE-class proof at bootstrap (AC-A05).  
- Login signature still ≠ money-sign / custody (REQ §2; O-02 later).  
- Address rebind after bind: **not** Phase 0 (AC-A07).

### AUTH-07 extend — verified proof SoT (Soft≠Live)

- After successful `/auth/verify`, pending challenge is **consumed**; client may hold AddressProof JSON for `POST /auth/bootstrap`.  
- **AddressProof JSON alone is insufficient** for trust: host must resolve object-path proofs against **verified AddressProof store** (`listByChallengeId` + address match) — forge `{address}`-only → reject.  
- Pending `ChallengeStore` stays ephemeral; durable audit/gate = verified proof rows (REQ-12 / PGDUR-03 Soft Present).  
- Host: `resolveBootstrapProof` object-path → `assertVerifiedProofRecorded` (`listByChallengeId` + address) · forge → `EAUTH_BOOTSTRAP_UNVERIFIED` / mismatch.  
- Story: [`../../tasks/backlog-stories/capybara-dual-auth/STORY-SCR-CAPY-AUTH-07-bootstrap-require-verified-proof.md`](../../tasks/backlog-stories/capybara-dual-auth/STORY-SCR-CAPY-AUTH-07-bootstrap-require-verified-proof.md). Soft implement Present ≠ invent Live Pass / REQ-04 Accepted.

## Coexistence

Host bootstrap HTTP Present (EDGE Soft). Membership create via store adapters (RAM inject for unit · Postgres Soft when createClient — REQ-12 / PGDUR). Invite mechanics = REQ-05.
