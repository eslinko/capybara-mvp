# Capybara Supabase migrations (PGDUR)

**REQ:** [`docs/requirements/12-postgres-family-identity-and-journals.md`](../docs/requirements/12-postgres-family-identity-and-journals.md)  
**Arch:** [`docs/architecture/12-postgres-family-identity-and-journals/`](../docs/architecture/12-postgres-family-identity-and-journals/)  
**Story:** PGDUR-01 — Git-owned SQL under `migrations/`.

## Soft≠Live

- Migrations in Git ≠ invent **REQ-12 Done** / Phase 3 Done / **Live Pass**.
- `npm test` / docs alone ≠ durability Done (AC-M05 · AC-P08).
- Apply to the **existing** Supabase project family used for Auth (REQ-09) — **do not** invent a new project.

## Apply seam (existing Auth project)

1. Confirm `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) point at the **same** project as live Auth.
2. Apply files in `migrations/` via your operator Supabase workflow (CLI `db push` / SQL editor / linked project) — order by filename timestamp.
3. Do **not** create a second Supabase project for MVP journals/identity.

## Locked tables (PGDUR-01)

`families` · `memberships` · `invites` · `verified_address_proofs` · `activity_journal_entries` · `advance_journal_entries` · `debt_journal_entries`

**Not created:** pending-challenge · bearer · sign_token (ephemeral — AC-M03).
