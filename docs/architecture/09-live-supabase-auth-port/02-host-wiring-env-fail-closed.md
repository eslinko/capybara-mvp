# 02 — Host wiring, env keyMap, fail-closed

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-24T13:17:11Z`

## Problem (as-is)

[`createAuthRuntime`](../../../host/authHttp.js) loads auth env classes but defaults:

`authPort: opts.authPort || createMemorySupabaseAuthDouble()`

So even with Railway `SUPABASE_*` Present, verify binds against **memory** — silent fallback relative to AC-S01/S03 intent.

## Target selection rule (interview lock A)

| Condition | `authPort` |
|-----------|------------|
| `opts.authPort` injected | Use inject (unit tests) |
| Explicit residual/local override labeled for operator (if implemented) | Memory **only** when clearly residual — not default prod |
| `loadHostAuthEnvConfig` succeeds (all classes set) | **`createLiveSupabaseAuthPort(config)`** — `residual: false` |
| Config missing / invalid | `configError` → identity routes fail-closed (existing `requireRuntimeConfig`); do **not** pretend live bind succeeded |

**Forbidden:** config Present + default memory without inject (silent memory fallback).

## Env keyMap (interview lock A — names locked)

Reuse host production map already Present:

| Class | Env key |
|-------|---------|
| `supabaseUrl` | `SUPABASE_URL` |
| `supabaseKey` | `SUPABASE_SECRET_KEY` (alias `SUPABASE_SERVICE_ROLE_KEY` via `withSupabaseKeyAlias`) |
| `bearerSecret` | `CAPY_BEARER_SECRET` |

Live port uses **service role / secret key** for Admin Auth API. Bearer secret remains session HMAC material (unchanged).

No new env names for MVP synthetic email domain (fixed `@capybara.local` in [`01-…`](./01-port-contract-and-bind.md)).

## Fail-closed / health

- Missing class → refuse bind/session (AC-S03).  
- Live Admin API failure → `EAUTH_BIND_FAILED` (no swap to memory).  
- `/health` unchanged — no secrets (AC-S04).  
- Auth error bodies must not echo keys.

## HTTP surface

Unchanged REQ-08 routes. This REQ only changes **port wiring behind** `/auth/verify` (and bootstrap paths that call bind).
