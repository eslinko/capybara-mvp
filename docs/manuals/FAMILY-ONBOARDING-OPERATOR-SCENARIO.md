# Family onboarding — operator scenario (founder → kids → Miguel → pool)

**Profile:** `capybara` · **Host:** `https://capybara-mvp.up.railway.app` (REQ-07)  
**UTC drafted:** `2026-11-25T13:36:57Z`  
**Depth / gaps:** [`../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md`](../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md)  
**Related:** [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) · [`WALLET-ADDRESS-PROOF-OPERATOR.md`](WALLET-ADDRESS-PROOF-OPERATOR.md) · [`WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md`](WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md) · REQ [`../requirements/05-family-membership-parent-adds-child.md`](../requirements/05-family-membership-parent-adds-child.md)

> **Honesty:** Many steps are **Blocked by gap G#** until host invite + Sign UX + verify→invite wiring ship. Do not invent live Pass from this manual alone. Unit green ≠ family onboarding Done.

---

## 0. Target cast

| Actor | Role | Address source |
|-------|------|----------------|
| You (founder parent) | `parent` (founder) | `PARENT_ADDRESS` (MetaMask account you control) |
| Tristan | `child` | `.env` `TRISTAN_ADDRESS` |
| Bastian | `child` | `.env` `BASTIAN_ADDRESS` |
| Miguel | `parent` (co-parent) | ops address (**`MIGUEL_ADDRESS` not in `.env.example`** — see G6) |
| Pool | family pool identity | `CAPY_POOL_ADDRESS` (may equal parent hex today) |

Order (operator lock): **clean → founder → invite kids → kids Sign → Miguel invite+Sign → pool**.

---

## 1. Preconditions

| Need | Notes |
|------|--------|
| Railway host healthy | `GET /health` → `{"ok":true}` |
| Auth env | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or service-role alias), `CAPY_BEARER_SECRET` |
| Sign mint (until G5) | `CAPY_SIGN_MINT_SECRET`, `CAPY_PUBLIC_BASE_URL` |
| MetaMask | Desktop extension (Channel A) or in-app (Channel B) — same encoding |
| Addresses known | Tristan / Bastian / parent / pool / Miguel ready **before** invite (address-first, REQ-05) |

---

## 2. Steps

### Step 0 — Clean Auth start

**Goal:** Remove prior test Auth user(s) so retest is honest.

| | |
|--|--|
| Target | Delete Auth user for founder address (Admin API) |
| Present | Operator checklist [`AUTH-USER-RETEST-CLEAN.md`](AUTH-USER-RETEST-CLEAN.md) · Admin list/delete against project (REQ-09) |
| Status | **Procedure Present** (EDGE-07) · live Admin delete/absence this wave = **Residual** — [`evidence/auth-user-retest-clean-residual.md`](evidence/auth-user-retest-clean-residual.md) · do not invent Pass |

Expected after (when live Pass): no Auth row for founder synthetic email `{normalizeAddress}@capybara.local`.  
**Before Step 1:** run clean checklist §3 or accept labeled Residual.

---

### Step 1 — Founder: dual Sign → one bootstrap (A1)

**Goal:** Auth user **and** founder membership `role=parent` after **one** bootstrap (not after Sign alone).

| | |
|--|--|
| Target UX | Operator «founder first» = obtain parent + pool proofs, then bootstrap |
| Present path | Sign/`verify` parent → Sign/`verify` pool (order flexible) → **single** `POST /auth/bootstrap` with both AddressProofs |
| Status | **Contract Present (AUTH-05 / A1)** — see [`FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md`](FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md) · IDENTITY §3.2 |
| Lock | Sign alone ≠ founder · **rejected A2** founder-only / split bootstrap |

**Operator path (A1):**

1. Obtain AddressProof for parent (Sign/`verify`).  
2. Obtain AddressProof for pool (`CAPY_POOL_ADDRESS` — may equal parent hex).  
3. `POST /auth/bootstrap` with **pool + parent** proofs (IDENTITY §3.2) — **one** call.  
4. Expect: `familyId`, `founderRole: parent`, `userId`, `bootstrapped: true`.

**Operator check:** Bearer session + membership → `GET/POST /v1/capabilities/profile.self` should allow when membership Present (live ACL still **G9**).

---

### Step 2 — Create invites for Tristan and Bastian

**Goal:** Parent session creates open Invite `{ to, role: child, familyId }`.

| | |
|--|--|
| Target | HTTP API (Bearer founder) `createInvite` for `TRISTAN_ADDRESS` then `BASTIAN_ADDRESS` |
| Present | Core `createInvite` only — **no** host `/invite*` · InviteStore **not** on host runtime |
| Status | **Blocked G3** |

