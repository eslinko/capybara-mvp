'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const {
  DEFAULT_LOG_DIR,
  getWalletLogPath,
  resolveLogDirForMode,
} = require('./ndjsonLogReader');
const { appendTypedLedgerEntries } = require('./ndjsonLogWriter');

const TYPE_ACTIVITY_VALIDATED = 'activity_validated';
const TYPE_PAYOUT = 'payout';

/**
 * @param {unknown} amount
 * @returns {boolean}
 */
function isPositivePayoutAmount(amount) {
  if (amount === null || amount === undefined) {
    return false;
  }
  if (typeof amount === 'bigint') {
    return amount > 0n;
  }
  if (typeof amount === 'number') {
    return Number.isFinite(amount) && amount > 0;
  }
  const asString = String(amount).trim();
  if (!asString) {
    return false;
  }
  try {
    return BigInt(asString) > 0n;
  } catch {
    const n = Number(asString);
    return Number.isFinite(n) && n > 0;
  }
}

/**
 * Build typed `activity_validated` ledger entry (not yet written).
 * @param {{
 *   submission_id?: string,
 *   wallet: string,
 *   system: string,
 *   level: string,
 *   period?: string|null,
 *   subject: string,
 *   activityType: string,
 *   subtype?: string|null,
 *   templateId?: string|null,
 *   metricDef: object,
 *   value: unknown,
 *   direction: string,
 *   validatedBy?: string | { membershipId: string, role: string, address: string },
 *   ts?: string,
 *   mode: 'mock'|'gfl_reality'|string,
 * }} fields
 * @returns {object}
 */
function buildActivityValidatedEntry(fields) {
  const {
    submission_id = crypto.randomUUID(),
    wallet,
    system,
    level,
    period = null,
    subject,
    activityType,
    subtype = null,
    templateId = null,
    metricDef,
    value,
    direction,
    validatedBy = 'parent',
    ts = new Date().toISOString(),
    mode,
  } = fields;

  if (!wallet || !system || !level || !subject || !activityType || !metricDef || direction == null || !mode) {
    throw new Error('buildActivityValidatedEntry: missing required fields');
  }

  const entry = {
    type: TYPE_ACTIVITY_VALIDATED,
    submission_id,
    wallet: String(wallet).toLowerCase().trim(),
    system,
    level,
    subject,
    activityType,
    metricDef,
    value,
    direction,
    validatedBy,
    ts,
    mode,
  };

  if (period != null && period !== '') {
    entry.period = period;
  }
  if (subtype != null && subtype !== '') {
    entry.subtype = subtype;
  }
  if (templateId != null && templateId !== '') {
    entry.templateId = templateId;
  }

  return entry;
}

/**
 * Build typed `payout` ledger entry (not yet written).
 * @param {{
 *   submission_id: string,
 *   amount: string|number|bigint,
 *   from: string,
 *   to: string,
 *   txHash?: string|null,
 *   mock?: boolean,
 *   ts?: string,
 *   mode: 'mock'|'gfl_reality'|string,
 * }} fields
 * @returns {object}
 */
function buildPayoutEntry(fields) {
  const {
    submission_id,
    amount,
    from,
    to,
    txHash = null,
    mock = false,
    ts = new Date().toISOString(),
    mode,
  } = fields;

  if (!submission_id || amount === undefined || amount === null || !from || !to || !mode) {
    throw new Error('buildPayoutEntry: missing required fields');
  }

  const entry = {
    type: TYPE_PAYOUT,
    submission_id,
    amount: typeof amount === 'bigint' ? amount.toString() : amount,
    from,
    to,
    ts,
    mode,
  };

  if (txHash) {
    entry.txHash = txHash;
  }
  if (mock) {
    entry.mock = true;
  }

  return entry;
}

/**
 * Count NDJSON lines in wallet journal for mode (committed file only).
 * @param {{ wallet: string, logDir?: string, mode?: string }} params
 * @returns {Promise<number>}
 */
async function countCommittedJournalLines(params) {
  const { wallet, logDir = DEFAULT_LOG_DIR, mode = 'gfl_reality' } = params;
  const targetLogDir = resolveLogDirForMode(logDir, mode);
  const filePath = getWalletLogPath(wallet, targetLogDir);
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
  return content.split('\n').map((l) => l.trim()).filter(Boolean).length;
}

/**
 * Stage activity_validated (+ optional payout) in memory; commit only after transfer success
 * (or when payout skipped / amount=0). Transfer failure → 0 new committed lines (rollback).
 *
 * @param {{
 *   wallet: string,
 *   activity: Parameters<typeof buildActivityValidatedEntry>[0],
 *   payout?: null|{
 *     amount: string|number|bigint,
 *     from: string,
 *     to: string,
 *     mock?: boolean,
 *   },
 *   transferFn?: (() => Promise<{ txHash?: string|null, mock?: boolean }|void>)|null,
 *   logDir?: string,
 *   mode?: 'mock'|'gfl_reality',
 * }} params
 * @returns {Promise<{
 *   committed: number,
 *   rolledBack: boolean,
 *   submission_id: string,
 *   filePath: string|null,
 *   entries: object[],
 * }>}
 */
async function stageAndCommitActivityJournal(params) {
  const {
    wallet,
    activity,
    payout = null,
    transferFn = null,
    logDir = DEFAULT_LOG_DIR,
    mode = 'gfl_reality',
  } = params;

  const activityEntry = buildActivityValidatedEntry({
    ...activity,
    wallet: activity.wallet ?? wallet,
    mode: activity.mode ?? mode,
  });
  const submissionId = activityEntry.submission_id;

  /** @type {object[]} */
  const staged = [activityEntry];

  const wantsPayout = payout != null && isPositivePayoutAmount(payout.amount);

  if (wantsPayout) {
    let transferResult;
    try {
      if (typeof transferFn !== 'function') {
        throw new Error('stageAndCommitActivityJournal: transferFn required when payout amount > 0');
      }
      transferResult = await transferFn();
    } catch (error) {
      return {
        committed: 0,
        rolledBack: true,
        submission_id: submissionId,
        filePath: null,
        entries: [],
        error,
      };
    }

    const payoutEntry = buildPayoutEntry({
      submission_id: submissionId,
      amount: payout.amount,
      from: payout.from,
      to: payout.to,
      txHash: transferResult?.txHash ?? null,
      mock: Boolean(payout.mock ?? transferResult?.mock ?? mode === 'mock'),
      mode: activityEntry.mode,
      ts: activityEntry.ts,
    });
    staged.push(payoutEntry);
  }

  // Commit: one durable append for all staged rows (no half-pair on mid-write fail).
  let filePath = null;
  try {
    filePath = await appendTypedLedgerEntries({
      wallet,
      entries: staged,
      logDir,
      mode,
    });
  } catch (error) {
    return {
      committed: 0,
      rolledBack: true,
      submission_id: submissionId,
      filePath: null,
      entries: [],
      error,
    };
  }

  return {
    committed: staged.length,
    rolledBack: false,
    submission_id: submissionId,
    filePath,
    entries: staged,
  };
}

module.exports = {
  TYPE_ACTIVITY_VALIDATED,
  TYPE_PAYOUT,
  isPositivePayoutAmount,
  buildActivityValidatedEntry,
  buildPayoutEntry,
  countCommittedJournalLines,
  stageAndCommitActivityJournal,
};
