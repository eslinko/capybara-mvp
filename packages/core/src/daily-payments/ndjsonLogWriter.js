'use strict';

const fs = require('fs/promises');
const {
  DEFAULT_LOG_DIR,
  getWalletLogPath,
  readExistingDayDates,
  resolveLogDirForMode,
} = require('./ndjsonLogReader');

/**
 * @param {string} logDir
 * @returns {Promise<void>}
 */
async function ensureLogDir(logDir = DEFAULT_LOG_DIR) {
  await fs.mkdir(logDir, { recursive: true });
}

/**
 * @param {{
 *   wallet: string,
 *   breakdown: Array<{ date: string, expected: bigint, actual: bigint, match: boolean, owed: bigint }>,
 *   payment?: {
 *     paidTotal: bigint,
 *     txHash: string,
 *     confirmed: boolean,
 *     mock?: boolean,
 *     date?: string,
 *     period?: { from: string, to: string },
 *     days?: string[],
 *     from?: string,
 *     to?: string,
 *     block?: number|null,
 *     timestamp?: string,
 *     launched_by?: string,
 *     mode?: string,
 *   }|null,
 *   logDir?: string,
 *   mode?: 'mock'|'gfl_reality',
 * }} params
 * @returns {Promise<string>} file path written
 */
async function appendDailyPaymentsLog(params) {
  const {
    wallet,
    breakdown,
    payment = null,
    logDir = DEFAULT_LOG_DIR,
    mode = 'gfl_reality',
  } = params;

  const targetLogDir = resolveLogDirForMode(logDir, mode);
  await ensureLogDir(targetLogDir);
  const filePath = getWalletLogPath(wallet, targetLogDir);
  const existingDates = await readExistingDayDates(wallet, targetLogDir);

  const lines = breakdown
    .filter((day) => !existingDates.has(day.date))
    .map((day) =>
      JSON.stringify({
        type: 'day',
        date: day.date,
        expected: day.expected.toString(),
        actual: day.actual.toString(),
        match: day.match,
        owed: day.owed.toString(),
      })
    );

  if (payment) {
    const paymentRow = {
      type: 'payment',
      paid_total: payment.paidTotal.toString(),
      date: payment.date ?? payment.period?.to ?? null,
      txHash: payment.txHash,
      confirmed: payment.confirmed,
      mock: Boolean(payment.mock),
    };

    if (payment.period) {
      paymentRow.period = payment.period;
    }
    if (payment.days) {
      paymentRow.days = payment.days;
    }
    if (payment.from) {
      paymentRow.from = payment.from;
    }
    if (payment.to) {
      paymentRow.to = payment.to;
    }
    if (payment.block !== undefined) {
      paymentRow.block = payment.block;
    }
    if (payment.timestamp) {
      paymentRow.timestamp = payment.timestamp;
    }
    if (payment.launched_by) {
      paymentRow.launched_by = payment.launched_by;
    }
    if (payment.mode) {
      paymentRow.mode = payment.mode;
    }

    lines.push(JSON.stringify(paymentRow));
  }

  await fs.appendFile(filePath, lines.length > 0 ? `${lines.join('\n')}\n` : '', 'utf8');
  return filePath;
}

/**
 * Serialize a typed ledger entry to one NDJSON line (bigint → string).
 * @param {object} entry
 * @returns {string}
 */
function serializeTypedLedgerEntry(entry) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(entry).map(([key, value]) => {
        if (typeof value === 'bigint') {
          return [key, value.toString()];
        }
        return [key, value];
      })
    )
  );
}

/**
 * Append a single typed ledger row (charge, sweep, etc.) to per-wallet NDJSON.
 * @param {{
 *   wallet: string,
 *   entry: object,
 *   logDir?: string,
 *   mode?: 'mock'|'gfl_reality',
 * }} params
 * @returns {Promise<string>}
 */
async function appendTypedLedgerEntry(params) {
  const { wallet, entry, logDir = DEFAULT_LOG_DIR, mode = 'gfl_reality' } = params;
  return appendTypedLedgerEntries({
    wallet,
    entries: [entry],
    logDir,
    mode,
  });
}

/**
 * Append one or more typed ledger rows in a single durable `appendFile`
 * (atomic pair: activity_validated + payout cannot half-land).
 * @param {{
 *   wallet: string,
 *   entries: object[],
 *   logDir?: string,
 *   mode?: 'mock'|'gfl_reality',
 * }} params
 * @returns {Promise<string>}
 */
async function appendTypedLedgerEntries(params) {
  const { wallet, entries, logDir = DEFAULT_LOG_DIR, mode = 'gfl_reality' } = params;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('appendTypedLedgerEntries: entries must be a non-empty array');
  }

  const targetLogDir = resolveLogDirForMode(logDir, mode);
  await ensureLogDir(targetLogDir);
  const filePath = getWalletLogPath(wallet, targetLogDir);

  const payload = `${entries.map(serializeTypedLedgerEntry).join('\n')}\n`;
  await fs.appendFile(filePath, payload, 'utf8');
  return filePath;
}

module.exports = {
  ensureLogDir,
  appendDailyPaymentsLog,
  appendTypedLedgerEntry,
  appendTypedLedgerEntries,
  serializeTypedLedgerEntry,
};
