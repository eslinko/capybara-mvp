'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const sinon = require('sinon');
const { ethers } = require('ethers');
const { actualByDayFromJournal } = require('../../packages/core/src/daily-payments/ndjsonLogReader');
const { reconcileDailyPayments } = require('../../packages/core/src/daily-payments/reconcileEngine');

describe('journal actual reconcile', () => {
  const periodDays = ['2026-07-01', '2026-07-02'];
  const dailyRateHuman = '5';
  const decimals = 18;
  const expectedRaw = ethers.parseUnits(dailyRateHuman, decimals);

  /** @type {string} */
  let tempLogDir;

  beforeEach(async () => {
    tempLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-journal-'));
  });

  afterEach(async () => {
    await fs.rm(tempLogDir, { recursive: true, force: true });
  });

  async function writeWallet(lines) {
    await fs.writeFile(path.join(tempLogDir, 'tristan.ndjson'), `${lines.join('\n')}\n`, 'utf8');
  }

  it('returns zeros when the prod journal is missing', async () => {
    const actual = await actualByDayFromJournal('tristan', periodDays, tempLogDir);
    expect(actual['2026-07-01']).to.equal(0n);
    expect(actual['2026-07-02']).to.equal(0n);
  });

  it('sums day.actual and payment.paid_total and ignores payment.days', async () => {
    const dayActual = 2n * 10n ** 18n;
    const paid = 3n * 10n ** 18n;
    await writeWallet([
      'not-json',
      JSON.stringify({ type: 'day', date: '2026-07-01', actual: dayActual.toString() }),
      JSON.stringify({
        type: 'payment',
        date: '2026-07-01',
        paid_total: paid.toString(),
        days: ['2026-07-01', '2026-07-02'],
      }),
      JSON.stringify({ type: 'day', date: '2026-06-01', actual: '9' }),
    ]);

    const actual = await actualByDayFromJournal('tristan', periodDays, tempLogDir);
    expect(actual['2026-07-01']).to.equal(dayActual + paid);
    expect(actual['2026-07-02']).to.equal(0n);
  });

  it('gap-only journal period owes the full daily rate and does not scan logs', async () => {
    const queryTransfers = sinon.stub().resolves([]);
    const getBlock = sinon.stub().resolves(null);
    const result = await reconcileDailyPayments({
      capyToken: { queryTransfers },
      provider: { getBlock },
      parentAddress: '0x2222222222222222222222222222222222222222',
      childAddress: '0x3333333333333333333333333333333333333333',
      dailyRateHuman,
      decimals,
      periodDays,
      actualSource: 'journal',
      wallet: 'tristan',
      logDir: tempLogDir,
    });

    expect(queryTransfers.called).to.equal(false);
    expect(getBlock.called).to.equal(false);
    expect(result.reconcileSource).to.equal('journal');
    expect(result.reconcileFallbackReason).to.equal(null);
    expect(result.breakdown[0].actual).to.equal(0n);
    expect(result.breakdown[1].actual).to.equal(0n);
    expect(result.owedTotal).to.equal(expectedRaw * 2n);
  });

  it('overlap days take actual from the journal', async () => {
    const dayActual = expectedRaw;
    await writeWallet([
      JSON.stringify({ type: 'day', date: '2026-07-01', actual: dayActual.toString() }),
    ]);
    const queryTransfers = sinon.stub().resolves([{ args: { value: 1n } }]);
    const result = await reconcileDailyPayments({
      capyToken: { queryTransfers },
      provider: { getBlock: sinon.stub().resolves(null) },
      parentAddress: '0x2222222222222222222222222222222222222222',
      childAddress: '0x3333333333333333333333333333333333333333',
      dailyRateHuman,
      decimals,
      periodDays,
      actualSource: 'journal',
      wallet: 'tristan',
      logDir: tempLogDir,
    });

    expect(queryTransfers.called).to.equal(false);
    expect(result.breakdown[0].actual).to.equal(dayActual);
    expect(result.breakdown[0].owed).to.equal(0n);
    expect(result.breakdown[1].actual).to.equal(0n);
    expect(result.breakdown[1].owed).to.equal(expectedRaw);
    expect(result.owedTotal).to.equal(expectedRaw);
  });
});
