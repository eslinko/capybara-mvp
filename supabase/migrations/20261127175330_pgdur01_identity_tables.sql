-- PGDUR-01 / AC-M01…M04 — identity tables (families · memberships · invites)
-- Field sources: packages/core/src/membership/MembershipStore.js · invite/InviteStore.js
-- Soft≠Live: SQL Present ≠ invent REQ-12 Done / Live Pass.
-- Target: existing Supabase Postgres project family (same as Auth / REQ-09) — not Mongo.
-- Forbidden: challenge / bearer / sign_token tables (AC-M03).

-- families ← MembershipStore family map: id, label?, poolAddress?, bootstrapped?
create table if not exists public.families (
  id text primary key,
  label text,
  pool_address text,
  bootstrapped boolean not null default false
);

comment on table public.families is
  'PGDUR-01: MembershipStore family (id, label?, poolAddress?, bootstrapped?)';

-- memberships ← id, familyId, role ∈ {parent,child}, address, userId?
create table if not exists public.memberships (
  id text primary key,
  family_id text not null references public.families (id),
  role text not null check (role in ('parent', 'child')),
  address text not null,
  user_id text,
  constraint memberships_address_unique unique (address)
);

comment on table public.memberships is
  'PGDUR-01: MembershipStore membership; address→one role globally (unique address)';

create index if not exists memberships_family_id_idx on public.memberships (family_id);
create index if not exists memberships_user_id_idx on public.memberships (user_id);

-- invites ← id, from, to, role, familyId, status ∈ {open,accepted}, displayName?, fromMembershipId?
create table if not exists public.invites (
  id text primary key,
  "from" text not null,
  "to" text not null,
  role text not null check (role in ('parent', 'child')),
  family_id text not null references public.families (id),
  status text not null check (status in ('open', 'accepted')),
  display_name text,
  from_membership_id text
);

comment on table public.invites is
  'PGDUR-01: InviteStore invite fields (from/to/role/familyId/status/displayName?/fromMembershipId?)';

create index if not exists invites_family_id_idx on public.invites (family_id);
create index if not exists invites_to_idx on public.invites ("to");
create index if not exists invites_status_idx on public.invites (status);
