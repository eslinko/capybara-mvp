# Auth user retest clean — operator checklist (G1 / EDGE-07)

**Profile:** `capybara` · **Story:** `STORY-SCR-CAPY-EDGE-07-auth-user-retest-clean`  
**Consume:** [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) **Step 0** · REQ-09 Admin · soft prior SBPORT-05  
**Honesty pattern:** [`LIVE-SUPABASE-AUTH-PORT-HONESTY.md`](LIVE-SUPABASE-AUTH-PORT-HONESTY.md) · AC-I06 (docs/unit ≠ Done)

> **Lock:** Clean Auth **before** Step 1 founder path. Do **not** invent live delete PASS from this manual alone. Do **not** claim REQ-08 / Phase 2 Done.

---

## 1. Why

Retest family onboarding with leftover Auth rows for the same wallet/synthetic email produces false failures and dishonest “already exists” paths. Operator must delete prior test Auth user(s) for the known address first.

---

## 2. Target identity

| Field | Value |
|-------|--------|
| Address | Known retest wallet (typically `PARENT_ADDRESS` / founder) |
| Synthetic email | `{normalizeAddress(address)}@capybara.local` (lowercase hex + `@capybara.local`) |
| Metadata | `user_metadata.address` / `app_metadata.address` = same hex |
| Example (SBPORT-05 Pass evidence — **not** auto-deleted) | `0xbd9a51792c36d21dc203320d7055ed8e305e41ef@capybara.local` — see [`evidence/live-supabase-auth-bind-result.md`](evidence/live-supabase-auth-bind-result.md) |

---

## 3. Operator clean checklist (Admin)

Prerequisites: live Supabase project Present (REQ-09 Accepted · SBPORT-05). If project Absent → fill Residual evidence · stop before founder Sign.

1. Open Supabase **Auth → Users** (or Admin API `listUsers`) for project host recorded in evidence.  
2. Find user by synthetic email `{normalizeAddress}@capybara.local` **or** by metadata `address`.  
3. **Delete** that Auth user (Admin UI or Admin `deleteUser`).  
4. Re-list Auth users — confirm **no** row for that email / address metadata.  
5. Record evidence under `docs/manuals/evidence/`:
   - **Pass** — UTC + project host + target email/address + “absence verified”  
   - **Residual** — UTC + host + reason (not exercised / project unavailable) · **≠ invent Pass**

### 3.1 After clean — before Step 1

Only when absence is verified (or Residual explicitly labeled and operator accepts skip): proceed to scenario **Step 1** founder path.

---

## 4. Verify absence (AC-G1-02)

| Check | Pass condition |
|-------|----------------|
| Auth list | No user with email `{normalizeAddress}@capybara.local` |
| Metadata | No user with `address` = target hex |
| Honesty | Screenshot/API note in evidence · or Residual labeled |

**Forbidden:** claim absence from docs alone without Admin list/delete exercise.

---

## 5. Honesty (AC-G1-03 / AC-I06)

| Claim | Allowed? |
|-------|----------|
| Checklist Present | Yes |
| Live delete Pass | Only with Admin evidence this session |
| Residual (not exercised) | Yes — label Residual |
| REQ-08 live ACL Done | **No** |
| Phase 2 Done | **No** |
| Unit / `npm test` green = clean Done | **No** |

---

## 6. Evidence templates

### Pass (copy when Admin delete + absence verified)

```markdown
# Auth user retest clean — Pass

- **Date (UTC):** <print-utc-now>
- **Host:** <Railway URL>
- **Supabase project:** <project ref / host>
- **Target address:** <0x…>
- **Target email:** <normalizeAddress>@capybara.local
- **Admin delete:** PASS
- **Absence verified (re-list):** PASS
- **Honesty:** Clean ≠ REQ-08 Done · ≠ Phase 2 Done
```

### Residual (copy when not exercised)

```markdown
# Auth user retest clean — Residual

- **Date (UTC):** <print-utc-now>
- **Host:** <Railway URL or n/a>
- **Supabase project:** Present | Absent | not exercised this session
- **Admin delete:** Residual / not exercised
- **Absence verified:** Residual
- **Honesty:** Residual ≠ invent Pass · checklist Present ≠ live clean Done · ≠ REQ-08 / Phase 2 Done
- **Next:** run §3 checklist against live project before founder retest
```

Canonical residual this wave: [`evidence/auth-user-retest-clean-residual.md`](evidence/auth-user-retest-clean-residual.md).

---

## 7. Cross-links

| Doc | Role |
|-----|------|
| [`FAMILY-ONBOARDING-OPERATOR-SCENARIO.md`](FAMILY-ONBOARDING-OPERATOR-SCENARIO.md) | Step 0 consume |
| [`LIVE-SUPABASE-AUTH-PORT-HONESTY.md`](LIVE-SUPABASE-AUTH-PORT-HONESTY.md) | AC-S05 / AC-I06 pattern |
| [`evidence/live-supabase-auth-bind-result.md`](evidence/live-supabase-auth-bind-result.md) | Prior bind Pass (user may still exist until clean) |
| Gap G1 | [`../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md`](../analysis/gap-family-onboarding-http-invite-sign-2026-11-25.md) |
