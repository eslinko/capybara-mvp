# Target tech-arch interview — 08 identity HTTP edge on host

**UTC:** `2026-11-21T14:42:22Z`  
**Profile:** `capybara` · focus `capybara/`  
**Slug:** `08-identity-http-edge-on-host`

## Inputs + use-case

| Input | Path |
|-------|------|
| REQ | [`../requirements/08-identity-http-edge-on-host.md`](../requirements/08-identity-http-edge-on-host.md) |
| Arch root | [`../architecture/08-identity-http-edge-on-host/00-overview.md`](../architecture/08-identity-http-edge-on-host/00-overview.md) |
| Story scope | **none** (0 STORY files) |

**Use case:** Target technical architecture for mounting Phase 2 identity HTTP edge + bootstrap + DualAuthGate→RoleGate on the existing Railway/`npm start` host — without NEW STORY/pkg/code in this run.

## Level classify

| Level | Evidence | Implication |
|-------|----------|-------------|
| Mixed functional+tech | REQ AC-I01…I07 + ops; silent HTTP layout / durability / keyMap | Arch package primary; REQ stays product-facing |

## Decision log

Operator standing order this session: **auto-accept recommendations** (UX convenience + elegance + architectural consistency); report each decision in chat; do not stop between questions.

| ID | Question (summary) | Options summary | Agent recommendation | Operator decision | Answer |
|----|--------------------|-----------------|----------------------|-------------------|--------|
| DP1 | Membership durability on Railway host | A in-memory MVP · B Supabase persist Phase 2 · C Volume/file | **A** | **accepted** (auto) | In-memory; redeploy → re-bootstrap residual in manual |
| DP2 | HTTP module layout | A grow health.js · B compose identity module · C Express | **B** | **accepted** (auto) | Compose identity sibling under `host/` |
| DP3 | URL namespace | A `/auth/*` + `/v1/capabilities` · B flat · C `/api/auth` | **A** | **accepted** (auto) | `/auth/*` + capability under `/v1/capabilities/…` |
| DP4 | Capability probe id | A `profile.self` · B `family.members_settings` · C `pool.balance` | **A** | **accepted** (auto) | `profile.self` |
| DP5 | Env keyMap | A SUPABASE_URL/SECRET_KEY + CAPY_BEARER_SECRET + pool/parent · B injectable forever · C CAPY_SUPABASE_* | **A** | **accepted** (auto) | Freeze A; optional SERVICE_ROLE alias |
| DP6 | Session wire | A Bearer · B Cookie · C both | **A** | **accepted** (auto) | `Authorization: Bearer` |
| DP7 | Bootstrap HTTP shape | A multi-step challenge/verify then bootstrap · B mega endpoint · C CLI only | **A** | **accepted** (auto) | Multi-step; env defaults for addresses |
| DP8 | Packaging | A reuse npm start / arch-07 · B new Docker stage | **A** | **accepted** (auto) | Packaging reuse; no new image contract |
| DP9 | Verify surfaces | A unit + live/POC · B unit only | **A** | **accepted** (auto) | Live required (AC-I06) |

## Open Unknowns

- U1: Exact `host/` filenames for identity module.  
- U2: Exact `/auth/…` path suffixes.  
- U3: Minimal probe JSON fields beyond membership/role echo.  
- U4: Bootstrap `familyId` required vs generated.

## Link matrix

| From | To |
|------|----|
| REQ-08 | Arch [`00-overview.md`](../architecture/08-identity-http-edge-on-host/00-overview.md) · this report |
| Arch 00 | REQ-08 · siblings 01–03 · arch-07 · arch-04 · REQ-09/10 pointers |
| This report | REQ-08 · arch 00 |

## Method notes

- Inputs (REQ and/or stories) ≠ target tech arch ≠ new work items.  
- Packaging: **reuse arch-07** — method note «Git ownership ≠ image packaging» already applied there; this package does not invent a second packaging pack.  
- Recommendation advisory; operator decides — this run: operator ordered auto-accept of recommendations (UX/elegance/consistency).
