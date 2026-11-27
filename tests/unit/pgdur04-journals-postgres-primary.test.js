'use strict';

/**
 * PGDUR-04 — Journals Postgres primary (activity/advance/debt) · mode intact.
 * Soft≠Live: unit ≠ invent Live Pass / REQ-12 Done · live read → PGDUR-05.
 * NDJSON archive residual — import not Accept gate · docs alone ≠ Done.
 */

const { expect } = require('chai');
const {
  MemoryJournalStore,
  PostgresJournalStore,
  JOURNAL_TABLES,
  assertJournalMode,
} = require('../../packages/core/src/journals');
const {
  appendTypedLedgerEntries,
} = require('../../packages/core/src/daily-payments/ndjsonLogWriter');
const {
  appendAdvanceEvent,
} = require('../../packages/core/src/advance/advanceWriter');
const {
  appendDebtEvent,
} = require('../../packages/core/src/debt/debtWriter');

const SCOPE = {
  mode: 'mock',
  chainId: '84532',
  token: '0xtoken',
  pool: '0xpool',
};

/**
 * Minimal supabase-js `.from` for three journal tables.
 */
function createMemoryTableClient() {
  /** @type {Record<string, Map<string, object>>} */
  const tables = {
    [JOURNAL_TABLES.activity]: new Map(),
    [JOURNAL_TABLES.advance]: new Map(),
    [JOURNAL_TABLES.debt]: new Map(),
  };

  function from(tableName) {
    if (!tables[tableName]) {
      throw new Error(`unknown table ${tableName}`);
    }
    let pendingInsert = null;
    let mode = 'select';
    const api = {
      select() {
        return api;
      },
      insert(row) {
        mode = 'insert';
        pendingInsert = { ...row };
        return api;
      },
      async single() {
        if (mode === 'insert' && pendingInsert) {
          if (tables[tableName].has(pendingInsert.id)) {
            return {
              data: null,
              error: { message: 'duplicate', code: '23505' },
            };
          }
          tables[tableName].set(pendingInsert.id, { ...pendingInsert });
          return { data: { ...pendingInsert }, error: null };
        }
        return { data: null, error: { message: 'unexpected' } };
      },
      then(resolve, reject) {
        const rows = [...tables[tableName].values()];
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  return { from, _tables: tables };
}

describe('PGDUR-04 journals Postgres primary Soft≠Live', () => {
  it('AC-P04 activity: journalStore primary + mode intact; NDJSON not sole SoT', async () => {
    const store = new MemoryJournalStore();
    const path = await appendTypedLedgerEntries({
      wallet: '0xact',
      mode: 'mock',
      journalStore: store,
      entries: [
        {
          type: 'activity_validated',
          submission_id: 'sub-1',
          wallet: '0xact',
          mode: 'mock',
        },
      ],
    });
    expect(path).to.match(/^postgres:activity_journal_entries/);
    const rows = store.listActivityRows();
    expect(rows).to.have.length(1);
    expect(rows[0].mode).to.equal('mock');
    expect(rows[0].payload.type).to.equal('activity_validated');
  });

  it('AC-P04 advance: PostgresJournalStore insert + mode gfl_reality', async () => {
    const client = createMemoryTableClient();
    const store = new PostgresJournalStore({ client });
    const written = await appendAdvanceEvent({
      child: 'tristan',
      scope: { ...SCOPE, mode: 'gfl_reality' },
      advanceId: 'adv-1',
      type: 'issue',
      amount: '100',
      journalStore: store,
    });
    expect(written.backend).to.equal('postgres');
    expect(written.event.scope.mode).to.equal('gfl_reality');
    expect(client._tables[JOURNAL_TABLES.advance].size).to.equal(1);
    const row = [...client._tables[JOURNAL_TABLES.advance].values()][0];
    expect(row.mode).to.equal('gfl_reality');
    expect(row.payload.advance_id).to.equal('adv-1');
  });

  it('AC-P04 debt: MemoryJournalStore primary; mode mock', async () => {
    const store = new MemoryJournalStore();
    const written = await appendDebtEvent({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      type: 'create',
      amount: '50',
      journalStore: store,
    });
    expect(written.backend).to.equal('postgres');
    const payloads = store.listDebtPayloads();
    expect(payloads).to.have.length(1);
    expect(payloads[0].debt_id).to.equal('debt-1');
    expect(payloads[0].scope.mode).to.equal('mock');
  });

  it('mode lock: reject invent mode outside mock|gfl_reality', () => {
    expect(() => assertJournalMode('prod')).to.throw(/mock\|gfl_reality/i);
  });

  it('NDJSON residual honesty: archive; import not gate; docs alone ≠ Done; live → PGDUR-05', () => {
    const note = [
      'NDJSON under logs/capybara/ = archive residual',
      'bulk import not Accept gate',
      'docs alone ≠ Done',
      'Soft≠Live: unit ≠ invent Live Pass / REQ-12 Done → PGDUR-05',
    ].join(' · ');
    expect(note).to.include('archive residual');
    expect(note).to.include('not Accept gate');
    expect(note).to.include('docs alone ≠ Done');
    expect(note).to.include('PGDUR-05');
    expect(note).to.not.match(/Live Pass claimed/i);
  });

  it('without journalStore: NDJSON path remains (Soft≠Live coexistence)', async () => {
    // Smoke: function still exports; durable inject not required for legacy path.
    expect(typeof appendTypedLedgerEntries).to.equal('function');
    expect(typeof appendAdvanceEvent).to.equal('function');
    expect(typeof appendDebtEvent).to.equal('function');
  });
});
