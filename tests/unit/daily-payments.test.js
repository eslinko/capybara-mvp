'use strict';

process.env.CAPYBARA_LAZY_CONFIG = '1';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const sinon = require('sinon');
const { ethers } = require('ethers');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const DailyPaymentsAction = require('../../packages/core/src/actions/DailyPaymentsAction');
const { CapybaraActionsManager } = require('../../packages/core/src/actions/index');
const { resolvePeriod } = require('../../packages/core/src/daily-payments/periodResolver');
const { readLastLogDate, readExistingDayDates, getMockLogDir } = require('../../packages/core/src/daily-payments/ndjsonLogReader');
const { appendDailyPaymentsLog } = require('../../packages/core/src/daily-payments/ndjsonLogWriter');
const { reconcileDailyPayments } = require('../../packages/core/src/daily-payments/reconcileEngine');
const { estimateFromBlockForUtcDate, estimateToBlockForUtcDate } = require('../../packages/core/src/daily-payments/dateUtils');
const { confirmPayment } = require('../../packages/core/src/daily-payments/confirmPayment');
const RateLimitHelpers = require('../../packages/core/src/lib/infrastructure/RateLimitHelpers');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

describe('Capybara daily payments (action 2)', () => {
  const baseEnv = {
    CAPY_RPC_URL: 'http://127.0.0.1:8545',
    CAPY_CHAIN_ID: '31337',
    CAPY_MODE: 'mock',
    CAPY_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
    PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
    PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
    CAPY_DAILY_TRISTAN: '5',
    CAPY_DAILY_BASTIAN: '5',
    TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
    TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
    BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
    BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
  };

  const config = buildConfigFromEnv(baseEnv);

  /** @type {string} */
  let tempLogDir;

  beforeEach(async () => {
    tempLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-daily-'));
  });

  afterEach(async () => {
    sinon.restore();
    if (tempLogDir) {
      await fs.rm(tempLogDir, { recursive: true, force: true });
    }
  });

  describe('periodResolver', () => {
    it('defaults to today when to is missing', () => {
      const period = resolvePeriod({ today: '2026-07-01' });
      expect(period.to).to.equal('2026-07-01');
    });

    it('uses day after last log date when from missing and log exists', () => {
      const period = resolvePeriod({ lastLogDate: '2026-06-28', today: '2026-07-01' });
      expect(period.from).to.equal('2026-06-29');
      expect(period.to).to.equal('2026-07-01');
    });

    it('uses single-day window when log empty and from missing (AC #3)', () => {
      const period = resolvePeriod({ lastLogDate: null, today: '2026-07-01' });
      expect(period.from).to.equal('2026-07-01');
      expect(period.to).to.equal('2026-07-01');
      expect(period.days).to.deep.equal(['2026-07-01']);
    });

    it('returns empty period when from is after to (L3)', () => {
      const period = resolvePeriod({ lastLogDate: '2026-07-01', today: '2026-07-01' });
      expect(period.empty).to.equal(true);
      expect(period.days).to.deep.equal([]);
    });
  });

  describe('ndjsonLogReader', () => {
    it('reads last day date from append-only log', async () => {
      const wallet = 'tristan';
      const filePath = path.join(tempLogDir, `${wallet}.ndjson`);
      await fs.mkdir(tempLogDir, { recursive: true });
      await fs.writeFile(
        filePath,
        `${JSON.stringify({ type: 'day', date: '2026-06-28' })}\n${JSON.stringify({ type: 'day', date: '2026-06-30' })}\n`
      );
      const last = await readLastLogDate(wallet, tempLogDir);
      expect(last).to.equal('2026-06-30');
    });
  });

  describe('reconcileEngine', () => {
    it('computes owed_total as sum of daily shortfalls (AC #5)', async () => {
      const decimals = 18;
      const dailyRate = '5';
      const expectedRaw = ethers.parseUnits(dailyRate, decimals);

      const events = [
        {
          blockNumber: 100,
          args: { value: expectedRaw },
        },
        {
          blockNumber: 101,
          args: { value: 0n },
        },
      ];

      const provider = {
        getBlock: sinon.stub().callsFake(async (arg) => {
          if (arg === 'latest') {
            return { number: 500, timestamp: Date.parse('2026-07-02T12:00:00Z') / 1000 };
          }
          if (arg === 100) {
            return { timestamp: Date.parse('2026-07-01T12:00:00Z') / 1000 };
          }
          if (arg === 101) {
            return { timestamp: Date.parse('2026-07-02T12:00:00Z') / 1000 };
          }
          return null;
        }),
      };

      const capyToken = {
        queryTransfers: sinon.stub().resolves(events),
      };

      const result = await reconcileDailyPayments({
        capyToken,
        provider,
        parentAddress: config.parent.address,
        childAddress: config.tristan.address,
        dailyRateHuman: dailyRate,
        decimals,
        periodDays: ['2026-07-01', '2026-07-02'],
      });

      expect(result.breakdown[0].owed).to.equal(0n);
      expect(result.breakdown[1].owed).to.equal(expectedRaw);
      expect(result.owedTotal).to.equal(expectedRaw);
    });

    it('throws when getBlock returns null (L2)', async () => {
      const provider = {
        getBlock: sinon.stub().callsFake(async (arg) => {
          if (arg === 'latest') {
            return { number: 100, timestamp: Date.parse('2026-07-01T12:00:00Z') / 1000 };
          }
          if (arg === 1) {
            return null;
          }
          return null;
        }),
      };
      const capyToken = { queryTransfers: sinon.stub().resolves([{ blockNumber: 1, args: { value: 0n } }]) };

      try {
        await reconcileDailyPayments({
          capyToken,
          provider,
          parentAddress: config.parent.address,
          childAddress: config.tristan.address,
          dailyRateHuman: '5',
          decimals: 18,
          periodDays: ['2026-07-01'],
          fromBlock: 1,
        });
        expect.fail('expected null block error');
      } catch (error) {
        expect(error.message).to.match(/Block 1 not found/i);
      }
    });

    it('estimates fromBlock from period start when not provided (L1)', async () => {
      const provider = {
        getBlock: sinon.stub().callsFake(async (arg) => {
          if (arg === 'latest') {
            return { number: 1_000_000, timestamp: Date.parse('2026-07-01T12:00:00Z') / 1000 };
          }
          return { timestamp: Date.parse('2026-07-01T10:00:00Z') / 1000 };
        }),
      };
      const capyToken = {
        queryTransfers: sinon.stub().resolves([]),
      };

      await reconcileDailyPayments({
        capyToken,
        provider,
        parentAddress: config.parent.address,
        childAddress: config.tristan.address,
        dailyRateHuman: '5',
        decimals: 18,
        periodDays: ['2026-07-01'],
      });

      expect(capyToken.queryTransfers.calledOnce).to.equal(true);
      const fromBlock = capyToken.queryTransfers.firstCall.args[1];
      expect(fromBlock).to.be.a('number');
      expect(fromBlock).to.be.greaterThan(0);
    });

    it('estimates fromBlock conservatively on fast-block chain (N1)', async () => {
      const periodStart = '2026-07-01';
      const periodStartSec = Date.parse('2026-07-01T00:00:00Z') / 1000;
      const latestTimestamp = Date.parse('2026-07-01T12:00:00Z') / 1000;
      const latestNumber = 100_000;
      const secDiff = latestTimestamp - periodStartSec;
      const realSecPerBlock = 1.5;
      const trueStartBlock = Math.max(
        0,
        latestNumber - Math.floor(secDiff / realSecPerBlock)
      );

      const provider = {
        getBlock: sinon.stub().callsFake(async (arg) => {
          if (arg === 'latest') {
            return { number: latestNumber, timestamp: latestTimestamp };
          }
          return null;
        }),
      };

      const fromBlock = await estimateFromBlockForUtcDate(provider, periodStart);
      expect(fromBlock).to.be.at.most(trueStartBlock);

      const capyToken = { queryTransfers: sinon.stub().resolves([]) };
      await reconcileDailyPayments({
        capyToken,
        provider,
        parentAddress: config.parent.address,
        childAddress: config.tristan.address,
        dailyRateHuman: '5',
        decimals: 18,
        periodDays: [periodStart],
      });
      const reconcileFromBlock = capyToken.queryTransfers.firstCall.args[1];
      expect(reconcileFromBlock).to.equal(fromBlock);
      expect(reconcileFromBlock).to.be.at.most(trueStartBlock);
    });

    it('estimates toBlock from period end when toBlock defaults to latest', async () => {
      const provider = {
        getBlock: sinon.stub().callsFake(async (arg) => {
          if (arg === 'latest') {
            return { number: 1_000_000, timestamp: Date.parse('2026-07-01T12:00:00Z') / 1000 };
          }
          return null;
        }),
      };
      const capyToken = { queryTransfers: sinon.stub().resolves([]) };

      await reconcileDailyPayments({
        capyToken,
        provider,
        parentAddress: config.parent.address,
        childAddress: config.tristan.address,
        dailyRateHuman: '5',
        decimals: 18,
        periodDays: ['2026-06-17', '2026-07-01'],
      });

      expect(capyToken.queryTransfers.calledOnce).to.equal(true);
      const toBlock = capyToken.queryTransfers.firstCall.args[2];
      expect(toBlock).to.be.a('number');
      expect(toBlock).to.equal(1_000_000);
    });
  });

  describe('confirmPayment', () => {
    it('rejects non-TTY confirmation (AC #7)', async () => {
      try {
        await confirmPayment({
          owedTotalDisplay: '5 CAPY',
          walletName: 'Tristan',
          isTty: false,
          confirmFn: async () => 'да',
        });
        expect.fail('expected TTY_REQUIRED');
      } catch (error) {
        expect(error.code).to.equal('TTY_REQUIRED');
      }
    });

    it('returns false on «нет»', async () => {
      const ok = await confirmPayment({
        owedTotalDisplay: '5 CAPY',
        walletName: 'Tristan',
        isTty: true,
        confirmFn: async () => 'нет',
      });
      expect(ok).to.equal(false);
    });

    it('returns true on «да»', async () => {
      const ok = await confirmPayment({
        owedTotalDisplay: '5 CAPY',
        walletName: 'Tristan',
        isTty: true,
        confirmFn: async () => 'да',
      });
      expect(ok).to.equal(true);
    });
  });

  /**
   * @param {{ events?: object[], mode?: string }} opts
   */
  function buildRouterStub(opts = {}) {
    const walletRegistry = new WalletRegistry(config, logger);
    const decimals = 18;
    const symbol = 'CAPY';
    const dailyRate = '5';
    const expectedRaw = ethers.parseUnits(dailyRate, decimals);

    const defaultEvents = opts.events ?? [
      {
        blockNumber: 200,
        args: { value: 0n },
      },
    ];

    const provider = {
      getBlock: sinon.stub().callsFake(async (blockNumber) => {
        if (blockNumber === 'latest') {
          return { number: 1000, timestamp: Date.parse('2026-07-01T12:00:00Z') / 1000 };
        }
        if (blockNumber === 200) {
          return { timestamp: Date.parse('2026-07-01T10:00:00Z') / 1000 };
        }
        return { timestamp: Date.parse('2026-07-01T10:00:00Z') / 1000 };
      }),
    };

    const capyToken = {
      provider,
      setProvider: sinon.stub(),
      getDecimals: sinon.stub().resolves(decimals),
      getSymbol: sinon.stub().resolves(symbol),
      getBalance: sinon.stub().resolves(ethers.parseUnits('1000', decimals)),
      queryTransfers: sinon.stub().resolves(defaultEvents),
      transfer: sinon.stub().resolves({ hash: '0xdailytxhash1234567890abcdef', wait: async () => ({ status: 1 }) }),
    };

    return {
      config: {
        ...config,
        mode: opts.mode ?? 'mock',
        actualSource: opts.actualSource ?? 'blockscan',
      },
      logger,
      provider,
      rpcManager: null,
      walletRegistry,
      capyToken,
    };
  }

  it('zero owed exits without confirm or transfer (AC #9)', async () => {
    const decimals = 18;
    const expectedRaw = ethers.parseUnits('5', decimals);
    const router = buildRouterStub({
      mode: 'gfl_reality',
      events: [{ blockNumber: 200, args: { value: expectedRaw } }],
    });

    const action = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: false,
    });

    const result = await action.execute();
    expect(result.skipped).to.equal(true);
    expect(result.reason).to.equal('zero_owed');
    expect(router.capyToken.transfer.called).to.equal(false);

    const lastDate = await readLastLogDate('tristan', tempLogDir);
    expect(lastDate).to.equal('2026-07-01');
  });

  it('cancelled on «нет» does not transfer (AC #7)', async () => {
    const router = buildRouterStub();
    const action = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: true,
      confirmFn: async () => 'нет',
    });

    const result = await action.execute();
    expect(result.cancelled).to.equal(true);
    expect(router.capyToken.transfer.called).to.equal(false);
  });

  it('journal mode warns once and does not scan or add a second confirm', async () => {
    const journalLogger = {
      section: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
    };
    const router = buildRouterStub({ actualSource: 'journal' });
    router.logger = journalLogger;
    router.config.polygonscanApiKey = 'SCANNERKEY12';
    const confirmFn = sinon.stub().resolves('нет');
    const action = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: true,
      confirmFn,
    });

    const result = await action.execute();
    expect(router.capyToken.queryTransfers.called).to.equal(false);
    expect(router.provider.getBlock.called).to.equal(false);
    expect(result.reconcileSource).to.equal('journal');
    expect(result.cancelled).to.equal(true);
    expect(confirmFn.calledOnce).to.equal(true);
    const warnText = journalLogger.warn.getCalls().map((call) => String(call.args[0])).join('\n');
    expect(warnText).to.include('сверка по журналу (цепь не сканировалась; риск ручных tx на операторе)');
    const infoText = journalLogger.info.getCalls().map((call) => String(call.args[0])).join('\n');
    expect(infoText).to.not.include('сверка по журналу');
  });

  it('mock mode transfer path appends NDJSON with [MOCK] (AC #11, #12)', async () => {
    const router = buildRouterStub({ mode: 'mock' });
    const action = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: true,
      confirmFn: async () => 'да',
    });

    const result = await action.execute();
    expect(result.mock).to.equal(true);
    expect(router.capyToken.transfer.calledOnce).to.equal(true);
    expect(router.capyToken.transfer.firstCall.args[0]).to.equal('parent');

    const logPath = path.join(getMockLogDir(tempLogDir), 'tristan.ndjson');
    const content = await fs.readFile(logPath, 'utf8');
    expect(content).to.include('"type":"payment"');
    expect(content).to.include('"mock":true');
    expect(content).to.include('"period"');
    expect(content).to.include('"launched_by"');
    expect(content).to.include('"mode":"mock"');

    const prodPath = path.join(tempLogDir, 'tristan.ndjson');
    let prodExists = true;
    try {
      await fs.access(prodPath);
    } catch {
      prodExists = false;
    }
    expect(prodExists).to.equal(false);
  });

  it('gfl_reality waits for receipt on transfer (AC #8)', async () => {
    const waitStub = sinon.stub(RateLimitHelpers, 'waitForTransactionReceipt').resolves({ status: 1 });
    const router = buildRouterStub({ mode: 'gfl_reality' });
    const action = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: true,
      confirmFn: async () => 'да',
    });

    const result = await action.execute();
    expect(result.mock).to.equal(false);
    expect(waitStub.calledOnce).to.equal(true);
    expect(result.txHash).to.equal('0xdailytxhash1234567890abcdef');
  });

  it('registers action 2 in actions manager', async () => {
    const router = buildRouterStub();
    const manager = new CapybaraActionsManager(router);
    expect(manager.getAvailableActions()).to.include(2);
  });

  it('rejects when parent balance is less than owed (M1)', async () => {
    const router = buildRouterStub();
    router.capyToken.getBalance.resolves(ethers.parseUnits('1', 18));
    const confirmSpy = sinon.spy(async () => 'да');

    const action = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: true,
      confirmFn: confirmSpy,
    });

    try {
      await action.execute();
      expect.fail('expected parent balance error');
    } catch (error) {
      expect(error.message).to.match(/больше баланса родителя/i);
    }
    expect(confirmSpy.called).to.equal(false);
    expect(router.capyToken.transfer.called).to.equal(false);
  });

  it('same-day re-run after zero-owed log is graceful no-op (L3)', async () => {
    const decimals = 18;
    const expectedRaw = ethers.parseUnits('5', decimals);
    const router = buildRouterStub({
      mode: 'gfl_reality',
      events: [{ blockNumber: 200, args: { value: expectedRaw } }],
    });

    const action1 = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: false,
    });
    await action1.execute();

    const action2 = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: false,
    });
    const result = await action2.execute();
    expect(result.skipped).to.equal(true);
    expect(result.reason).to.equal('empty_period');
    expect(router.capyToken.transfer.called).to.equal(false);
  });

  it('skips duplicate day rows on NDJSON append (L4)', async () => {
    const breakdown = [
      {
        date: '2026-07-01',
        expected: ethers.parseUnits('5', 18),
        actual: 0n,
        match: false,
        owed: ethers.parseUnits('5', 18),
      },
    ];
    await appendDailyPaymentsLog({ wallet: 'tristan', breakdown, logDir: tempLogDir, mode: 'gfl_reality' });
    await appendDailyPaymentsLog({ wallet: 'tristan', breakdown, logDir: tempLogDir, mode: 'gfl_reality' });

    const dates = await readExistingDayDates('tristan', tempLogDir);
    expect(dates.size).to.equal(1);
    expect(dates.has('2026-07-01')).to.equal(true);

    const content = await fs.readFile(path.join(tempLogDir, 'tristan.ndjson'), 'utf8');
    const dayLines = content.split('\n').filter((line) => line.includes('"type":"day"'));
    expect(dayLines.length).to.equal(1);
  });

  it('(L3) mock period resolves from prod log; mock write does not advance prod readLastLogDate', async () => {
    const decimals = 18;
    const expectedRaw = ethers.parseUnits('5', decimals);
    const router = buildRouterStub({
      mode: 'mock',
      events: [{ blockNumber: 200, args: { value: expectedRaw } }],
    });

    const action = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: false,
    });

    await action.execute();
    const lastDate = await readLastLogDate('tristan', tempLogDir);
    expect(lastDate).to.equal(null);

    const mockPath = path.join(getMockLogDir(tempLogDir), 'tristan.ndjson');
    const mockContent = await fs.readFile(mockPath, 'utf8');
    expect(mockContent).to.include('"type":"day"');
  });

  it('gfl_reality payment log includes rich schema fields', async () => {
    const waitStub = sinon.stub(RateLimitHelpers, 'waitForTransactionReceipt').resolves({
      status: 1,
      blockNumber: 42,
    });
    const router = buildRouterStub({ mode: 'gfl_reality' });
    const action = new DailyPaymentsAction(router, {
      walletName: 'tristan',
      todayFn: () => '2026-07-01',
      logDir: tempLogDir,
      isTty: true,
      confirmFn: async () => 'да',
    });

    await action.execute();
    expect(waitStub.calledOnce).to.equal(true);

    const logPath = path.join(tempLogDir, 'tristan.ndjson');
    const content = await fs.readFile(logPath, 'utf8');
    expect(content).to.include('"from":"' + config.parent.address);
    expect(content).to.include('"to":"' + config.tristan.address);
    expect(content).to.include('"block":42');
    expect(content).to.include('"timestamp"');
    expect(content).to.include('"mode":"gfl_reality"');
  });
});
