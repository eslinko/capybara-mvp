# Capybara requirements index

**Updated:** `2026-11-24` (REQ-10 Accepted · live dual-channel Railway) · prior `2026-11-23` (REQ-10 locks) · `2026-11-21T13:43:45Z`  
**Profile:** `capybara` · focus `capybara/`  
**Target roadmap:** [`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md)  
**Parent product:** [`../product/CAPYBARA-FAMILY-MVP-PRODUCT-REQUIREMENTS.md`](../product/CAPYBARA-FAMILY-MVP-PRODUCT-REQUIREMENTS.md)  
**ROLE wave:** [`../tasks/run-reports/operator-waves/wave-20261119-capy-role.md`](../tasks/run-reports/operator-waves/wave-20261119-capy-role.md)  
**AUTH wave:** [`../tasks/run-reports/operator-waves/wave-20261120-capy-auth.md`](../tasks/run-reports/operator-waves/wave-20261120-capy-auth.md)  
**INV wave:** [`../tasks/run-reports/operator-waves/wave-20261120-capy-inv.md`](../tasks/run-reports/operator-waves/wave-20261120-capy-inv.md)  
**CAT wave:** [`../tasks/run-reports/operator-waves/wave-20261120-capy-cat.md`](../tasks/run-reports/operator-waves/wave-20261120-capy-cat.md)  
**HOST wave:** [`../tasks/run-reports/operator-waves/wave-20261121-capy-host.md`](../tasks/run-reports/operator-waves/wave-20261121-capy-host.md)

---

## Registry

| ID | File | Status | Phase |
|----|------|--------|-------|
| REQ-01 | [`01-child-debt-accounting.md`](01-child-debt-accounting.md) | Draft — domain CLI Done via stories | Domain (pre Target Path) |
| REQ-02 | [`02-activity-payout-advance.md`](02-activity-payout-advance.md) | Draft — domain CLI Done via stories | Domain (pre Target Path) |
| REQ-03 | [`03-family-roles-and-capability-matrix.md`](03-family-roles-and-capability-matrix.md) | Draft — ROLE Done; AUTH+INV+CAT modules Present (pointers) | **Phase 0** |
| REQ-04 | [`04-dual-auth-wallet-supabase-user.md`](04-dual-auth-wallet-supabase-user.md) | Draft — AUTH modules Present; live residual → REQ-08…10 | **Phase 0** |
| REQ-05 | [`05-family-membership-parent-adds-child.md`](05-family-membership-parent-adds-child.md) | Draft — INV-01…03 modules Present; token/`invite_member` id residual | **Phase 0** |
| REQ-06 | [`06-role-scoped-capability-catalog.md`](06-role-scoped-capability-catalog.md) | Draft — CAT-01…03 Done (alias); live host ACL = Phase 2 | **Phase 0** |
| REQ-07 | [`07-railway-family-host.md`](07-railway-family-host.md) | **Accepted** — host Present; remote health OK | **Phase 1** |
| REQ-08 | [`08-identity-http-edge-on-host.md`](08-identity-http-edge-on-host.md) | Draft — EDGE-01…04 unit Present; remote identity residual honesty | **Phase 2** |
| REQ-09 | [`09-live-supabase-auth-port.md`](09-live-supabase-auth-port.md) | **Accepted** `2026-11-25` — SBPORT-01…05 · live bind Pass | **Phase 2** |
| REQ-10 | [`10-wallet-address-proof-client.md`](10-wallet-address-proof-client.md) | **Accepted** `2026-11-24` — live Channel A+B Railway; WPROOF Done | **Phase 2** |
| REQ-11 | [`11-sign-poc-debug-and-family-api-path.md`](11-sign-poc-debug-and-family-api-path.md) | **Draft** `2026-11-26` — Sign POC debug capture + family API path | **Phase 2 residual POC** |

---

## Phase 0 gate checklist

| Item | Status |
|------|--------|
| REQ-03 roles + matrix | Present on disk; ROLE core seams verified |
| REQ-04 dual auth + bootstrap | Present on disk; AUTH modules verified; live host/Supabase/wallet → Phase 2 REQ-08…10 |
| REQ-05 membership / invite | Present on disk; INV modules verified; opaque token / `family.invite_member` id Absent |
| REQ-06 capability catalog | Present on disk; CatalogAlias + deny-always mint/deploy Present (CAT); full §3 in `ALLOW_BY_ROLE` still Absent; AC-C02 fine residual |
| Operator accept of REQ texts | Pending (post-materialize review; e2e deferred OK) |
| Address rebind | Deferred in ROADMAP (not Phase 0) |

**Phase 0 Done** when operator accepts REQ-03…06 AC and Target ROADMAP Phase 0 status → Done. ROLE/AUTH/INV/CAT module implement ≠ automatic Phase 0 Done (catalog expand residual / live host / accept gate).

---

## Phase 1 checklist

| Item | Status |
|------|--------|
| REQ-07 Railway family host | Present + **Accepted** (operator 2026-11-21) |
| Host entry / packaging / remote health | **Present** — `npm start`, `host/`, RAILPACK `railway.toml`, `https://capybara-mvp.up.railway.app/health` → 200 |
| HOST stories 01…03 | Done (wave 2026-11-21) |
| Operator accept REQ-07 AC | **Accepted** |

**Phase 1 Done** — AC-H01…H06 accepted; ROADMAP Phase 1 → Done.

---

## Phase 2 checklist

| Item | Status |
|------|--------|
| REQ-08 Identity HTTP edge on host | REQ Present; host `/auth/*` + probe **Present** (EDGE unit); remote live identity = residual honesty |
| REQ-09 Live Supabase Auth port | **Accepted** `2026-11-25` — SBPORT-01…05 Done · Pass [`../manuals/evidence/live-supabase-auth-bind-result.md`](../manuals/evidence/live-supabase-auth-bind-result.md) |
| REQ-10 Wallet address-proof client | **Accepted** `2026-11-24` — dual-channel live PASS; manuals/matrix/evidence Present |
| Architect / wallet-proof crypto + stories | Crypto+arch Present; backlog [`../tasks/backlog-stories/capybara-wallet-address-proof/`](../tasks/backlog-stories/capybara-wallet-address-proof/) WPROOF-01…06 **Done** + live A/B |
| Live unauth deny + role ACL (gate) | Pending (REQ-08) |
| Operator accept REQ-08…10 AC | REQ-09/10 **Accepted**; REQ-08 Pending |

**Phase 2 Done** when AC-I* / AC-S* / AC-W* accepted and ROADMAP Phase 2 → Done (unauth denied; role ACL live on host). REQ-09/10 Accepted ≠ Phase 2 Done — next **REQ-08** ACL.
