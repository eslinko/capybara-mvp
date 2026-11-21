# Target tech-arch interview — 07-railway-family-host

**UTC:** 2026-11-21T12:39:32Z (`builder_resolve_queue.py --print-utc-now`)  
**Profile:** `capybara` · focus `capybara/`  
**Slug:** `07-railway-family-host`

## Inputs + use-case

| Input | Path |
|-------|------|
| REQ | [`../requirements/07-railway-family-host.md`](../requirements/07-railway-family-host.md) |
| Story package / list | none |
| Arch root | [`../architecture/07-railway-family-host/00-overview.md`](../architecture/07-railway-family-host/00-overview.md) |

**Use case:** целевая tech-архитектура deployable Railway family host (Phase 1) — thin entry + health + packaging — без NEW STORY/pkg/кода.

**Story scope:** none (0 STORY files read).

## Level classify

| Level | Evidence | Implication |
|-------|----------|-------------|
| Deployability-gap (+ Mixed) | REQ §0 Absent host/Docker; §2 packaging; AC-H01…H04 | This prompt; packaging pack **mandatory** |

## Operator process note

Operator authorized **auto-accept recommendations** each turn (UX convenience + architectural elegance/consistency with arch-04…06 and REQ-07), with reporting in dialog — decisions recorded as **accepted**.

## Verbatim decision log

### DP1 — Production entry shape (F2/F4)

- **Question:** Minimal health-only vs thin host shell vs full auth edge now?
- **Options summary:** A health-only · B thin shell + health · C full auth edge.
- **Options analytics:** A fastest gate; B one entry Phase 1→2; C conflicts REQ OOS Phase 2.
- **Architecture fit:** B fits arch-04 host-primary progressive; C conflicts REQ-07.
- **Agent recommendation:** B.
- **Operator decision:** **accepted** (auto UX/arch) — B.

### DP2 — HTTP stack

- **Question:** node:http vs Express vs Railway Function?
- **Options summary:** A node:http · B Express · C Function-only.
- **Agent recommendation:** A (no framework; avoid Express CRUD revival).
- **Operator decision:** **accepted** (auto) — A.

### DP3 — Health contract

- **Question:** `/health` JSON vs `/` vs deep health?
- **Options summary:** A GET /health minimal JSON · B GET / · C deep DB/Supabase.
- **Agent recommendation:** A (REQ §5 named `/health`; no Phase 1 Supabase).
- **Operator decision:** **accepted** (auto) — A.

### DP4 — Start command (AC-H03)

- **Question:** npm start vs CLI vs test?
- **Options summary:** A npm run start · B cli · C test/hardhat.
- **Agent recommendation:** A.
- **Operator decision:** **accepted** (auto) — A.

### DP5 — Ownership (F5)

- **Question:** Who owns source / image / secrets?
- **Agent recommendation:** Git source · Railway image · Railway env secrets · Supabase external Phase 2.
- **Operator decision:** **accepted** (auto).

### DP6 — Packaging (F6)

- **Question:** Dockerfile vs Nixpacks-only vs Dockerfile + thin railway config?
- **Options summary:** A Dockerfile · B Nixpacks only · C Dockerfile + thin railway.toml/dashboard.
- **Agent recommendation:** C.
- **Operator decision:** **accepted** (auto) — C.

### DP7 — Env / PORT (F7)

- **Question:** Phase 1 required env?
- **Options summary:** A PORT only (+ Phase 2 secret classes documented) · B full Supabase now · C fixed port.
- **Agent recommendation:** A.
- **Operator decision:** **accepted** (auto) — A.

### DP8 — Verify (F8)

- **Agent recommendation:** unit optional health; production entry smoke; live remote health; npm test insufficient.
- **Operator decision:** **accepted** (auto).

### DP9 — Deploy residual (F9)

- **Agent recommendation:** live = remote health Done gate; local start = residual.
- **Operator decision:** **accepted** (auto).

### DP10 — Integration / coexistence (F10)

- **Agent recommendation:** CLI coexistence; core optional; no Express CRUD product; Phase 2 auth on same shell.
- **Operator decision:** **accepted** (auto).

### DP11–12 / F1 — Observability, privacy, success/OOS

- **Agent recommendation:** health-only observability; no secrets in health; success = AC-H*; OOS DualAuth/MCP/journals/fleet.
- **Operator decision:** **accepted** (auto).

## Open Unknowns

- U1: Exact host entry path/filename.
- U2: Docker Node base / version pin.
- U3: Commit railway.toml vs dashboard-only.

## Link matrix

| Artifact | Link |
|----------|------|
| REQ-07 | [`../requirements/07-railway-family-host.md`](../requirements/07-railway-family-host.md) |
| Arch root | [`../architecture/07-railway-family-host/00-overview.md`](../architecture/07-railway-family-host/00-overview.md) |
| Siblings | `01-host-entry-and-health` · `02-packaging-and-ownership` · `03-env-verify-deploy-residual` |
| This report | (this file) |

## Packaging

**Applied:** Git ownership ≠ image packaging (Dockerfile + thin railway config; image ≠ unit-test proof).

## Method notes

- Inputs (REQ) ≠ target tech arch ≠ new work items.  
- **Git ownership ≠ image packaging** (packaging pack applied).  
- Recommendation advisory; operator decides — here operator pre-authorized auto-accept of UX/elegance recommendations.
