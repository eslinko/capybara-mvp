-- PGDUR-01 / AC-M01…M04 — verified_address_proofs + journal tables + mode
-- Proof source: packages/core/src/auth/verifyAddressProof.js AddressProof
--   { address, challengeId, verifiedAt, verifiedAtMs } (+ server id; familyId optional — arch-12/02)
-- Journals: NDJSON event payloads (daily-payments / advance / debt writers) + mode ∈ {mock,gfl_reality}
-- Soft≠Live: SQL Present ≠ invent REQ-12 Done / Live Pass / PGDUR-04 writers.
-- Forbidden: challenge / bearer / sign_token tables (AC-M03).

-- verified_address_proofs ← AddressProof (+ optional family_id)
create table if not exists public.verified_address_proofs (
  id text primary key,
  address text not null,
  challenge_id text not null,
  verified_at timestamptz not null,
  verified_at_ms bigint not null,
  family_id text references public.families (id)
);

comment on table public.verified_address_proofs is
  'PGDUR-01: verified AddressProof only (address, challengeId, verifiedAt, verifiedAtMs); family_id optional';

create index if not exists verified_address_proofs_address_idx
  on public.verified_address_proofs (address);
create index if not exists verified_address_proofs_challenge_id_idx
  on public.verified_address_proofs (challenge_id);

-- Journal tables: mode + full NDJSON event payload (arch-12/02 — existing event payloads)
-- id = event_id from payload when Present (advance/debt) or caller-supplied durable id.

create table if not exists public.activity_journal_entries (
  id text primary key,
  mode text not null check (mode in ('mock', 'gfl_reality')),
  payload jsonb not null
);

comment on table public.activity_journal_entries is
  'PGDUR-01: activity journal; mode mock|gfl_reality; payload = NDJSON typed ledger entry object';

create index if not exists activity_journal_entries_mode_idx
  on public.activity_journal_entries (mode);

create table if not exists public.advance_journal_entries (
  id text primary key,
  mode text not null check (mode in ('mock', 'gfl_reality')),
  payload jsonb not null
);

comment on table public.advance_journal_entries is
  'PGDUR-01: advance journal; mode mock|gfl_reality; payload = advanceWriter event object';

create index if not exists advance_journal_entries_mode_idx
  on public.advance_journal_entries (mode);

create table if not exists public.debt_journal_entries (
  id text primary key,
  mode text not null check (mode in ('mock', 'gfl_reality')),
  payload jsonb not null
);

comment on table public.debt_journal_entries is
  'PGDUR-01: debt journal; mode mock|gfl_reality; payload = debtWriter event object';

create index if not exists debt_journal_entries_mode_idx
  on public.debt_journal_entries (mode);
