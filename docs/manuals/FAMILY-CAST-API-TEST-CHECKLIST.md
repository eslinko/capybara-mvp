# Family cast — API / test completion checklist (G-POC-05 / INV-07)

**Profile:** `capybara` · **Story:** `STORY-SCR-CAPY-INV-07-api-test-family-cast-completion`  
**REQ:** [`../requirements/11-sign-poc-debug-and-family-api-path.md`](../requirements/11-sign-poc-debug-and-family-api-path.md) AC-P07 · soft [`../requirements/05-family-membership-parent-adds-child.md`](../requirements/05-family-membership-parent-adds-child.md)  
**Arch:** [`../architecture/10-wallet-address-proof-client/04-poc-debug-surface-and-bootstrap-assist.md`](../architecture/10-wallet-address-proof-client/04-poc-debug-surface-and-bootstrap-assist.md) §3  
**Consume:** INV-04 `POST /auth/invite` · INV-05 verify→`bindInviteeAndAccept` · WPROOF-08/09 capture · scenario Steps 2–4  
**Harness:** [`../../tests/unit/inv07-family-cast-completion.test.js`](../../tests/unit/inv07-family-cast-completion.test.js)

> **Lock:** Reuse Present INV-04/05 only — **no** parallel invite invent · **no** new invite routes.  
> **Honesty:** Unit/harness **≠** invent live MetaMask Pass · **≠** family onboarding Done. **G8 Residual** mid-redeploy (in-memory membership/invite wipe) — [`MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md`](MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md).  
> **PGDUR-06 Soft≠Live:** host `store_kind` must be `postgres` for durable cast · ok bootstrap ⇒ `families` · invite ⇒ `invites` · verify-bind ⇒ `memberships`. **Live cast Residual OK** — Soft ≠ invent Pass / REQ-12 Done.

---

## 0. Capture artifacts (WPROOF-08/09) — no secrets in git

After founder Sign + bootstrap assist on the Sign POC page:

| Artifact | Source (UI) | Use |
|----------|-------------|-----|
| Bearer | `#btn-copy-bearer` (WPROOF-08) after verify success | `Authorization: Bearer …` on invite |
| `familyId` | Bootstrap result / `#bootstrap-result` after optional POST bootstrap (WPROOF-09) · or verify/bootstrap JSON | body `familyId` |
| Cast addresses | Local `.env` `TRISTAN_ADDRESS` · `BASTIAN_ADDRESS` · `MIGUEL_ADDRESS` (ops only) | invite `to` |

**Do not** commit Bearer tokens, private keys, or live `.env` values. Placeholders below: `$HOST`, `$BEARER`, `$FAMILY_ID`, `$TRISTAN_ADDRESS`, `$BASTIAN_ADDRESS`, `$MIGUEL_ADDRESS`.

**Test doubles:** mocha harness uses fixture Bearer/`familyId`/addresses — same contracts as capture, no live MetaMask required for unit green.

---

## 1. Operator curl sequence (Steps 2–4)

Prereq: Step 1 bootstrap Done · parent Bearer + `familyId` Present (WPROOF-08/09 or residual live).

### 1.1 Invite Tristan (`child`)

```bash
curl -sS -X POST "$HOST/auth/invite" \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -d "{\"familyId\":\"$FAMILY_ID\",\"to\":\"$TRISTAN_ADDRESS\",\"role\":\"child\"}"
```

Expect: `ok: true` · `invite.status: open` · `invite.role: child`.

### 1.2 Invite Bastian (`child`)

```bash
curl -sS -X POST "$HOST/auth/invite" \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -d "{\"familyId\":\"$FAMILY_ID\",\"to\":\"$BASTIAN_ADDRESS\",\"role\":\"child\"}"
```

### 1.3 Kids accept (INV-05)

Mint Sign URL → invitee types/pastes address → Connect & Sign → `POST /auth/verify` with challenge+signature.  
Expect: `inviteAccepted: true` · `membershipRole: child` · Invite accepted.  
Live MetaMask Pass = **Residual** until operator evidence — unit path: harness §2.

### 1.4 Invite Miguel (`parent`) — after kids

```bash
curl -sS -X POST "$HOST/auth/invite" \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -d "{\"familyId\":\"$FAMILY_ID\",\"to\":\"$MIGUEL_ADDRESS\",\"role\":\"parent\"}"
```

Expect: `invite.role: parent`. **Do not** call `POST /auth/bootstrap` for Miguel.

### 1.5 Miguel accept

Same verify path → `membershipRole: parent`. Soft checklist: [`CO-PARENT-MIGUEL-ENV-SCENARIO.md`](CO-PARENT-MIGUEL-ENV-SCENARIO.md).

---

## 2. Automated harness (CI / local)

```bash
cd capybara && npm test -- --grep 'INV-07'
```

Harness seeds bootstrapped `familyId` + parent Bearer (fixture = WPROOF capture double), creates Tristan/Bastian/Miguel invites via Present `POST /auth/invite`, then verify-accept → membership roles from Invite. **Does not** invent live MetaMask / family onboarding Done.

---

## 3. Soft live checklist

- [ ] Captured Bearer + `familyId` from Sign POC copy buttons (or documented Residual)
- [ ] Invited Tristan + Bastian `child` via `/auth/invite`
- [ ] Kids verify-accept → membership `child` (live Residual until evidence)
- [ ] Invited Miguel `parent` after kids
- [ ] Miguel verify-accept → membership `parent`
- [ ] Did **not** invent new invite route / second bootstrap for co-parent
- [ ] Did **not** claim family onboarding Done from unit alone
- [ ] Aware of **G8 Residual** — redeploy wipes in-memory invite/membership

Until live boxes checked with host evidence — label **Live Residual**.

---

## 4. Cross-links

| Doc | Role |
|-----|------|
| [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) | Steps 2–4 |
| [`CO-PARENT-MIGUEL-ENV-SCENARIO.md`](CO-PARENT-MIGUEL-ENV-SCENARIO.md) | Miguel order + honesty |
| [`MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md`](MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md) | G8 Residual |
| WPROOF-08/09 Sign POC | Copy Bearer · bootstrap assist · `familyId` |
