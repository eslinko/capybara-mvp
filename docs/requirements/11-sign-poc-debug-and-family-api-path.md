# 11 — Sign POC operator debug + family API path

**Date (UTC):** `2026-11-26T10:25:00Z`  
**Status:** **Draft**  
**Profile:** `capybara` · focus `capybara/`  
**Parent:** [`10-wallet-address-proof-client.md`](10-wallet-address-proof-client.md) (Accepted) · soft [`04-dual-auth-wallet-supabase-user.md`](04-dual-auth-wallet-supabase-user.md) · [`05-family-membership-parent-adds-child.md`](05-family-membership-parent-adds-child.md) · [`08-identity-http-edge-on-host.md`](08-identity-http-edge-on-host.md)  
**Related:** scenario [`../manuals/FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](../manuals/FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) · gap [`../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md`](../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md) · Connector target [`../../../wallet POC/connector/docs/requirements/01-platform-challenge-signing.md`](../../../wallet%20POC/connector/docs/requirements/01-platform-challenge-signing.md) (canonical UX later; **not** this POC)  
**Architecture:** [`../architecture/10-wallet-address-proof-client/04-poc-debug-surface-and-bootstrap-assist.md`](../architecture/10-wallet-address-proof-client/04-poc-debug-surface-and-bootstrap-assist.md)

**Scope lock:** Temporary **same-host** Sign POC (`/sign/{token}` on Capybara Railway) for operator/debug — **no** separate Sign origin/deploy. Target long-term wallet UX = DOGEstonia Connector (REQ connector-01). **name ≠ create** until implement wave.

---

## 0. Verified as-is

| Seam | Fact |
|------|------|
| Sign → verify | **Present** — page posts `challengeId`+`signature`; host returns `ok`, `token`, `userId`, `address`, `proof`, optional invite fields |
| Post-success UI | Shows only `Verified. Address: …` — **discards** `proof` / `token` / `userId` in UI ([`host/signHttp.js`](../../host/signHttp.js) inline client) |
| Re-open same mint URL | `ESIGN_TOKEN_UNAVAILABLE` after consume — expected one-shot |
| Bootstrap HTTP | **Present** — `POST /auth/bootstrap` with `poolProof`+`parentProof` |
| Invite HTTP | **Present** — `POST /auth/invite` (INV-04); verify accept (INV-05) |
| DevTools-free proof capture | **Absent** |
| Step status timeline on Sign page | **Absent** (single status line only) |
| Explicit “Auth user created” (`userId`) on page | **Absent** |
| Bootstrap assist on Sign success | **Absent** |
| Documented API/test cast completion path using captured proof | **Partial** — APIs Present; operator path blocked by missing UI capture |

---

## 1. Purpose

Close operator gaps so Capybara family onboarding can be **debugged and completed** without DevTools: clear Sign process statuses, visible Auth user creation, copyable proofs/session, founder bootstrap assist on the **same** Sign page, and an API/test path to finish the family cast.

---

## 2. Locked decisions

| Area | Decision |
|------|----------|
| Hosting | Same Capybara host `/sign/*` — **no** isolated Sign URL/service |
| Lifetime | **POC / residual** until Connector `platform-auth` Present |
| Debug UX | Explicit step statuses; extra copy/action buttons preferred over Network panel |
| Auth visibility | On verify success, show **`userId`** as “Auth user Present” signal |
| Capture | Copy **proof**, **Bearer token**, **full verify JSON** without DevTools |
| Founder assist | When proofs available: copy bootstrap body (`poolProof`=`parentProof` allowed when addresses equal) + optional **POST bootstrap** from page → show `familyId` |
| Family completion | After `familyId`+Bearer: complete cast via **existing** invite/verify APIs and/or automated host harness/tests — no second Sign product |
| Non-goals | Connector implement · DOGEstonia brand · durable proof store · invent new auth crypto |

---

## 3. Gaps this REQ closes

| Gap ID | Problem | Close when |
|--------|---------|------------|
| **G-POC-01** | Sign steps opaque; hard to debug | Step statuses Present on page |
| **G-POC-02** | Proof/token not capturable without DevTools | Copy buttons + on-screen fields Present |
| **G-POC-03** | Auth user creation not obvious | `userId` surfaced on success |
| **G-POC-04** | Founder bootstrap awkward after Sign | Bootstrap copy + optional POST on same page |
| **G-POC-05** | Family cast not finishable from captured artifacts via API/tests | Operator/API/test path Present (invite+verify harness or manual API checklist wired to captured Bearer/`familyId`) |

---

## 4. Acceptance

| ID | Criterion |
|----|-----------|
| AC-P01 | Sign page shows ordered process statuses (bind → connect → sign → verify → outcome) |
| AC-P02 | On verify success, page shows `userId` (Auth user Present) and `address` |
| AC-P03 | Operator can copy `proof`, Bearer `token`, and full verify JSON without DevTools |
| AC-P04 | Fail paths (reject, mismatch, verify error) show status + error code on page |
| AC-P05 | On success, operator can copy bootstrap JSON body using the captured proof(s) |
| AC-P06 | Optional: page can `POST /auth/bootstrap` with captured proof(s) and display `familyId` / `bootstrapped` or error |
| AC-P07 | Documented API and/or automated test path completes family cast after bootstrap (invite children/co-parent + verify-accept) using Bearer/`familyId` — no DevTools required for proof capture step |
| AC-P08 | Page labeled POC/residual; Connector remains target wallet UX |
| AC-P09 | No separate Sign deploy/origin; no product private keys on page |
| AC-P10 | Unit/host harness covers new UI contracts where automatable; live MetaMask Pass not invented from unit alone |

---

## 5. Out of scope

- DOGEstonia Connector implementation (connector REQ-01)  
- Brand polish (connector REQ-02)  
- Membership durability across redeploy (EDGE-08 Residual)  
- Rewriting Accepted REQ-10 AC-W01…W09 as Failed  

---

## 6. Non-claims

Draft ≠ implement. Unit green ≠ live family onboarding Done. Connector Absent ≠ block this POC.
