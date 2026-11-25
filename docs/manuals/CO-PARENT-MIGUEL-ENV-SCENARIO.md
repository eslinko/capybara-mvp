# Co-parent Miguel — env + scenario soft checklist (G6 / INV-06)

**Profile:** `capybara` · **Story:** `STORY-SCR-CAPY-INV-06-coparent-miguel-env-scenario`  
**REQ:** [`../requirements/05-family-membership-parent-adds-child.md`](../requirements/05-family-membership-parent-adds-child.md) AC-M04 · soft [`../requirements/03-family-roles-and-capability-matrix.md`](../requirements/03-family-roles-and-capability-matrix.md)  
**Consume:** [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) Step 4 · INV-04 create · INV-05 accept

> **Lock:** Co-parent = same address-first invite with `role=parent` **after** kids. Ops env names Miguel address — **no** private key in `.env.example`. **No** second bootstrap for co-parent.  
> **Honesty:** Docs/unit alone ≠ invent live MetaMask / Railway Pass · ≠ family onboarding Done.

---

## 1. Env (AC-G6-02)

| Key | Rule |
|-----|------|
| `MIGUEL_ADDRESS` | Present in `capybara/.env.example` — placeholder public address |
| `MIGUEL_PRIVATE_KEY` | **Absent** from `.env.example` — Sign via MetaMask only |
| Cast | Scenario §0 Target cast points at `MIGUEL_ADDRESS` |

---

## 2. Order lock (AC-G6-01)

1. Complete Step 2–3 for Tristan/Bastian (or accept labeled Residual for live).  
2. Founder Bearer: `POST /auth/invite` `{ to: MIGUEL_ADDRESS, role: "parent", familyId }` — same path as kids (INV-04 / AC-M04).  
3. Mint Sign URL → Miguel types/pastes `MIGUEL_ADDRESS` → Connect & Sign (WPROOF-07).  
4. `POST /auth/verify` → open Invite → `bindInviteeAndAccept` (INV-05) → membership `role=parent`.

---

## 3. Equal parent · no second bootstrap (AC-G6-03 / AC-G6-04)

| Claim | Evidence (unit / contract) | Live |
|-------|---------------------------|------|
| After accept, membership role from Invite = `parent` | `tests/unit/host-verify-bind-invite.test.js` AC-G4-05 co-parent · `invite-bind-invitee.test.js` co-parent | **Residual** until operator Pass |
| Equal parent family capabilities (REQ-03 catalog) | RoleGate parent actor after accept (same as founder role id) | **Residual** |
| No second `POST /auth/bootstrap` for co-parent | Consume invite+verify only; bootstrap remains AUTH founder dual-proof | Contract Present — do not invent co-parent bootstrap route |

---

## 4. Soft live checklist (operator)

When recording live evidence under `docs/manuals/evidence/`:

- [ ] Kids invites accepted first (order lock)
- [ ] `MIGUEL_ADDRESS` set in local `.env` (not committed secrets)
- [ ] `POST /auth/invite` → open invite `role=parent`
- [ ] Sign + verify → Auth `userId` + membership `parent` + Invite accepted
- [ ] Capability probe as co-parent behaves per parent catalog (EDGE-09 live still G9)
- [ ] Did **not** call bootstrap for Miguel

Until boxes checked with real host evidence — label **Live Residual**. Do not invent Pass.

---

## 5. Cross-links

| Doc | Role |
|-----|------|
| [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) | Step 4 |
| [`FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md`](FOUNDER-FIRST-DUAL-SIGN-BOOTSTRAP.md) | Bootstrap stays founder-only path |
| Gap G6 | [`../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md`](../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md) |
