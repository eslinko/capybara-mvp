# 07 — Railway family host (Phase 1)

Дата: 2026-11-21  
Источник: Target ROADMAP Phase 1 · operator lock (project Capybara; health + deployable entry) · arch-04 packaging pointer  
Status: Draft — ready for tech planning / Architect Studio (host **Absent** on disk)  
Profile: `capybara` · focus `capybara/`  
Related: [`../tasks/backlog-stories/ROADMAP.md`](../tasks/backlog-stories/ROADMAP.md) Phase 1 · [`04-dual-auth-wallet-supabase-user.md`](04-dual-auth-wallet-supabase-user.md) (live host residual) · [`06-role-scoped-capability-catalog.md`](06-role-scoped-capability-catalog.md) · parent PRD · packaging arch [`../architecture/04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md`](../architecture/04-dual-auth-wallet-supabase-user/04-runtime-packaging-verify-env.md) · overview [`../architecture/04-dual-auth-wallet-supabase-user/00-overview.md`](../architecture/04-dual-auth-wallet-supabase-user/00-overview.md)  
Architecture: [`../architecture/07-railway-family-host/00-overview.md`](../architecture/07-railway-family-host/00-overview.md) · interview [`../analysis/zeya888.target-tech-arch-interview-07-railway-family-host-2026-11-21.md`](../analysis/zeya888.target-tech-arch-interview-07-railway-family-host-2026-11-21.md)  
Interview: Phase 1 locks 2026-11-21 (topology MVP one project; health gate; auth live → Phase 2) · tech-arch auto UX/arch 2026-11-21T12:39:32Z

Пометка: **deployability** Phase 1 — remote process + health + secrets server-side. Не реализует MCP/Skill, live DualAuth на хосте, journals→Supabase. Naming future paths (Dockerfile, start script, `/health`) = acceptance targets; **name ≠ create** until implement wave.

---

## 0. Verified as-is

| Seam | Fact |
|------|------|
| Runtime today | CLI + `packages/core` (`package.json` scripts: `test` / `cli` / `compile`) — no production host start |
| Dockerfile / railway.toml / Procfile | **Absent** under `capybara/` |
| HTTP health endpoint | **Absent** |
| Railway product host | **Absent** (ROADMAP as-is) |
| AUTH / ROLE / INV / CAT modules | Present in-process; live host residual (REQ-04) |

---

## 1. Назначение

Сделать Capybara **deployable** на Railway как family host process: удалённый Node (или эквивалент) процесс с проверяемым health, секретами только на сервере, без product money keys в browser/ChatGPT — чтобы Phase 2+ могли навесить live dual-auth / ACL на тот же entry.

---

## 2. Подтверждённые решения

| Область | Требование |
|---|---|
| Platform | Railway |
| Topology MVP | **Один** Railway project **Capybara** + **один** service (family host). Per-family multi-service scaling — later / Phase 2+ note, не Phase 1 AC invent |
| Surface | Deployable **production entry** + **health** endpoint (gate: remote health OK) |
| Secrets | Только server-side env; не в Git; не bake в image как production proof |
| Money keys | Не в browser / ChatGPT |
| Packaging | Git ownership ≠ image packaging; verify = production entry, не только `npm test` |
| Auth / wallet UI | Full live DualAuth HTTP edge / MetaMask UI — **Phase 2** (REQ-04 residual), не Phase 1 Done |
| Core modules | Host may load in-process `packages/core` when Present; Phase 1 gate не требует live gated family calls |

---

## 3. Out of scope

- Live DualAuthGate product proof on host / wallet UI — Phase 2  
- MCP tools / ChatGPT Skill — Phase 4  
- Journals → Supabase — Phase 3  
- Express CRUD family API as product contract  
- Custody / money-sign (PRD O-02)  
- Inventing multi-family Railway fleet in Phase 1  
- Creating Dockerfile / railway.toml / health code in this REQ ask (name ≠ create)

---

## 4. Acceptance

| ID | Результат |
|---|---|
| AC-H01 | Remote health on Railway family host returns OK (ROADMAP Phase 1 gate) |
| AC-H02 | Required secrets are server-side env only — not committed in Git; health must not leak secrets |
| AC-H03 | Named production start command exists and is what deploy runs (not CLI-only residual) |
| AC-H04 | Green unit/`npm test` alone does **not** count as Phase 1 host Done |
| AC-H05 | No product money / pool private keys required in browser or ChatGPT for this phase |
| AC-H06 | Railway project/service topology for MVP = one Capybara project + one host service (documented); per-family fleet not required for Phase 1 Done |

---

## 5. Named future paths (acceptance targets — not present until implement)

Logical targets only (filenames TBD in Architect Studio / P1.3):

- Production host entry (Node listen + health)  
- Packaging manifest suitable for Railway (e.g. Dockerfile and/or Nixpacks/`railway` config)  
- Documented start command wired to deploy  

**Verified state until implement:** Absent (see §0).
