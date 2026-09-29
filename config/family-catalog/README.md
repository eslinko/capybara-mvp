# Family catalog

SSOT: `systems.json` — family education systems, activity types, metric/payout rules (cascade), and **templates**. Concept: [`concept-activity-payouts-family-catalog-2026-09-28.md`](../../docs/analysis/concept-activity-payouts-family-catalog-2026-09-28.md) (§8 inventory).

**Registry note:** root arrays `metricRules` / `payoutRules` are **documentation/registry only**. Runtime resolve (`packages/core/src/family-catalog/resolve.js`) uses **inline** `metricRule` / `payoutRule` on system, activityTypeOverrides, subtypeOverrides, and templates — not lookup-by-id from those arrays.

## Cascade

`template → subtype → activityType → system` (first found wins). Prefer inline `metricRule` / `payoutRule` on a template when you need `source: 'template'`.

## How to add a template

1. Open `systems.json` → root `templates[]`.
2. Add an object with stable unique `id` (this is `CAPYBARA_TEMPLATE_ID` / `templateId` in action 4).
3. Optional inventory metadata (not used by resolve, for operators): `system`, `level`, `period`, `subject`, `activityType`, `subtype`.
4. Optional inline `metricRule` and/or `payoutRule` (same shape as on systems) — **required** if you want cascade to hit `source: 'template'`.
5. Run: `cd capybara && npx mocha tests/unit/family-catalog.test.js`.

### Seeded (ACT-04)

| id | system | notes |
|----|--------|-------|
| `entrega-1.1` | cidead | T1 matematicas · control/entrega · score_0_10 · level provisional `1` |
| `dictant-ru-1` | ru | russkiy · control/dictant · error_count |
| `sr-1` | ru | grade-8 algebra · control/samostoyatelnaya · percent |
