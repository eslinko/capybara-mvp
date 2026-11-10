'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { getChildAdvancePath } = require('../../packages/core/src/advance/advancePath');
const { acquireAdvanceFileLock, releaseAdvanceFileLock } = require('../../packages/core/src/advance/advanceLock');
const { projectAdvanceRemainder, readAdvanceEvents } = require('../../packages/core/src/advance/advanceProjection');
const { appendAdvanceEvent } = require('../../packages/core/src/advance/advanceWriter');

const SCOPE = {
  mode: 'mock',
  chainId: '31337',
  token: '0x1111111111111111111111111111111111111111',
  pool: '0x2222222222222222222222222222222222222222',
};

const PROD_SCOPE = { ...SCOPE, mode: 'gfl_reality' };

describe('advance journal', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-advance-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function advanceRoot() {
    return path.join(tempRoot, 'advance');
  }

  it('keeps the issue amount open until settle or forgive', async () => {
    const issued = await appendAdvanceEvent({
      child: 'tristan',
      scope: SCOPE,
      advanceId: 'adv-1',
      type: 'issue',
      amount: '1500000000',
      advanceRoot: advanceRoot(),
      eventId: 'evt-issue',
      recordedAt: '2026-11-10T12:00:00.000Z',
    });
    expect(issued.event.schema_version).to.equal(1);
    expect(issued.event.amount_unit).to.equal('token_raw');
    expect(issued.event.remainder_after).to.equal('1500000000');

    const intent = await appendAdvanceEvent({
      child: 'tristan',
      scope: SCOPE,
      advanceId: 'adv-1',
      type: 'settle-intent',
      advanceRoot: advanceRoot(),
      eventId: 'evt-intent',
    });
    expect(intent.event.remainder_after).to.equal('1500000000');
    const pending = await appendAdvanceEvent({
      child: 'tristan',
      scope: SCOPE,
      advanceId: 'adv-1',
      type: 'settle-pending',
      advanceRoot: advanceRoot(),
      eventId: 'evt-pending',
    });
    expect(pending.event.remainder_after).to.equal('1500000000');

    const events = await readAdvanceEvents(issued.filePath);
    expect(projectAdvanceRemainder(events, 'adv-1').toString()).to.equal('1500000000');

    const settled = await appendAdvanceEvent({
      child: 'tristan',
      scope: SCOPE,
      advanceId: 'adv-1',
      type: 'settle-settled',
      advanceRoot: advanceRoot(),
      eventId: 'evt-settled',
    });
    expect(settled.event.remainder_after).to.equal('0');

    const forgivenFile = await appendAdvanceEvent({
      child: 'tristan',
      scope: SCOPE,
      advanceId: 'adv-2',
      type: 'issue',
      amount: '400000000',
      advanceRoot: advanceRoot(),
      eventId: 'evt-issue-2',
    });
    await appendAdvanceEvent({
      child: 'tristan',
      scope: SCOPE,
      advanceId: 'adv-2',
      type: 'forgive',
      advanceRoot: advanceRoot(),
      eventId: 'evt-forgive',
    });
    const after = await readAdvanceEvents(forgivenFile.filePath);
    expect(projectAdvanceRemainder(after, 'adv-2').toString()).to.equal('0');
    expect(projectAdvanceRemainder(after, 'adv-1').toString()).to.equal('0');
  });

  it('isolates mock from prod and one child scope from another', () => {
    const mockTristan = getChildAdvancePath({
      child: 'tristan',
      scope: SCOPE,
      advanceRoot: advanceRoot(),
    });
    const prodTristan = getChildAdvancePath({
      child: 'tristan',
      scope: PROD_SCOPE,
      advanceRoot: advanceRoot(),
    });
    const mockBastian = getChildAdvancePath({
      child: 'bastian',
      scope: SCOPE,
      advanceRoot: advanceRoot(),
    });
    const otherPool = getChildAdvancePath({
      child: 'tristan',
      scope: { ...SCOPE, pool: '0x3333333333333333333333333333333333333333' },
      advanceRoot: advanceRoot(),
    });
    expect(mockTristan).to.include(`${path.sep}mock${path.sep}`);
    expect(prodTristan).to.not.include(`${path.sep}mock${path.sep}`);
    expect(mockTristan).to.not.equal(prodTristan);
    expect(mockTristan).to.not.equal(mockBastian);
    expect(mockTristan).to.not.equal(otherPool);
    expect(mockBastian).to.match(/bastian\.ndjson$/);
  });

  it('does not change debt or payment bytes', async () => {
    const debtFile = path.join(tempRoot, 'debt', 'tristan.ndjson');
    const paymentFile = path.join(tempRoot, 'payment', 'tristan.ndjson');
    await fs.mkdir(path.dirname(debtFile), { recursive: true });
    await fs.mkdir(path.dirname(paymentFile), { recursive: true });
    const debtBytes = Buffer.from('{"type":"create"}\n');
    const paymentBytes = Buffer.from('{"type":"charge"}\n');
    await fs.writeFile(debtFile, debtBytes);
    await fs.writeFile(paymentFile, paymentBytes);

    const written = await appendAdvanceEvent({
      child: 'tristan',
      scope: SCOPE,
      advanceId: 'adv-1',
      type: 'issue',
      amount: '10',
      advanceRoot: advanceRoot(),
      eventId: 'evt-1',
    });

    expect(Buffer.compare(await fs.readFile(debtFile), debtBytes)).to.equal(0);
    expect(Buffer.compare(await fs.readFile(paymentFile), paymentBytes)).to.equal(0);
    expect(written.filePath.startsWith(advanceRoot())).to.equal(true);
    expect(written.filePath).to.not.include(`${path.sep}debt${path.sep}`);
  });

  it('throws on a corrupt line and refuses a second writer while the lock is held', async () => {
    const filePath = getChildAdvancePath({
      child: 'tristan',
      scope: SCOPE,
      advanceRoot: advanceRoot(),
    });
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{"advance_id":"adv-1"}\nnot-json\n', 'utf8');
    try {
      await readAdvanceEvents(filePath);
      expect.fail('corrupt line should throw');
    } catch (error) {
      expect(error.code).to.equal('EADVANCE_CORRUPT');
      expect(error.lineNumber).to.equal(2);
    }

    await fs.writeFile(filePath, '', 'utf8');
    await acquireAdvanceFileLock(filePath);
    try {
      await appendAdvanceEvent({
        child: 'tristan',
        scope: SCOPE,
        advanceId: 'adv-1',
        type: 'issue',
        amount: '10',
        advanceRoot: advanceRoot(),
      });
      expect.fail('lock should be held');
    } catch (error) {
      expect(error.code).to.equal('ELOCKED');
    } finally {
      await releaseAdvanceFileLock(filePath);
    }
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).to.equal('');
  });
});
