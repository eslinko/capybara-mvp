# Founder-first — dual Sign → one bootstrap (G2 / AUTH-05 · A1)

**Profile:** `capybara` · **Story:** `STORY-SCR-CAPY-AUTH-05-founder-first-dual-sign-bootstrap`  
**REQ:** [`../requirements/04-dual-auth-wallet-supabase-user.md`](../requirements/04-dual-auth-wallet-supabase-user.md) AC-A05/A06  
**Arch:** [`../architecture/04-dual-auth-wallet-supabase-user/03-bootstrap-pool-and-founder.md`](../architecture/04-dual-auth-wallet-supabase-user/03-bootstrap-pool-and-founder.md) · EDGE [`../architecture/08-identity-http-edge-on-host/02-bootstrap-session-and-capability-probe.md`](../architecture/08-identity-http-edge-on-host/02-bootstrap-session-and-capability-probe.md)  
**Consume:** [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) Step 1 · [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) §3.2

> **Lock A1:** Keep a **single** `POST /auth/bootstrap` that requires **pool + parent** AddressProof. Operator «founder first» = obtain two proofs (parent Sign, pool Sign; order flexible if addresses differ) then **one** bootstrap.  
> **Rejected A2:** Do **not** invent founder-only bootstrap or late-pool-split / founder-without-pool API.

---

## 1. Contract (AC-G2-01 / AC-G2-02)

| Step | Result |
|------|--------|
| Sign / `POST /auth/verify` alone | **Auth user + Bearer only** — **not** founder membership |
| Dual AddressProof (pool + parent) → `POST /auth/bootstrap` | Family + founder `role=parent` + pool identity (`setPoolIdentity`) |
| Field separation | Unchanged vs AC-A05/A06 — two proofs in **one** bootstrap call |

Operator elegance: Sign parent → Sign pool (or reverse) → single bootstrap → family ready for invites.

---

## 2. Operator path (dual-proof → one bootstrap)

Prerequisites: soft EDGE-07 clean (or accepted Residual) · host `/auth/*` Present (EDGE) · AUTH-04 bootstrap Present.

1. Challenge + Sign + `POST /auth/verify` for **parent** (`PARENT_ADDRESS`) → keep `proof` / session as needed.  
2. Challenge + Sign + `POST /auth/verify` for **pool** (`CAPY_POOL_ADDRESS`) → keep pool `proof` (may equal parent hex).  
3. `POST /auth/bootstrap` with `poolProof` + `parentProof` (see IDENTITY §3.2 curl).  
4. Expect: `familyId`, founder parent membership, pool identity bound, `bootstrapped: true`.

Detail curl shapes: [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) §3.1–§3.2. Arch sequence: arch-04 §Logical sequence.

---

## 3. Sign-alone ≠ founder (AC-G2-01)

| Claim | State |
|-------|-------|
| `POST /auth/verify` creates Auth user | Present |
| `POST /auth/verify` creates founder membership | **Forbidden / Absent** |
| Founder membership | **Only** after successful bootstrap |

Do not treat Auth-only Sign as Step 1 complete for family onboarding.

---

## 4. Non-claim — no split bootstrap (AC-G2-03)

| Invent | Allowed? |
|--------|----------|
| Founder-only bootstrap (no pool proof) | **No** (rejected A2) |
| Late pool API after founder-only bootstrap | **No** (B1 / AUTH-06 surface) |
| Change AC-A05/A06 to drop dual proofs | **No** |
| Docs invent live MetaMask / remote bootstrap Pass | **No** (AC-I06) |

---

## 5. Cross-links

| Doc | Role |
|-----|------|
| [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) §3.2 | Bootstrap curl + env |
| [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) | Step 1 aligned A1 |
| [`AUTH-USER-RETEST-CLEAN.md`](AUTH-USER-RETEST-CLEAN.md) | Soft clean before founder retest |
| Gap G2 | [`../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md`](../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md) |