**When Present (illustrative shape — not inventing route):** authenticated parent posts invite with `to` + `role: "child"` + family context; expect open invite id. Fail-closed if family not bootstrapped / non-parent / address role conflict (REQ-05).

---

### Step 3 — Kids Sign (manual address on page)

**Goal:** Tristan then Bastian open Sign UI, **type/paste their address**, MetaMask Sign → Auth user + membership `child` via invite accept.

| | |
|--|--|
| Target | Sign page allows manual address; verify binds open invite |
| Present | Address locked at `POST /sign/mint` body; HTML has no address field (**G5**). Verify does **not** call `bindInviteeAndAccept` (**G4**) |
| Status | **Blocked G5 + G4** (and G3 for open invite) |

**Workaround today (not target UX):** operator mints URL with secret + child address → child Signs that URL → still only Auth user unless G4 closed.

Channel A procedure (mint/Sign): [`WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md`](WALLET-ADDRESS-PROOF-CHANNEL-A-DESKTOP.md).

**Expected after G3–G5 closed:** Supabase Auth user for child email; membership `role=child`; Invite accepted; `profile.self` subject to child catalog.

---

### Step 4 — Miguel co-parent (after children)

**Goal:** Invite `role=parent` for Miguel → Sign → equal parent (REQ-03/05).

| | |
|--|--|
| Target | Same invite+Sign pattern as kids |
| Present | Core supports `role=parent` invite; host API Absent; `MIGUEL_ADDRESS` Absent from `.env.example` |
| Status | **Blocked G6** (depends on G3/G4/G5) |

---

### Step 5 — Pool confirm (B1 — already set at bootstrap)

**Goal:** Confirm family pool identity (set at Step 1 bootstrap) — **not** invent a late create-pool API or `role=pool` membership.

| | |
|--|--|
| Target | Operator narrative «pool after children» = confirm / optional Sign same hex |
| Present | Pool identity set **inside** bootstrap (`setPoolIdentity`); not an invite/membership role |
| Status | **Contract Present (AUTH-06 / B1)** — see [`POOL-AT-BOOTSTRAP-NO-LATE-API.md`](POOL-AT-BOOTSTRAP-NO-LATE-API.md) |
| Lock | **Rejected B2** late pool founder API · fields `CAPY_POOL_ADDRESS` / `PARENT_ADDRESS` stay distinct (values may equal) |

**Operator path (B1):**

1. After Step 1 bootstrap — pool identity already Present on the family.  
2. Optional: if pool hex ≠ parent and ops need Auth user for pool address — Sign/`verify` that hex (Auth only).  
3. Do **not** expect a separate founder «create pool» HTTP route.

---

### Step 6 — Optional live ACL evidence

**Goal:** Unauth `profile.self` denied; authed founder/child/co-parent behave per RoleGate.

| | |
|--|--|
| Present | Unit probe Present |
| Status | Live Railway evidence **Residual · G9** |

---

## 3. Artifact checklist (when gaps closed)

| Actor | Auth `userId` | Membership role | Invite |
|-------|---------------|-----------------|--------|
| Founder | Present | `parent` (founder) | — |
| Tristan | Present | `child` | accepted |
| Bastian | Present | `child` | accepted |
| Miguel | Present | `parent` | accepted |
| Pool | Present iff product treats pool as Auth user | pool identity on family (Present model) | n/a |

Also record: `familyId`, host URL, UTC — under `docs/manuals/evidence/` when doing live Pass (do not invent).

---

## 4. Gap quick map → stories (A1+B1)

| Step | Gaps | REQ-level stories |
|------|------|-------------------|
| 0 Clean | G1 | EDGE-07 |
| 1 Founder | G2 **A1** | AUTH-05 (dual Sign → one bootstrap) |
| 2 Invites | G3 (+ G8) | INV-04 · EDGE-08 |
| 3 Kids Sign | G5, G4 | WPROOF-07 · INV-05 |
| 4 Miguel | G6 | INV-06 |
| 5 Pool | G7 **B1** | AUTH-06 (pool at bootstrap; no late API) |
| 6 ACL live | G9 | EDGE-09 |

Full table: [`../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md`](../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md) §3.

---

## 5. Non-claims

- This scenario does **not** claim Phase 2 Done, REQ-08 Accepted, or invite HTTP Present.  
- Opaque invite token Absent (REQ-05).  
- In-memory membership/invite = redeploy risk (**G8**).  
- Do not paste private keys from `.env` into chats, evidence, or git.
