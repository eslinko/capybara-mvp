# Membership + invite redeploy residual (G8 / EDGE-08)

**Profile:** `capybara` · **Story:** `STORY-SCR-CAPY-EDGE-08-membership-invite-survive-redeploy`  
**REQ:** [`../requirements/08-identity-http-edge-on-host.md`](../requirements/08-identity-http-edge-on-host.md) · soft REQ-05  
**Arch:** [`../architecture/08-identity-http-edge-on-host/03-env-verify-coexistence-residual.md`](../architecture/08-identity-http-edge-on-host/03-env-verify-coexistence-residual.md)  
**Code:** [`../../host/authHttp.js`](../../host/authHttp.js) `createAuthRuntime` · InviteStore · MembershipStore

> **Disposition (EDGE-08 P3):** Durability of membership + invite across Railway redeploy = **Absent / Residual continued**.  
> Do **not** invent Phase 3 DDL / durable store Done. Do **not** invent live multi-step onboarding Pass across redeploys.  
> `npm test` / docs alone ≠ durability Done (AC-G8-04).

---

## 1. As-is (claims from code)

| Store | Host mount | Survive redeploy? |
|-------|------------|-------------------|
| `MembershipStore` | `createAuthRuntime` default `new MembershipStore()` | **No** — process memory |
| `InviteStore` | same runtime (INV-04) | **No** — process memory |
| `BearerSessionStore` | same runtime | **No** — process / TTL ephemeral (allowed) |
| `SignTokenStore` | Sign host path (`signTokenStore.js`) | **No** — in-memory + TTL (allowed) |

After restart: family memberships wiped → re-bootstrap required; open invites wiped → re-createInvite; Bearer/Sign tokens invalid.

---

## 2. Durability requirement (AC-G8-01 / AC-G8-02) — Residual

| AC | Target | Present state |
|----|--------|---------------|
| AC-G8-01 | After redeploy, prior memberships resolvable for DualAuth/RoleGate | **Absent** — Residual |
| AC-G8-02 | Open invites accept-able after redeploy | **Absent** — Residual |

**Store choice / schema:** OOS this wave — Phase 3 journals ROADMAP may consume. No invent DDL here.

---

## 3. Session / SignToken carve-out (AC-G8-03)

Bearer sessions and SignTokens **may** remain TTL/ephemeral. That is **not** a defect relative to membership+invite durability AC. Document honesty: losing session/token on redeploy ≠ invent membership durable.

---

## 4. Operator warn — mid-run redeploy (AC-G8-03)

While durability Absent:

1. Do **not** start a multi-step family onboarding live Pass expecting membership/invite to survive Railway redeploy.  
2. If redeploy happens mid-scenario → treat family state as wiped → re-bootstrap + re-invite (INV-04) + re-Sign (INV-05).  
3. Label evidence **Residual** — forbid invent Pass.  
4. Scenario: [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) · IDENTITY §4.

---

## 5. Post-redeploy verify criterion (AC-G8-01/02/04) — Residual gate

**When durability Present (future):**

1. Bootstrap + create open invite + (optional) accept one membership.  
2. Restart host process / Railway redeploy.  
3. DualAuth/RoleGate resolves **same** prior membership without re-bootstrap invent.  
4. Open invite still accept-able via verify (INV-05) until accepted/expired.  
5. Record evidence under `docs/manuals/evidence/` — then AC-G8-01/02 may Pass.

**This wave:** criterion documented; exercise **not** claimed · durability Absent · **Residual continued**. Unit green ≠ step 3–4 Pass.

---

## 6. Cross-links

| Doc | Role |
|-----|------|
| [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) §4 | Redeploy residual |
| [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) | G8 warn |
| Gap G8 | [`../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md`](../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md) |
