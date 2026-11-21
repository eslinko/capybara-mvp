# Host entry and health

**Package:** [`00-overview.md`](./00-overview.md)  
**REQ:** [`../../requirements/07-railway-family-host.md`](../../requirements/07-railway-family-host.md) §2 Surface · AC-H01 · AC-H03 · §5 named `/health`  
**Interview:** DP1-B, DP2-A, DP3-A, DP4-A

## Thin host shell

| Decision | Lock |
|----------|------|
| Shape | Thin host shell: one process for Phase 1→2 |
| Stack | Node built-in `http` (no Express framework for Phase 1) |
| Start | Logical `npm run start` → host entry file (path TBD P1.3; name ≠ create) |
| Not start | `npm run cli`, `npm test`, hardhat |

## Health contract

| Item | Rule |
|------|------|
| Method / path | `GET /health` (REQ §5 named target) |
| Success | HTTP 200; body minimal e.g. `{ "ok": true }` |
| Secrets | Must not appear in response (AC-H02) |
| Deep checks | No Supabase/DB probe in Phase 1 (live auth OOS) |

## Phase 2 seam (boundary only)

Same process may later register auth-edge handlers (challenge / session) without a second production entry. Do **not** implement DualAuth in Phase 1 arch claim.

## Not in this doc

Inventing Express routes · wallet UI · stub host files on disk.
