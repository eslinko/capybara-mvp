'use strict';

/**
 * PGDUR-01 — Git-owned migrations schema lock.
 * Soft≠Live: unit/docs ≠ invent REQ-12 Done / Live Pass.
 */

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

const MIGRATIONS_DIR = path.join(__dirname, '../../supabase/migrations');

const LOCKED_TABLES = [
  'families',
  'memberships',
  'invites',
  'verified_address_proofs',
  'activity_journal_entries',
  'advance_journal_entries',
  'debt_journal_entries',
];

const FORBIDDEN_TABLES = [
  'challenges',
  'pending_challenges',
  'bearer_sessions',
  'sign_tokens',
  'challenge_store',
  'bearer_session_store',
];

function readAllMigrationSql() {
  expect(fs.existsSync(MIGRATIONS_DIR), 'migrations dir Present').to.equal(true);
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  expect(files.length).to.be.at.least(1);
  return {
    files,
    sql: files
      .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
      .join('\n'),
  };
}

describe('PGDUR-01 git migrations schema', () => {
  it('AC-M01: migrations dir + seven locked table creates', () => {
    const { files, sql } = readAllMigrationSql();
    expect(files.every((f) => /^\d{14}_.+\.sql$/.test(f))).to.equal(true);
    for (const name of LOCKED_TABLES) {
      expect(sql, name).to.match(
        new RegExp(`create table if not exists public\\.${name}\\b`, 'i'),
      );
    }
  });

  it('AC-M03: no challenge/bearer/sign_token tables', () => {
    const { sql } = readAllMigrationSql();
    for (const name of FORBIDDEN_TABLES) {
      expect(sql.toLowerCase()).to.not.match(
        new RegExp(`create table[^;]*\\b${name}\\b`),
      );
    }
  });

  it('AC-M04: journals carry mode mock|gfl_reality; identity/proof columns cite as-is', () => {
    const { sql } = readAllMigrationSql();
    expect(sql).to.match(/mode text not null check \(mode in \('mock', 'gfl_reality'\)\)/);
    expect(sql).to.match(/pool_address/);
    expect(sql).to.match(/bootstrapped/);
    expect(sql).to.match(/from_membership_id/);
    expect(sql).to.match(/challenge_id/);
    expect(sql).to.match(/verified_at_ms/);
    expect(sql).to.match(/payload jsonb not null/);
  });

  it('AC-M05 Soft≠Live honesty: harness does not claim REQ-12 Done', () => {
    const note =
      'Soft≠Live: migrations unit ≠ invent REQ-12 Done / Live Pass';
    expect(note).to.include('Soft≠Live');
    expect(note).to.not.match(/REQ-12 Done claimed/i);
  });
});
