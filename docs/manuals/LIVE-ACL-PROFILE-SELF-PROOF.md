# Live ACL `profile.self` proof (G9 / EDGE-09)

**Profile:** `capybara` · **Story:** `STORY-SCR-CAPY-EDGE-09-live-acl-profile-self-proof`  
**REQ:** [`../requirements/08-identity-http-edge-on-host.md`](../requirements/08-identity-http-edge-on-host.md) AC-I01/I02/I06  
**Arch:** [`../architecture/08-identity-http-edge-on-host/02-bootstrap-session-and-capability-probe.md`](../architecture/08-identity-http-edge-on-host/02-bootstrap-session-and-capability-probe.md)  
**Probe:** [`../../host/capabilityProbe.js`](../../host/capabilityProbe.js) · DualAuthGate → CatalogAlias → RoleGate

> **Honesty:** Record Pass **or** Residual under `evidence/`. `npm test` / unit alone ≠ REQ-08 Accepted / Phase 2 Done (AC-I06). Do **not** invent founder/cast Pass.

---

## 1. Unit as-is (not live Done)

| Surface | State |
|---------|--------|
| `/v1/capabilities/profile.self` compose | Present (EDGE-03) |
| Unauth deny (unit) | Present |
| Authed membership allow (unit) | Present |
| Live Railway evidence | See §2–§4 |

---

## 2. Live unauth deny (AC-G9-01 / AC-I01)

```bash
BASE=https://capybara-mvp.up.railway.app   # or HOST-03 service URL
curl -sS -i "$BASE/health"
curl -sS -i "$BASE/v1/capabilities/profile.self"
# expect: HTTP 401 · DualAuth deny (e.g. EAUTH_SESSION_MISSING / EAUTH_DUAL_DENY)
```

Evidence: [`evidence/live-acl-profile-self-unauth-deny-result.md`](evidence/live-acl-profile-self-unauth-deny-result.md) (Pass when recorded).

---

## 3. Live founder allow (AC-G9-02 / AC-I02)

Prerequisites: soft EDGE-07 clean (or Residual) · AUTH-05 dual Sign → one bootstrap · Bearer session · soft EDGE-08 (re-bootstrap after redeploy).

```bash
# After bootstrap + Bearer TOKEN:
curl -sS -i "$BASE/v1/capabilities/profile.self" \
  -H "Authorization: Bearer $TOKEN"
# expect: allow subject to parent RoleGate / CatalogAlias
```

If not exercised → Residual template: [`evidence/live-acl-profile-self-residual.md`](evidence/live-acl-profile-self-residual.md). **Do not invent Pass.**

---

## 4. Optional cast roles (AC-G9-03)

When Tristan/Bastian/Miguel memberships Present: probe each Bearer — allow/deny per catalog.  
If cast Absent / live Pass Absent → honesty skip Residual — no invent.

---

## 5. AC-I06 + REQ-08

| Claim | Rule |
|-------|------|
| npm test green | ≠ REQ-08 Accepted · ≠ Phase 2 Done |
| Unauth live Pass alone | ≠ invent full G9 founder Done · ≠ invent REQ-08 Accepted |
| REQ-08 Accepted | Product OP only with Pass evidence set |

---

## 6. Cross-links

| Doc | Role |
|-----|------|
| [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) Step 6 | Scenario ACL |
| [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) §5 | Remote identity residual |
| Gap G9 | [`../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md`](../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md) |
