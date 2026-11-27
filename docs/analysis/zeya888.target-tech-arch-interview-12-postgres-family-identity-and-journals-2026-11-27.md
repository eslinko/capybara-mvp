# Target tech-arch interview — 12-postgres-family-identity-and-journals

**UTC:** `2026-11-27T17:23:20Z`  
**Profile:** `capybara` · focus `capybara/`  
**Slug:** `12-postgres-family-identity-and-journals`  
**Method:** Architect Studio · analysis.mdc · recommendation advisory; operator delegated auto-accept of recommendations (UX / elegance / architectural consistency) · Q1 recommendation checked against that criterion (matched)

## Inputs + use-case

| Input | Path |
|-------|------|
| REQ | [`../requirements/12-postgres-family-identity-and-journals.md`](../requirements/12-postgres-family-identity-and-journals.md) |
| Story scope | **none** (0 STORY files as focus) |
| Arch root | [`../architecture/12-postgres-family-identity-and-journals/00-overview.md`](../architecture/12-postgres-family-identity-and-journals/00-overview.md) |
| Residual | [`../manuals/MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md`](../manuals/MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md) |

**Use case:** Target how Railway host + CLI make Supabase Postgres the durable SoT for family/membership/invite, verified AddressProof audit, and activity/advance/debt journals — closing EDGE-08 redeploy Residual and Phase 3 persistence without NEW STORY in this run.

## Level classify

| Level | Evidence | Implication |
|-------|----------|-------------|
| Mixed functional+tech (+ deployability) | REQ §1–2 Postgres primary; AC-P01…P08; §6 adapters/migrations as targets; host packaging | Architect Studio primary; packaging pack mandatory |

## Verbatim decision log

### Q1 — Postgres client seam

- **Question:** How does production talk to Supabase Postgres (Auth already uses supabase-js)?  
- **Options analytics summary:** A supabase-js service `.from`/RPC (same URL+key) · B direct `pg` + DATABASE_URL · C Other  
- **Agent recommendation:** A (UX one project/SDK; arch-09 consistency)  
- **Criterion check:** recommendation **matched** UX/elegance/consistency  
- **Operator decision:** **accepted** (delegated auto-accept)  
- **Answer:** A

### Q2 — Store replacement pattern

- **Question:** How replace RAM Membership/Invite on host?  
- **Options analytics summary:** A same method surface + inject in `createAuthRuntime` · B new ports rewrite call sites · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q3 — Logical table shape

- **Question:** Entity tables vs one JSON blob?  
- **Options analytics summary:** A separate family/membership/invite/proof/journal entities · B single document store · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q4 — Proof ↔ family linkage

- **Question:** Is `familyId` required on verified proof?  
- **Options analytics summary:** A optional/null until membership known · B always required · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q5 — Journal writers

- **Question:** Who writes journals to Postgres?  
- **Options analytics summary:** A core writer seam (CLI + future host) → Postgres primary · B host-only; CLI stays NDJSON · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q6 — Existing NDJSON history

- **Question:** Mandatory import before Accept?  
- **Options analytics summary:** A no; new writes Postgres; files archive residual · B mandatory one-shot import · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q7 — Env keys

- **Question:** New DATABASE_URL vs reuse Auth keyMap?  
- **Options analytics summary:** A reuse SUPABASE_URL + SUPABASE_SECRET_KEY (+ alias) · B require DATABASE_URL · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q8 — Packaging / deps

- **Question:** New DB driver in image?  
- **Options analytics summary:** A no; supabase-js already in core · B add `pg` · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q9 — Runtime topology

- **Question:** Same host vs journal worker?  
- **Options analytics summary:** A same Railway `npm start` + shared writers · B separate worker · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q10 — DDL ownership

- **Question:** Git migrations vs Dashboard-only?  
- **Options analytics summary:** A Git-owned migrations (path TBD implement) · B Dashboard-only · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q11 — Verify / Done gate

- **Question:** What proves durability Done?  
- **Options analytics summary:** A unit doubles + live redeploy membership/invite + journal primary read · B unit only · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q12 — Privacy / secrets

- **Question:** Proof/secret exposure rules for this focus?  
- **Options analytics summary:** A server-side only; no health dump; service role not to client · B invent retention policy now · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Skipped themes

- **F1** — closed by REQ §1/§3/§4 (FR-P01…P05, OOS).  
- **F11** — observability beyond AC-P09 OOS.

## Open Unknowns

1. Exact Git migration path string.  
2. RLS / grants detail.  
3. Optional later NDJSON import (not Accept gate).  
4. Exact SQL identifiers beyond logical entities.

## Link matrix

| From | To |
|------|----|
| REQ-12 | Arch [`../architecture/12-postgres-family-identity-and-journals/00-overview.md`](../architecture/12-postgres-family-identity-and-journals/00-overview.md) · this report |
| Arch root | REQ-12 · this report · siblings 01–04 |
| Stories | none in this run |

## Method notes

- inputs (REQ and/or stories) ≠ target tech arch ≠ new work items  
- Git ownership ≠ image packaging — **packaging pack applied** (reuse `@supabase/supabase-js`; no new driver)  
- recommendation advisory; operator decides — here: **delegated auto-accept** with dialog reporting; Q1 criterion match verified  
