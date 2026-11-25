# Live ACL `profile.self` — unauth deny Pass (EDGE-09 / G9 · AC-G9-01)

- **Date (UTC):** `2026-11-25T15:51:31Z` (P3 session; curl with network)
- **Story:** `STORY-SCR-CAPY-EDGE-09-live-acl-profile-self-proof`
- **Host:** `https://capybara-mvp.up.railway.app`
- **Health:** HTTP **200** `{"ok":true}` (body not required for ACL claim)
- **Unauth probe:** `GET /v1/capabilities/profile.self` (no `Authorization`)
- **Result:** HTTP **401**
- **Body (recorded):** `{"ok":false,"error":"EAUTH_DUAL_DENY","message":"DualAuthGate deny: EAUTH_SESSION_MISSING"}`

## Honesty

| Claim | State |
|-------|-------|
| AC-G9-01 live unauth deny | **PASS** |
| AC-G9-02 founder allow | **not** this file — see residual |
| REQ-08 Accepted / Phase 2 Done | **Not** claimed |
| npm test alone = ACL Done | **No** (AC-I06) |

## Command (reproducible)

```bash
BASE=https://capybara-mvp.up.railway.app
curl -sS -i "$BASE/v1/capabilities/profile.self"
```
