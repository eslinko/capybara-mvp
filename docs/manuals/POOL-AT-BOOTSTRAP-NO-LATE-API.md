# Pool at bootstrap — no late pool API (G7 / AUTH-06 · B1)

**Profile:** `capybara` · **Story:** `STORY-SCR-CAPY-AUTH-06-pool-at-bootstrap-no-late-api`  
**REQ:** [`../requirements/04-dual-auth-wallet-supabase-user.md`](../requirements/04-dual-auth-wallet-supabase-user.md) AC-A05/A06  
**Arch:** [`../architecture/04-dual-auth-wallet-supabase-user/03-bootstrap-pool-and-founder.md`](../architecture/04-dual-auth-wallet-supabase-user/03-bootstrap-pool-and-founder.md)  
**Code:** `packages/core/src/auth/bootstrapPoolAndFounder.js` → `store.setPoolIdentity(familyId, poolAddress)`  
**Consume:** [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) Step 5 · [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) §2 env · [`FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md`](FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md)

> **Lock B1:** Pool identity is established **only at bootstrap** via `CAPY_POOL_ADDRESS` AddressProof + `setPoolIdentity`.  
> **Rejected B2:** Do **not** invent a late «create pool account» founder HTTP capability after children.

---

## 1. Contract (AC-G7-01)

| Claim | State |
|-------|-------|
| Pool = family pool identity | Present (bootstrap) |
| Pool = invite / `Membership` `role=pool` | **Forbidden / Absent** |
| Late founder pool attach API | **Absent** · **rejected B2** |
| When set | Inside `POST /auth/bootstrap` (with parent proof — A1) |

---

## 2. Scenario Step 5 reframed (AC-G7-02)

Operator narrative «pool after children» is **not** a new product surface.

| Action | Meaning under B1 |
|--------|------------------|
| Confirm | Pool identity already set at Step 1 bootstrap |
| Optional Sign | If pool hex ≠ parent and ops need an Auth user for that hex — Sign/`verify` that address (Auth user only; ≠ new membership role) |
| Invent | `role=pool` membership · late create-pool API — **No** |

---

## 3. Env field separation (AC-G7-03)

| Env | Role |
|-----|------|
| `CAPY_POOL_ADDRESS` | Pool public address for bootstrap pool proof |
| `PARENT_ADDRESS` | Founder parent public address |

Fields stay **distinct** (AC-A06). Values **may equal** (same hex for both proofs). See IDENTITY §2.

---

## 4. Non-claim

| Invent | Allowed? |
|--------|----------|
| Late pool founder HTTP API | **No** (rejected B2) |
| Membership `role=pool` | **No** |
| Merge env into one field | **No** |
| Docs invent live late-pool Pass | **No** |

---

## 5. Cross-links

| Doc | Role |
|-----|------|
| [`FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md`](FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md) | A1 dual proof → one bootstrap (sets pool) |
| [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) | Env + bootstrap curl |
| Gap G7 | [`../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md`](../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md) |
