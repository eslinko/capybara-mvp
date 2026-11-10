'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  EXAMPLE_LIMITS_PATH,
  loadAdvanceLimitsFile,
  resolveChildAdvanceLimits,
} = require('../../packages/core/src/advance/advanceLimits');
const { checkNewAdvance } = require('../../packages/core/src/advance/advanceAvailability');
const { appendAdvanceEvent } = require('../../packages/core/src/advance/advanceWriter');

const SCOPE = {
  mode: 'mock',
  chainId: '31337',
  token: '0x1111111111111111111111111111111111111111',
  pool: '0x2222222222222222222222222222222222222222',
};

const OPEN_ONE = {
  maxOutstanding: { kind: 'disabled' },
  maxOpenAdvances: { kind: 'amount', amount: 1n },
};

describe('advance limits', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-adv-limits-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function advanceRoot() {
    return path.join(tempRoot, 'advance');
  }

  async function writeLimits(body) {
    const filePath = path.join(tempRoot, 'advance-limits.json');
    await fs.writeFile(filePath, JSON.stringify(body), 'utf8');
    return filePath;
  }

  it('denies a second open advance and records the violation when override has a reason', async () => {
    await appendAdvanceEvent({
      child: 'tristan',
      scope: SCOPE,
      advanceId: 'adv-1',
      type: 'issue',
      amount: '10',
      advanceRoot: advanceRoot(),
      eventId: 'evt-1',
    });
    const denied = await checkNewAdvance({
      child: 'tristan',
      scope: SCOPE,
      advanceRoot: advanceRoot(),
      newAdvanceId: 'adv-2',
      newAmount: '5',
      limits: OPEN_ONE,
    });
    expect(denied.allowed).to.equal(false);
    expect(denied.reasons.map((reason) => reason.code)).to.deep.equal(['max_open']);
    expect(denied.overrideApplied).to.equal(false);

    const allowed = await checkNewAdvance({
      child: 'tristan',
      scope: SCOPE,
      advanceRoot: advanceRoot(),
      newAdvanceId: 'adv-2',
      newAmount: '5',
      limits: OPEN_ONE,
      override: { reason: 'family exception' },
    });
    expect(allowed.allowed).to.equal(true);
    expect(allowed.overrideApplied).to.equal(true);
    expect(allowed.violations.map((item) => item.code)).to.deep.equal(['max_open']);
  });

  it('rejects a missing file, invalid JSON, and a cap that is neither an amount nor disabled', async () => {
    const missing = path.join(tempRoot, 'nope.json');
    try {
      await loadAdvanceLimitsFile(missing);
      expect.fail('missing file');
    } catch (error) {
      expect(error.code).to.equal('EADVANCE_LIMITS');
      expect(error.message).to.include('missing');
    }

    const broken = path.join(tempRoot, 'broken.json');
    await fs.writeFile(broken, '{', 'utf8');
    try {
      await loadAdvanceLimitsFile(broken);
      expect.fail('bad json');
    } catch (error) {
      expect(error.message).to.include('not valid JSON');
    }

    const filePath = await writeLimits({ max_advance_outstanding: { disabled: true } });
    try {
      await loadAdvanceLimitsFile(filePath);
      expect.fail('missing max_open');
    } catch (error) {
      expect(error.message).to.include('max_open_advances');
    }

    const both = await writeLimits({
      max_open_advances: { disabled: true, amount: 1 },
      max_advance_outstanding: { disabled: true },
    });
    try {
      await loadAdvanceLimitsFile(both);
      expect.fail('both');
    } catch (error) {
      expect(error.message).to.include('cannot be both');
    }
  });

  it('keeps the example out of debt-limits and lets env replace a disabled cap', async () => {
    const example = await fs.readFile(EXAMPLE_LIMITS_PATH, 'utf8');
    const parsed = JSON.parse(example);
    expect(parsed.max_open_advances.disabled).to.equal(true);
    expect(parsed.max_advance_outstanding.disabled).to.equal(true);
    expect(example).to.not.match(/private|secret|0x[a-fA-F0-9]{64}/);
    const debtExample = await fs.readFile(
      path.join(path.dirname(EXAMPLE_LIMITS_PATH), 'debt-limits.example.json'),
      'utf8',
    );
    expect(debtExample).to.not.include('max_open_advances');
    expect(debtExample).to.not.include('max_advance_outstanding');
    const ignore = await fs.readFile(path.join(path.dirname(EXAMPLE_LIMITS_PATH), '..', '.gitignore'), 'utf8');
    expect(ignore).to.include('config/advance-limits.json');

    const filePath = await writeLimits({
      max_open_advances: { disabled: true },
      max_advance_outstanding: { disabled: true },
    });
    const loaded = await loadAdvanceLimitsFile(filePath);
    const limits = resolveChildAdvanceLimits(loaded, 'tristan', {
      CAPY_ADVANCE_MAX_OPEN: '1',
    });
    expect(limits.maxOpenAdvances).to.deep.equal({ kind: 'amount', amount: 1n });
    expect(limits.maxOutstanding.kind).to.equal('disabled');
  });
});
