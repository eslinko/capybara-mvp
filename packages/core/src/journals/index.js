'use strict';

/**
 * PGDUR-04 journal seam — Postgres primary for activity/advance/debt.
 * Soft≠Live: unit/adapters ≠ invent Live Pass / REQ-12 Done (→ PGDUR-05).
 * NDJSON under logs/capybara/ = archive residual when journalStore Present.
 */

const { JOURNAL_MODES, assertJournalMode } = require('./journalMode');
const { MemoryJournalStore } = require('./MemoryJournalStore');
const {
  PostgresJournalStore,
  JOURNAL_TABLES,
} = require('./PostgresJournalStore');

module.exports = {
  JOURNAL_MODES,
  assertJournalMode,
  MemoryJournalStore,
  PostgresJournalStore,
  JOURNAL_TABLES,
};
