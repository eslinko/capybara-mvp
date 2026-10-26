'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { CAPYBARA_ROOT } = require('../../packages/core/src/env-path');
const {
  DEBT_LOG_ROOT,
  getChildDebtPath,
  getDebtLockPath,
  resolveDebtDirForMode,
} = require('../../packages/core/src/debt/debtPath');
const { acquireDebtFileLock, releaseDebtFileLock } = require('../../packages/core/src/debt/debtLock');
const { projectDebtRemainderFromFile } = require('../../packages/core/src/debt/debtProjection');
const { appendDebtEvent, DEBT_SCHEMA_VERSION } = require('../../packages/core/src/debt/debtWriter');

const SCOPE = {
  mode: 'mock',
  chainId: '6281971',
  token: '0xabc',
  pool: '0xdef',
};

describe('debt journal and remainder projection', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-debt-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function debtRoot() {
    return path.join(tempRoot, 'logs', 'capybara', 'debt');
  }

  it('resolves the debt root under CAPYBARA_ROOT and names the child file', () => {
    expect(DEBT_LOG_ROOT).to.equal(path.join(CAPYBARA_ROOT, 'logs', 'capybara', 'debt'));
    const filePath = getChildDebtPath({
      child: 'Bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      mode: 'mock',
    });
    expect(filePath.endsWith(`${path.sep}bastian.ndjson`)).to.equal(true);
    expect(filePath.includes(`${path.sep}debt${path.sep}`)).to.equal(true);
  });

  it('keeps mock and prod journals in different directories', () => {
    const prod = getChildDebtPath({
      child: 'bastian',
      scope: { ...SCOPE, mode: 'gfl_reality' },
      debtRoot: debtRoot(),
      mode: 'gfl_reality',
    });
    const mock = getChildDebtPath({
      child: 'bastian',
      scope: SCOPE,
      debtRoot: debtRoot(),
      mode: 'mock',
    });
    expect(prod.includes(`${path.sep}mock${path.sep}`)).to.equal(false);
    expect(mock.includes(`${path.sep}mock${path.sep}`)).to.equal(true);
    expect(prod).to.not.equal(mock);
    expect(resolveDebtDirForMode(debtRoot(), 'gfl_reality')).to.equal(debtRoot());
    expect(resolveDebtDirForMode(debtRoot(), 'mock')).to.equal(path.join(debtRoot(), 'mock'));
  });

  it('does not mix journals when chain, token, or pool changes', () => {
    const base = getChildDebtPath({ child: 'bastian', scope: SCOPE, debtRoot: debtRoot() });
    const otherChain = getChildDebtPath({
      child: 'bastian',
      scope: { ...SCOPE, chainId: '1' },
      debtRoot: debtRoot(),
    });
    const otherToken = getChildDebtPath({
      child: 'bastian',
      scope: { ...SCOPE, token: '0xaaa' },
      debtRoot: debtRoot(),
    });
    const otherPool = getChildDebtPath({
      child: 'bastian',
      scope: { ...SCOPE, pool: '0xbbb' },
      debtRoot: debtRoot(),
    });
    expect(new Set([base, otherChain, otherToken, otherPool]).size).to.equal(4);
  });

  it('appends a debt event without touching the payment journal', async () => {
    const paymentPath = path.join(tempRoot, 'logs', 'capybara', 'bastian.ndjson');
    await fs.mkdir(path.dirname(paymentPath), { recursive: true });
    await fs.writeFile(paymentPath, 'SENTINEL\n', 'utf8');

    const { filePath, event } = await appendDebtEvent({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      type: 'create',
      amount: '100',
      debtRoot: debtRoot(),
      recordedAt: '2026-10-26T20:00:00.000Z',
      eventId: 'evt-create',
    });

    expect(filePath).to.not.equal(paymentPath);
    expect(await fs.readFile(paymentPath, 'utf8')).to.equal('SENTINEL\n');
    expect(event.schema_version).to.equal(DEBT_SCHEMA_VERSION);
    expect(event.event_id).to.equal('evt-create');
    expect(event.debt_id).to.equal('debt-1');
    expect(event.child).to.equal('bastian');
    expect(event.scope).to.deep.equal(SCOPE);
    expect(event.timestamps.recorded_at).to.equal('2026-10-26T20:00:00.000Z');
    expect(event.type).to.equal('create');
    expect(event.amounts.amount).to.equal('100');
    expect(event.remainder_before).to.equal('0');
    expect(event.remainder_after).to.equal('100');
  });

  it('rejects a second mkdir lock while the first is held', async () => {
    const filePath = getChildDebtPath({ child: 'bastian', scope: SCOPE, debtRoot: debtRoot() });
    await acquireDebtFileLock(filePath);
    try {
      await expect(acquireDebtFileLock(filePath)).to.be.rejectedWith(/debt file lock held/);
      const held = await fs.stat(getDebtLockPath(filePath));
      expect(held.isDirectory()).to.equal(true);
    } finally {
      await releaseDebtFileLock(filePath);
    }
  });

  it('projects create, fine, and forgive with integer arithmetic', async () => {
    const base = {
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      debtRoot: debtRoot(),
    };
    const created = await appendDebtEvent({ ...base, type: 'create', amount: 100n });
    const fined = await appendDebtEvent({ ...base, type: 'fine', amount: '10' });
    const forgiven = await appendDebtEvent({ ...base, type: 'forgive', amount: '25' });
    const filePath = created.filePath;

    expect(fined.event.remainder_before).to.equal('100');
    expect(fined.event.remainder_after).to.equal('110');
    expect(forgiven.event.remainder_before).to.equal('110');
    expect(forgiven.event.remainder_after).to.equal('85');
    expect(await projectDebtRemainderFromFile(filePath, 'debt-1')).to.equal(85n);
    expect(String(85n).includes('.')).to.equal(false);
  });

  it('does not reduce the remainder on bare intent or pending', async () => {
    const base = {
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      debtRoot: debtRoot(),
    };
    await appendDebtEvent({ ...base, type: 'create', amount: '100' });
    await appendDebtEvent({ ...base, type: 'fine', amount: '10' });
    await appendDebtEvent({ ...base, type: 'forgive', amount: '25' });
    const intent = await appendDebtEvent({ ...base, type: 'repay-intent', amount: '40' });
    const pending = await appendDebtEvent({ ...base, type: 'repay-pending', amount: '40' });
    const settled = await appendDebtEvent({ ...base, type: 'repay-settled', amount: '30' });

    expect(intent.event.remainder_after).to.equal('85');
    expect(pending.event.remainder_after).to.equal('85');
    expect(settled.event.remainder_after).to.equal('55');
    expect(await projectDebtRemainderFromFile(intent.filePath, 'debt-1')).to.equal(55n);
  });

  it('rejects a decimal amount instead of coercing it through float', async () => {
    await expect(appendDebtEvent({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      type: 'create',
      amount: '1.5',
      debtRoot: debtRoot(),
    })).to.be.rejectedWith(/integer string/);
  });

  it('throws on a corrupt line and does not return a partial remainder', async () => {
    const { filePath } = await appendDebtEvent({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      type: 'create',
      amount: '100',
      debtRoot: debtRoot(),
    });
    await fs.appendFile(filePath, '{not-json\n', 'utf8');
    try {
      await projectDebtRemainderFromFile(filePath, 'debt-1');
      expect.fail('corrupt line must throw');
    } catch (error) {
      expect(error.code).to.equal('EDEBT_CORRUPT');
      expect(error.lineNumber).to.equal(2);
    }
  });

  it('keeps a write in one scope from appearing in another scope file', async () => {
    const written = await appendDebtEvent({
      child: 'bastian',
      scope: SCOPE,
      debtId: 'debt-1',
      type: 'create',
      amount: '80',
      debtRoot: debtRoot(),
    });
    const otherPath = getChildDebtPath({
      child: 'bastian',
      scope: { ...SCOPE, chainId: '1' },
      debtRoot: debtRoot(),
    });
    expect(otherPath).to.not.equal(written.filePath);
    await expect(fs.access(otherPath)).to.be.rejectedWith(/ENOENT|no such file/i);
    expect(await projectDebtRemainderFromFile(otherPath, 'debt-1')).to.equal(0n);
    expect(await projectDebtRemainderFromFile(written.filePath, 'debt-1')).to.equal(80n);
  });
});
