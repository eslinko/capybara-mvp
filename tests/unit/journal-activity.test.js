'use strict';

process.env.CAPYBARA_LAZY_CONFIG = '1';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const sinon = require('sinon');
const {
  buildActivityValidatedEntry,
  buildPayoutEntry,
  stageAndCommitActivityJournal,
  countCommittedJournalLines,
  TYPE_ACTIVITY_VALIDATED,
  TYPE_PAYOUT,
  isPositivePayoutAmount,
} = require('../../packages/core/src/daily-payments/activityJournal');
const {
  appendTypedLedgerEntry,
  appendTypedLedgerEntries,
  appendDailyPaymentsLog,
} = require('../../packages/core/src/daily-payments/ndjsonLogWriter');
const {
  readLastLogDate,
  getWalletLogPath,
  resolveLogDirForMode,
} = require('../../packages/core/src/daily-payments/ndjsonLogReader');

describe('ACT-02 journal activity events', () => {
  /** @type {string} */
  let tempLogDir;

  beforeEach(async () => {
    tempLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-act02-'));
  });

  afterEach(async () => {
    sinon.restore();
    if (tempLogDir) {
      await fs.rm(tempLogDir, { recursive: true, force: true });
    }
  });

  /**
   * @returns {Parameters<typeof buildActivityValidatedEntry>[0]}
   */
  function sampleActivity(overrides = {}) {
    return {
      wallet: 'tristan',
      system: 'cidead',
      level: 'primaria-3',
      period: 'T1',
      subject: 'matematicas',
      activityType: 'control',
      subtype: 'controlnaya',
      templateId: 'tpl-demo',
      metricDef: { id: 'score_0_10', direction: 'higher_better' },
      value: '7.22',
      direction: 'higher_better',
      validatedBy: 'parent',
      mode: 'mock',
      ...overrides,
    };
  }

  /**
   * @param {string} wallet
   * @param {string} mode
   */
  async function readJournalRows(wallet, mode = 'mock') {
    const filePath = getWalletLogPath(wallet, resolveLogDirForMode(tempLogDir, mode));
    let content;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  describe('schemas (t01)', () => {
    it('buildActivityValidatedEntry sets type and Scope minimum fields', () => {
      const entry = buildActivityValidatedEntry(sampleActivity({ submission_id: 'sub-1' }));
      expect(entry.type).to.equal(TYPE_ACTIVITY_VALIDATED);
      expect(entry.submission_id).to.equal('sub-1');
      expect(entry.wallet).to.equal('tristan');
      expect(entry.system).to.equal('cidead');
      expect(entry.level).to.equal('primaria-3');
      expect(entry.period).to.equal('T1');
      expect(entry.subject).to.equal('matematicas');
      expect(entry.activityType).to.equal('control');
      expect(entry.subtype).to.equal('controlnaya');
      expect(entry.templateId).to.equal('tpl-demo');
      expect(entry.metricDef).to.deep.equal({ id: 'score_0_10', direction: 'higher_better' });
      expect(entry.value).to.equal('7.22');
      expect(entry.direction).to.equal('higher_better');
      expect(entry.validatedBy).to.equal('parent');
      expect(entry.ts).to.be.a('string');
      expect(entry.mode).to.equal('mock');
    });

    it('buildPayoutEntry sets type and Scope minimum fields', () => {
      const entry = buildPayoutEntry({
        submission_id: 'sub-1',
        amount: '722',
        from: 'parent',
        to: 'tristan',
        txHash: '0xabc',
        mock: true,
        mode: 'mock',
      });
      expect(entry.type).to.equal(TYPE_PAYOUT);
      expect(entry.submission_id).to.equal('sub-1');
      expect(entry.amount).to.equal('722');
      expect(entry.from).to.equal('parent');
      expect(entry.to).to.equal('tristan');
      expect(entry.txHash).to.equal('0xabc');
      expect(entry.mock).to.equal(true);
      expect(entry.mode).to.equal('mock');
      expect(entry.ts).to.be.a('string');
    });

    it('schemas serialize via appendTypedLedgerEntry without breaking charge-style types', async () => {
      const activity = buildActivityValidatedEntry(sampleActivity({ submission_id: 'sub-ser' }));
      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: activity,
        logDir: tempLogDir,
        mode: 'mock',
      });
      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: { type: 'charge', amount: '1', mode: 'mock' },
        logDir: tempLogDir,
        mode: 'mock',
      });
      const rows = await readJournalRows('tristan', 'mock');
      expect(rows.map((r) => r.type)).to.deep.equal(['activity_validated', 'charge']);
    });

    it('isPositivePayoutAmount treats 0 / empty as false', () => {
      expect(isPositivePayoutAmount(0)).to.equal(false);
      expect(isPositivePayoutAmount('0')).to.equal(false);
      expect(isPositivePayoutAmount(0n)).to.equal(false);
      expect(isPositivePayoutAmount(null)).to.equal(false);
      expect(isPositivePayoutAmount(722)).to.equal(true);
      expect(isPositivePayoutAmount('722')).to.equal(true);
    });
  });

  describe('staging → commit (t02)', () => {
    it('commits activity_validated + payout with identical submission_id', async () => {
      const result = await stageAndCommitActivityJournal({
        wallet: 'tristan',
        activity: sampleActivity(),
        payout: { amount: '722', from: 'parent', to: 'tristan', mock: true },
        transferFn: async () => ({ txHash: '0xmocktx', mock: true }),
        logDir: tempLogDir,
        mode: 'mock',
      });

      expect(result.rolledBack).to.equal(false);
      expect(result.committed).to.equal(2);
      expect(result.entries).to.have.length(2);
      expect(result.entries[0].submission_id).to.equal(result.entries[1].submission_id);
      expect(result.entries[0].type).to.equal(TYPE_ACTIVITY_VALIDATED);
      expect(result.entries[1].type).to.equal(TYPE_PAYOUT);

      const rows = await readJournalRows('tristan', 'mock');
      expect(rows).to.have.length(2);
      expect(rows[0].submission_id).to.equal(rows[1].submission_id);
      expect(rows[0].type).to.equal(TYPE_ACTIVITY_VALIDATED);
      expect(rows[1].type).to.equal(TYPE_PAYOUT);
      expect(rows[1].txHash).to.equal('0xmocktx');
    });

    it('amount=0 / skip payout → exactly one activity_validated line', async () => {
      const before = await countCommittedJournalLines({
        wallet: 'tristan',
        logDir: tempLogDir,
        mode: 'mock',
      });
      expect(before).to.equal(0);

      let transferCalled = false;
      const result = await stageAndCommitActivityJournal({
        wallet: 'tristan',
        activity: sampleActivity({ submission_id: 'sub-zero' }),
        payout: { amount: 0, from: 'parent', to: 'tristan' },
        transferFn: async () => {
          transferCalled = true;
          return { txHash: 'should-not-run' };
        },
        logDir: tempLogDir,
        mode: 'mock',
      });

      expect(transferCalled).to.equal(false);
      expect(result.committed).to.equal(1);
      expect(result.rolledBack).to.equal(false);

      const rows = await readJournalRows('tristan', 'mock');
      expect(rows).to.have.length(1);
      expect(rows[0].type).to.equal(TYPE_ACTIVITY_VALIDATED);
      expect(rows[0].submission_id).to.equal('sub-zero');
    });

    it('staging is not visible on disk until commit (transfer runs before write)', async () => {
      let sawLinesDuringTransfer = -1;
      await stageAndCommitActivityJournal({
        wallet: 'tristan',
        activity: sampleActivity(),
        payout: { amount: '100', from: 'parent', to: 'tristan', mock: true },
        transferFn: async () => {
          sawLinesDuringTransfer = await countCommittedJournalLines({
            wallet: 'tristan',
            logDir: tempLogDir,
            mode: 'mock',
          });
          return { txHash: '0xlatetx', mock: true };
        },
        logDir: tempLogDir,
        mode: 'mock',
      });
      expect(sawLinesDuringTransfer).to.equal(0);
      const after = await countCommittedJournalLines({
        wallet: 'tristan',
        logDir: tempLogDir,
        mode: 'mock',
      });
      expect(after).to.equal(2);
    });
  });

  describe('rollback (t03)', () => {
    it('simulated transfer failure → 0 new committed journal lines', async () => {
      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: { type: 'charge', amount: '1', mode: 'mock' },
        logDir: tempLogDir,
        mode: 'mock',
      });
      const baseline = await countCommittedJournalLines({
        wallet: 'tristan',
        logDir: tempLogDir,
        mode: 'mock',
      });
      expect(baseline).to.equal(1);

      const result = await stageAndCommitActivityJournal({
        wallet: 'tristan',
        activity: sampleActivity({ submission_id: 'sub-fail' }),
        payout: { amount: '500', from: 'parent', to: 'tristan' },
        transferFn: async () => {
          throw new Error('simulated transfer failure');
        },
        logDir: tempLogDir,
        mode: 'mock',
      });

      expect(result.rolledBack).to.equal(true);
      expect(result.committed).to.equal(0);
      expect(result.entries).to.deep.equal([]);

      const after = await countCommittedJournalLines({
        wallet: 'tristan',
        logDir: tempLogDir,
        mode: 'mock',
      });
      expect(after).to.equal(baseline);

      const rows = await readJournalRows('tristan', 'mock');
      expect(rows).to.have.length(1);
      expect(rows[0].type).to.equal('charge');
      expect(rows.some((r) => r.submission_id === 'sub-fail')).to.equal(false);
    });
  });

  describe('readLastLogDate day compat (t04)', () => {
    it('new event types do not alter last day date selection', async () => {
      await appendDailyPaymentsLog({
        wallet: 'tristan',
        breakdown: [
          {
            date: '2026-09-01',
            expected: 5n,
            actual: 5n,
            match: true,
            owed: 0n,
          },
          {
            date: '2026-09-10',
            expected: 5n,
            actual: 5n,
            match: true,
            owed: 0n,
          },
        ],
        payment: null,
        logDir: tempLogDir,
        mode: 'gfl_reality',
      });

      const before = await readLastLogDate('tristan', tempLogDir);
      expect(before).to.equal('2026-09-10');

      await stageAndCommitActivityJournal({
        wallet: 'tristan',
        activity: sampleActivity({ mode: 'gfl_reality', submission_id: 'sub-day' }),
        payout: { amount: '10', from: 'parent', to: 'tristan' },
        transferFn: async () => ({ txHash: '0xday', mock: false }),
        logDir: tempLogDir,
        mode: 'gfl_reality',
      });

      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: { type: 'sweep', amount: '1', mode: 'gfl_reality' },
        logDir: tempLogDir,
        mode: 'gfl_reality',
      });
      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: { type: 'charge', amount: '2', mode: 'gfl_reality' },
        logDir: tempLogDir,
        mode: 'gfl_reality',
      });
      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: { type: 'payment', paid_total: '3', mode: 'gfl_reality' },
        logDir: tempLogDir,
        mode: 'gfl_reality',
      });

      const after = await readLastLogDate('tristan', tempLogDir);
      expect(after).to.equal('2026-09-10');

      const rows = await readJournalRows('tristan', 'gfl_reality');
      expect(rows.some((r) => r.type === TYPE_ACTIVITY_VALIDATED)).to.equal(true);
      expect(rows.some((r) => r.type === TYPE_PAYOUT)).to.equal(true);
      expect(rows.filter((r) => r.type === 'day')).to.have.length(2);
    });
  });

  describe('atomic commit (t07 / GAP-CAPYACT02-L1)', () => {
    it('appendTypedLedgerEntries writes pair in a single appendFile call', async () => {
      const appendSpy = sinon.spy(fs, 'appendFile');
      await appendTypedLedgerEntries({
        wallet: 'tristan',
        entries: [
          { type: TYPE_ACTIVITY_VALIDATED, submission_id: 'sub-atom', mode: 'mock' },
          { type: TYPE_PAYOUT, submission_id: 'sub-atom', amount: '1', mode: 'mock' },
        ],
        logDir: tempLogDir,
        mode: 'mock',
      });
      expect(appendSpy.callCount).to.equal(1);
      const payload = appendSpy.firstCall.args[1];
      expect(payload.split('\n').filter(Boolean)).to.have.length(2);

      const rows = await readJournalRows('tristan', 'mock');
      expect(rows).to.have.length(2);
      expect(rows[0].submission_id).to.equal(rows[1].submission_id);
    });

    it('simulated mid-commit appendFile fail → 0 new committed lines (no half-pair)', async () => {
      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: { type: 'charge', amount: '1', mode: 'mock' },
        logDir: tempLogDir,
        mode: 'mock',
      });
      const baseline = await countCommittedJournalLines({
        wallet: 'tristan',
        logDir: tempLogDir,
        mode: 'mock',
      });

      sinon.stub(fs, 'appendFile').rejects(new Error('simulated mid-commit I/O fail'));

      const result = await stageAndCommitActivityJournal({
        wallet: 'tristan',
        activity: sampleActivity({ submission_id: 'sub-io-fail' }),
        payout: { amount: '722', from: 'parent', to: 'tristan', mock: true },
        transferFn: async () => ({ txHash: '0xio', mock: true }),
        logDir: tempLogDir,
        mode: 'mock',
      });

      expect(result.rolledBack).to.equal(true);
      expect(result.committed).to.equal(0);
      expect(result.entries).to.deep.equal([]);

      sinon.restore();
      const after = await countCommittedJournalLines({
        wallet: 'tristan',
        logDir: tempLogDir,
        mode: 'mock',
      });
      expect(after).to.equal(baseline);

      const rows = await readJournalRows('tristan', 'mock');
      expect(rows).to.have.length(1);
      expect(rows[0].type).to.equal('charge');
      expect(rows.some((r) => r.submission_id === 'sub-io-fail')).to.equal(false);
    });
  });
});
