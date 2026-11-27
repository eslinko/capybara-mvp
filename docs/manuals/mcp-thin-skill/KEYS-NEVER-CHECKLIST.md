# Keys-never checklist Soft (AC-M07)

Soft≠Live review assert for this pack. Fail the wave if any item is unchecked Soft.

## Forbidden in pack / Skill prompts / client payloads

- [x] No `PARENT_PRIVATE_KEY` (or parent signing key material)
- [x] No child private keys (`TRISTAN_PRIVATE_KEY`, `BASTIAN_PRIVATE_KEY`, or equivalents)
- [x] No deployer / mint private keys
- [x] No hex private-key blobs pasted as secrets Soft
- [x] Money keys remain host `.env` only Soft (REQ-07)

## Allowed Soft

- [x] MCP URL pointing at `/mcp`
- [x] Bearer secret slot (`CAPY_MCP_BEARER_SECRET` / `Authorization: Bearer`)
- [x] Operator UX prompts (no role grant by chat wording — AC-M08)

## Soft unit

`tests/unit/mcp06-thin-skill-bearer-no-keys.test.js` scans pack files for forbidden key env names Soft.

## Soft≠Live

Checklist Soft ≠ invent Live Pass / Phase 4 Done.
