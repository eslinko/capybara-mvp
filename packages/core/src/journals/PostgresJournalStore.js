'use strict';

const crypto = require('crypto');
const { assertJournalMode } = require('./journalMode');

const TABLES = Object.freeze({
  activity: 'activity_journal_entries',
  advance: 'advance_journal_entries',
  debt: 'debt_journal_entries',
});

/**
 * Postgres-backed journal store — primary SoT for activity/advance/debt.
 * Soft≠Live: adapter Present ≠ invent REQ-12 Done / Live Pass (→ PGDUR-05).
 */
class PostgresJournalStore {
  /**
   * @param {{ client: { from: Function } }} opts
   */
  constructor(opts) {
    if (!opts || typeof opts.client?.from !== 'function') {
      const err = new Error('PostgresJournalStore requires supabase-js client');
      err.code = 'EJOURNAL_CLIENT_REQUIRED';
      throw err;
    }
    this._client = opts.client;
    /** @type {'postgres-journal'} */
    this.kind = 'postgres-journal';
  }

  /**
   * @param {{ id?: string, mode: unknown, payload: object }} input
   * @returns {Promise<object>}
   */
  appendActivity(input) {
    return this._append(TABLES.activity, input);
  }

  /**
   * @param {{ id?: string, mode: unknown, payload: object }} input
   * @returns {Promise<object>}
   */
  appendAdvance(input) {
    return this._append(TABLES.advance, input);
  }

  /**
   * @param {{ id?: string, mode: unknown, payload: object }} input
   * @returns {Promise<object>}
   */
  appendDebt(input) {
    return this._append(TABLES.debt, input);
  }

  /**
   * @returns {Promise<object[]>}
   */
  async listAdvancePayloads() {
    const { data, error } = await this._client
      .from(TABLES.advance)
      .select('*');
    if (error) {
      const err = new Error(error.message || 'advance journal list failed');
      err.code = 'EJOURNAL_READ_FAILED';
      throw err;
    }
    return (data || []).map((r) =>
      typeof r.payload === 'object' && r.payload ? { ...r.payload } : r.payload,
    );
  }

  /**
   * @returns {Promise<object[]>}
   */
  async listDebtPayloads() {
    const { data, error } = await this._client.from(TABLES.debt).select('*');
    if (error) {
      const err = new Error(error.message || 'debt journal list failed');
      err.code = 'EJOURNAL_READ_FAILED';
      throw err;
    }
    return (data || []).map((r) =>
      typeof r.payload === 'object' && r.payload ? { ...r.payload } : r.payload,
    );
  }

  /**
   * @param {string} table
   * @param {{ id?: string, mode: unknown, payload: object }} input
   * @returns {Promise<object>}
   */
  async _append(table, input) {
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

    const row = {
      id,
      mode,
      payload: input.payload,
    };

    const { data, error } = await this._client
      .from(table)
      .insert(row)
      .select('*')
      .single();

    if (error) {
      const err = new Error(error.message || `${table} insert failed`);
      err.code = 'EJOURNAL_PERSIST_FAILED';
      throw err;
    }
    return {
      id: data.id,
      mode: data.mode,
      payload: data.payload,
      table,
    };
  }
}

module.exports = {
  PostgresJournalStore,
  JOURNAL_TABLES: TABLES,
};
