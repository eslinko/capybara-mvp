# Target tech-arch interview — 09-live-supabase-auth-port

**UTC:** `2026-11-24T13:17:11Z`  
**Profile:** `capybara` · focus `capybara/`  
**Slug:** `09-live-supabase-auth-port`  
**Method:** Architect Studio · analysis.mdc · recommendation advisory; operator delegated auto-accept of recommendations (UX / elegance / architectural consistency)

## Inputs + use-case

| Input | Path |
|-------|------|
| REQ | [`../requirements/09-live-supabase-auth-port.md`](../requirements/09-live-supabase-auth-port.md) |
| Story scope | **none** (0 STORY files as focus) |
| Related cite | AUTH-02 Done (modules/double); REQ-10 Accepted (consumer) |
| Arch root | [`../architecture/09-live-supabase-auth-port/00-overview.md`](../architecture/09-live-supabase-auth-port/00-overview.md) |

**Use case:** Target how production host after address proof create/links a real Supabase Auth user instead of residual throw — closing dual-auth L2 for Phase 2.

## Level classify

| Level | Evidence | Implication |
|-------|----------|-------------|
| Mixed functional+tech (+ deployability) | REQ AC-S01…S05; host still memory-default; need supabase-js in image | Architect Studio primary; packaging pack mandatory |

## Verbatim decision log

### Q1 — Bind identity in Supabase Auth

- **Question:** How create/link Auth user from proven Ethereum address (no email in REQ)?  
- **Options summary:** A synthetic email + Admin createUser/link · B metadata-only list/filter · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated auto-accept)  
- **Answer:** A

### Q2 — Host live vs memory

- **Question:** When does production host use live port?  
- **Options summary:** A config Present → live; no silent memory · B explicit CAPY_AUTH_PORT=live · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q3 — Synthetic email form

- **Question:** Fixed template vs env domain?  
- **Options summary:** A `{normalizeAddress}@capybara.local` · B env domain · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q4 — Idempotent link

- **Question:** create then resolve on duplicate vs always list?  
- **Options summary:** A createUser + on exists resolve · B always list · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q5 — Packaging

- **Question:** Where does `@supabase/supabase-js` live?  
- **Options summary:** A in `@capybara/core` + Dockerfile workspace · B separate package · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q6 — Env names

- **Question:** New keys vs existing host keyMap?  
- **Options summary:** A `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (+ alias) / `CAPY_BEARER_SECRET` · B new names · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q7 — Verify / deploy residual

- **Question:** What proves REQ-09 Done?  
- **Options summary:** A unit=memory; live Railway verify+bind · B unit mock enough · C Other  
- **Agent recommendation:** A  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** A

### Q8 — OOS / privacy

- **Question:** Close F1/F12 per REQ?  
- **Options summary:** Keep REQ §3 OOS; secrets server-side; address in metadata only  
- **Agent recommendation:** Accept REQ OOS + AC-S04 reinforce  
- **Operator decision:** **accepted** (delegated)  
- **Answer:** per REQ

## Open Unknowns

1. Which Supabase project is Capybara prod (ops).  
2. Exact SDK duplicate-user error shape at implement.  
3. Future email-domain env override — out of MVP.

## Link matrix

| From | To |
|------|----|
| REQ-09 | Arch `00-overview` + this report |
| Arch root | REQ-09 · AUTH-02 cite · REQ-08/10/04/07 · as-is paths |
| Siblings | 01 port · 02 host/env · 03 packaging/verify |

## Method notes

- Inputs (REQ and/or stories) ≠ target tech arch ≠ new work items.  
- Git ownership ≠ image packaging — **packaging pack applied**.  
- Recommendation advisory; operator decides — here operator **delegated** auto-accept of recommendations for UX/elegance/consistency.  
- Packaging N/A? **No** — decided (supabase-js in core + image).
