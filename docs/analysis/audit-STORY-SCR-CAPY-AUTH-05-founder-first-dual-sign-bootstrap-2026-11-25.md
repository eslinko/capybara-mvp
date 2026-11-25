# P4 Audit — STORY-SCR-CAPY-AUTH-05 (founder-first dual Sign → one bootstrap / G2)

- **Тип:** hard audit docs/ops + code vs AC · **Правила:** `@.cursor/rules/analysis.mdc`
- **Дата аудита:** 2026-11-25
- **builder_project:** `capybara` · Prefer `capybara/docs/analysis/` (fence)
- **AC source (storyFile):** [`STORY-SCR-CAPY-AUTH-05-founder-first-dual-sign-bootstrap.md`](../tasks/backlog-stories/capybara-dual-auth/STORY-SCR-CAPY-AUTH-05-founder-first-dual-sign-bootstrap.md)
- **Pkg tip:** [`pkg-000084-20261125-capy-auth-05-founder-first-dual-sign-bootstrap.yaml`](../tasks/capybara-active-packages/pkg-000084-20261125-capy-auth-05-founder-first-dual-sign-bootstrap.yaml)
- **Bullrun ($bullrun):** [`run-summary-20261125-1456-STORY-SCR-CAPY-AUTH-05-founder-first-dual-sign-bootstrap.md`](../tasks/run-reports/run-summary-20261125-1456-STORY-SCR-CAPY-AUTH-05-founder-first-dual-sign-bootstrap.md) — actualized this P4
- **Gate:** [`story-acceptance-gate-….md`](../tasks/epics/EPIC-SCR-CAPY-AUTH/stories/STORY-SCR-CAPY-AUTH-05-founder-first-dual-sign-bootstrap/story-acceptance-gate-STORY-SCR-CAPY-AUTH-05-founder-first-dual-sign-bootstrap.md) → P3 **PASS** `2026-11-25T14:56:09Z` · OPEN=0
- **Deliverables:** `docs/manuals/FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md` · scenario Step 1 A1 · IDENTITY §3.2
- **Code anchors:** `packages/core/src/auth/assertBootstrapInput.js` · `bootstrapPoolAndFounder.js` · `host/authHttp.js` (`/auth/verify`, `/auth/bootstrap`) · `bindAddressToAuthUser.js` (no MembershipStore)
- **Lock:** A1 dual proof → one bootstrap · rejected A2
- **Метод:** Read/Glob/Grep only · no product edits · no invent live MetaMask/remote Pass · no invent AC
- **Правило:** findings only; no implementation; no P5/P8.

---

## Scope

| Item | Anchor |
|------|--------|
| AC-G2-01..03 | backlog story §Acceptance Criteria |
| Surface | Contract docs + scenario + IDENTITY; code confirms as-is A1 |
| OOS | Invent split-bootstrap · invite HTTP · Sign manual · persistence · live Pass invent |

---

## 0. Facts table (AC)

| Claim | Evidence path | Result |
|-------|---------------|--------|
| AC-G2-01: Sign alone ≠ founder; bootstrap required for founder membership | Docs: `FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md` §1/§3 · scenario Step 1 · IDENTITY §3.2. Code: `authHttp.js` `/auth/verify` → `verifyAddressProof` + `bindAddressToAuthUser` + session only (no MembershipStore). Founder `role=parent` only in `bootstrapPoolAndFounder.js` L101–106 after dual proofs | **Pass** |
| AC-G2-02: Dual AddressProof → one bootstrap (A1); AC-A05/A06 field separation unchanged | Docs: FOUNDER-FIRST §2 · IDENTITY §3.2 curl `poolProof`+`parentProof`. Code: `assertBootstrapInput.js` L32–37 both proofs required; `bootstrapPoolAndFounder.js` L77–79 assert both; host L526–541 passes both | **Pass** |
| AC-G2-03: Explicit non-claim — no founder-only bootstrap invent | Docs: FOUNDER-FIRST §4 rejected A2 · scenario Lock · IDENTITY L123. Grep JS: no founder-only / split-bootstrap product API | **Pass** |
| A1 lock vs code | Single `POST /auth/bootstrap`; missing proof → `EAUTH_BOOTSTRAP_MISSING_PROOF`; success → `setPoolIdentity` + `markBootstrapped` | **Pass** |
| No invent live MetaMask / remote bootstrap Pass | Gate + FOUNDER-FIRST §4 · IDENTITY residual remote note · gap G2 Gap column honesty | **Pass** (honesty; ≠ OPEN) |

**AC verdict: 3/3 Pass. OPEN (product/docs AC) = 0.**

**Verdict: PASS**

---

## 1. Story / tasks actualization (auditor)

| Key | P3 claim | Auditor |
|-----|----------|---------|
| STORY-SCR-CAPY-AUTH-05 | 🟢 Done · gate PASS · OPEN=0 | **Confirm Done** · A1 contract Present · code aligns |
| t01 dual-proof-one-bootstrap | 🟢 Done · AC-G2-02 | **Confirm Done** |
| t02 sign-alone-not-founder | 🟢 Done · AC-G2-01 | **Confirm Done** · verify ≠ membership in code |
| t03 align-scenario-identity | 🟢 Done | **Confirm Done** · Step 1 + IDENTITY §3.2 |
| t04 nonclaim-split-bootstrap | 🟢 Done · AC-G2-03 | **Confirm Done** |
| Incomplete TASKED | — | **0** |

---

## 2. Findings by severity

| Severity | OPEN | CLOSED |
|----------|------|--------|
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 0 | 0 |
| Low | 0 | 0 |
| Info | 0 | 0 |

### Residual (not OPEN — honesty / OOS)

| ID | Note | How close (disposition only) |
|----|------|------------------------------|
| F-INFO-01 | Live MetaMask / remote bootstrap Pass not claimed this wave (docs ≠ invent; AC-I06). Story DoD = contract clarity A1 | Optional later live evidence wave — out of AUTH-05 DoD; do not invent Pass |

### **OPEN = 0** · Incomplete TASKED = **0**

---

## 3. Regressions

| Check | Result |
|-------|--------|
| Split / founder-only bootstrap introduced | **None** |
| Verify path creates founder membership | **None** |
| Docs claim Sign alone = founder | **None** |
| AC-A05 dual-proof field separation dropped | **None** |

---

## 4. Next label only

- OP: P4 **PASS** · OPEN=0 · may P7 skip / Done / P8 per OP (VAL does not advance).
- No code/doc patches; no invent AC; no invent live bootstrap Pass.
