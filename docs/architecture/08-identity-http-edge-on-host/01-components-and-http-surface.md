# Components and HTTP surface

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-21T14:42:22Z`  
**REQ:** [`../../requirements/08-identity-http-edge-on-host.md`](../../requirements/08-identity-http-edge-on-host.md) §2 Process / Identity ops / Health  
**Interview:** DP2-B · DP3-A · DP6-A · DP8-A

## Components

| Component | Placement | Trust note |
|-----------|-----------|------------|
| Thin `node:http` server | [`host/`](../../../host/) — extend via composition | One process (arch-07) |
| Health handler | Existing [`health.js`](../../../host/health.js) | Open; no secrets |
| Identity HTTP module | New sibling under `host/` (filename TBD U1) | Never trust client role claims |
| Server compose | `createHostServer` / start path wires health + identity | Phase 2 seam from arch-07 |
| AUTH core | [`packages/core/src/auth/`](../../../packages/core/src/auth/) | Challenge, verify, bearer, bootstrap, DualAuthGate |
| RoleGate / CatalogAlias | [`packages/core/src/roleGate/`](../../../packages/core/src/roleGate/) | After DualAuthGate |

## HTTP surface (logical targets — not Present until implement)

| Area | Namespace / rule |
|------|------------------|
| Health | `GET /health` unchanged |
| Identity | Prefix **`/auth/*`** — challenge, verify, session validate, logout, bootstrap |
| Capability probe | **`/v1/capabilities/…`** with capability id **`profile.self`** (DP4-A) |
| Session header | `Authorization: Bearer <token>` |
| Other roots | 404 JSON as today — do not invent Express CRUD tree |

Exact path suffixes under `/auth/` = U2 (implement may choose; namespace locked).

## Packaging

No new image/start contract: production remains `npm start` on the same Railway service (DP8-A). Git ownership ≠ image packaging already decided in arch-07 — this package **reuses**, does not re-litigate.
