'use strict';

const crypto = require('crypto');
const { assertJournalMode } = require('./journalMode');

/**
 * In-memory journal store for unit inject Soft≠Live.
 * Same method surface as PostgresJournalStore.
 * Soft≠Live: memory ≠ invent Live Pass / REQ-12 Done.
 */
class MemoryJournalStore {
  constructor() {
    /** @type {Map<string, object>} */
    this._activity = new Map();
    /** @type {Map<string, object>} */
    this._advance = new Map();
    /** @type {Map<string, object>} */
    this._debt = new Map();
    /** @type {'memory-journal'} */
    this.kind = 'memory-journal';
  }

  /**
   * @param {{ id?: string, mode: unknown, payload: object }} input
   * @returns {object}
   */
  appendActivity(input) {
    return this._append(this._activity, 'activity_journal_entries', input);
  }

  /**
   * @param {{ id?: string, mode: unknown, payload: object }} input
   * @returns {object}
   */
  appendAdvance(input) {
    return this._append(this._advance, 'advance_journal_entries', input);
  }

  /**
   * @param {{ id?: string, mode: unknown, payload: object }} input
   * @returns {object}
   */
  appendDebt(input) {
    return this._append(this._debt, 'debt_journal_entries', input);
  }

  /**
   * @returns {object[]}
   */
  listAdvancePayloads() {
    return [...this._advance.values()].map((r) => ({ ...r.payload }));
  }

  /**
   * @returns {object[]}
   */
  listDebtPayloads() {
    return [...this._debt.values()].map((r) => ({ ...r.payload }));
  }

  /**
   * @returns {object[]}
   */
  listActivityRows() {
    return [...this._activity.values()].map((r) => ({ ...r }));
  }

  /**
   * @param {Map<string, object>} map
   * @param {string} table
   * @param {{ id?: string, mode: unknown, payload: object }} input
   */
  _append(map, table, input) {
    if (!input || !input.payload || typeof input.payload !== 'object') {
      const err = new Error('journal payload object required');
      err.code = 'EJOURNAL_BAD_PAYLOAD';
      throw err;
    }
    const mode = assertJournalMode(input.mode);
    const id =
      typeof input.id === 'string' && input.id.trim()
        ? input.id.trim()
        : `j-${crypto.randomBytes(8).toString('hex')}`;
    if (map.has(id)) {
      const err = new Error(`journal id already exists: ${id}`);
      err.code = 'EJOURNAL_DUPLICATE';
      throw err;
    }
    const row = { id, mode, payload: { ...input.payload }, table };
    map.set(id, row);
    return { ...row };
  }
}

module.exports = {
  MemoryJournalStore,
};
