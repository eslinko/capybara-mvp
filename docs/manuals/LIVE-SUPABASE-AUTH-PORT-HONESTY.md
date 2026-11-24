# Live Supabase Auth port — honesty & live proof (AC-S05)

**Profile:** `capybara` · **REQ:** [`../requirements/09-live-supabase-auth-port.md`](../requirements/09-live-supabase-auth-port.md)  
**Architecture:** [`../architecture/09-live-supabase-auth-port/03-packaging-verify-deploy-residual.md`](../architecture/09-live-supabase-auth-port/03-packaging-verify-deploy-residual.md)  
**Stories:** SBPORT-01…04 · **Consume:** `POST /auth/verify` on host ([`../../host/authHttp.js`](../../host/authHttp.js))  
**Related:** [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) · [`WALLET-ADDRESS-PROOF-OPERATOR.md`](WALLET-ADDRESS-PROOF-OPERATOR.md)

This is the **AC-S05 operator surface**: how to prove (or honestly residual) live Supabase Auth bind after address proof. Docs alone ≠ REQ-09 Accepted / Phase 2 Done.

---

## 1. Honesty lock (AC-S05)

| Rule | Meaning |
|------|---------|
| Unit / `npm test` | Green alone ≠ REQ-09 Done · ≠ Phase 2 Supabase Done |
| Memory double | Remains for unit inject (`opts.authPort`) — not production claim |
| Live Pass | Only Railway + **real** Supabase project + REQ-10 Sign → verify → **real** Auth `userId` |
| Residual | No Supabase project / no live bind evidence → label Residual · **not Accepted** |
| Forbidden | Invent live PASS from unit green or from this manual alone |

**Current operator status (SBPORT-04 close):** live Supabase Auth bind evidence = **Residual / Absent** — see [`evidence/live-supabase-auth-bind-residual.md`](evidence/live-supabase-auth-bind-residual.md). Do **not** invent Pass.

---

## 2. Operator live checklist (executable when project Present)

Prerequisites (code Present — SBPORT-01…03):

- Live factory `createLiveSupabaseAuthPort` Present  
- Host `resolveAuthPort`: config Present → live (no silent memory)  
- `@supabase/supabase-js` in `@capybara/core` + Dockerfile workspace install  

### 2.1 Env (Railway / platform — never bake into image)

| Env | Role |
|-----|------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SECRET_KEY` | Server secret (alias `SUPABASE_SERVICE_ROLE_KEY` ok) |
| `CAPY_BEARER_SECRET` | Bearer signing |
| `PORT` | Host listen |

Also wallet/bootstrap fields per [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) §2 when exercising bootstrap.

### 2.2 Steps

1. Confirm Railway host `GET /health` → `{ "ok": true }` (no secrets).  
2. Complete REQ-10 address proof (Channel A or B) against the **same** host — see [`WALLET-ADDRESS-PROOF-OPERATOR.md`](WALLET-ADDRESS-PROOF-OPERATOR.md).  
3. `POST /auth/verify` with valid signed proof (session path in IDENTITY §3.1).  
4. Confirm bind result returns a **real** Supabase Auth `userId` (not memory-only / not residual throw).  
5. Record evidence under `docs/manuals/evidence/` with UTC + host URL + honesty: Pass **or** Residual.

### 2.3 Pass vs Residual

| Outcome | Claim |
|---------|-------|
| Real `userId` on live Supabase after Sign→verify | Live proof **Pass** (still: docs alone ≠ invent Phase 2 Done elsewhere) |
| No project / bind fails / not exercised | **Residual** — fill residual template · **not Accepted** |

---

## 3. Honesty residual template (no Supabase project / bind Absent)

Copy into evidence when live bind is not exercised:

```markdown
# Live Supabase Auth bind — Residual

- **Date (UTC):** <print-utc-now>
- **Host:** <Railway URL or local>
- **Supabase project:** Absent | not configured | not exercised
- **REQ-10 Sign:** Present (cite evidence) | Absent
- **`POST /auth/verify` live bind:** Absent / Residual
- **Honesty:** Residual ≠ Accepted · `npm test` green ≠ REQ-09 Done (AC-S05)
- **Next:** configure project + re-run §2 checklist · or keep Residual labeled
```

Canonical filled residual for this wave: [`evidence/live-supabase-auth-bind-residual.md`](evidence/live-supabase-auth-bind-residual.md).

---

## 4. Cross-links

| Doc | Role |
|-----|------|
| [`../requirements/09-live-supabase-auth-port.md`](../requirements/09-live-supabase-auth-port.md) | REQ-09 · AC-S05 |
| [`IDENTITY-HTTP-EDGE-MANUAL.md`](IDENTITY-HTTP-EDGE-MANUAL.md) | Edge routes · env · verify curl |
| [`WALLET-ADDRESS-PROOF-OPERATOR.md`](WALLET-ADDRESS-PROOF-OPERATOR.md) | REQ-10 Sign channels |
| Arch [`03-packaging-verify-deploy-residual.md`](../architecture/09-live-supabase-auth-port/03-packaging-verify-deploy-residual.md) | Deploy residual / verify surfaces |
