# Packaging and ownership

**Package:** [`00-overview.md`](./00-overview.md)  
**REQ:** [`../../requirements/07-railway-family-host.md`](../../requirements/07-railway-family-host.md) §2 Packaging · AC-H03 · AC-H04 · AC-H06  
**Interview:** DP5, DP6-C  
**Method:** Git ownership ≠ image packaging

## Ownership matrix

| Artifact class | Owner |
|----------------|--------|
| Source (host entry, `packages/core`, CLI) | Git |
| Runtime image | Railway build from Git |
| Secrets / `PORT` | Railway env (external) — not Git |
| Session / membership rows | Not in image; Phase 1 no session store required |
| Supabase project | External — Phase 2 |

## Packaging (decided)

| Piece | Role |
|-------|------|
| Dockerfile | Explicit image: install runtime deps; `CMD`/`ENTRYPOINT` = production start; exclude treating mocha/hardhat green as host Done |
| Thin railway config | Optional committed `railway.toml` (U3) or dashboard equivalent — wire start + port |
| Nixpacks-only | Rejected as sole strategy (less honest image boundary) |

Image carries **host entry + runtime deps**, not «unit-test tree as production proof».

## Topology

One Railway **project** named Capybara + **one** host **service** (AC-H06). Per-family multi-service = later note (arch-04), not Phase 1 AC invent.

## Not in this doc

Writing Dockerfile body on disk · Railway MCP create-project.
