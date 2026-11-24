# 03 — Packaging, verify surfaces, deploy residual

**Package:** [`00-overview.md`](./00-overview.md)  
**UTC:** `2026-11-24T13:17:11Z`  
**Packaging pack:** applied — Git ownership ≠ image packaging

## Packaging (interview lock A)

| Rule | Target |
|------|--------|
| Dependency | Add `@supabase/supabase-js` to `@capybara/core` (lockfile in Git) |
| Factory placement | Live factory beside residual in [`supabaseAuthPort.js`](../../../packages/core/src/auth/supabaseAuthPort.js) (replace residual body or export `createLiveSupabaseAuthPort`; residual must not be prod default) |
| Image | Existing Dockerfile COPY `packages/core` + `npm install --workspace=@capybara/core` must pull supabase-js into runtime image |
| Do not bake | Project URL/keys, Auth users, or “fixtures as live proof” |

## Verify surfaces (interview lock A)

| Surface | What proves |
|---------|-------------|
| Unit / src | Memory double create/link + bind helper; host tests inject memory; **no** claim REQ-09 Done from `npm test` alone (AC-S05) |
| Production entry | Railway host: wallet proof (REQ-10) → `POST /auth/verify` → bind returns real Supabase `userId` (not residual throw / not memory-only) |

## Deploy residual (F9)

| Gate | Meaning |
|------|---------|
| Live proof | Railway + real Supabase project + real MetaMask Sign (Channel A or B) → verify → Auth user create/link |
| Local substitute | Memory double / residual throw labeled — **≠** Phase 2 Supabase Done |
| No Supabase project | Operator documents residual — AC not Accepted until live or explicit waive |

## Related Target Path

REQ-10 Accepted supplies human proof. REQ-08 ACL gate still separate. Phase 3 journals ≠ this package.
