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
const ChargeToPoolAction = require('../../packages/core/src/actions/ChargeToPoolAction');
const SweepToParentAction = require('../../packages/core/src/actions/SweepToParentAction');
const { CapybaraActionsManager } = require('../../packages/core/src/actions/index');
const { allocateShares, parseSplitSpec } = require('../../packages/core/src/charge-pool/splitAllocation');
const { appendTypedLedgerEntry } = require('../../packages/core/src/daily-payments/ndjsonLogWriter');
const { readLastLogDate, getMockLogDir } = require('../../packages/core/src/daily-payments/ndjsonLogReader');
const RateLimitHelpers = require('../../packages/core/src/lib/infrastructure/RateLimitHelpers');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

describe('Capybara charge to pool (action 3)', () => {
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

  /**
   * @param {Record<string, string>} [overrides]
   */
  function buildTestConfig(overrides = {}) {
    return buildConfigFromEnv({ ...baseEnv, ...overrides });
  }

  /** @type {string} */
  let tempLogDir;

  beforeEach(async () => {
    tempLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-charge-'));
    sinon.stub(RateLimitHelpers, 'waitForTransactionReceipt').resolves({ status: 1, blockNumber: 42 });
  });

  afterEach(async () => {
    sinon.restore();
    if (tempLogDir) {
      await fs.rm(tempLogDir, { recursive: true, force: true });
    }
  });

  /**
   * @param {{
   *   balances?: Record<string, bigint>,
   *   transferFailsFor?: string|null,
   *   decimals?: number,
   * }} opts
   */
  function buildRouterStub(opts = {}) {
    const config = buildTestConfig(opts.envOverrides ?? {});
    const decimals = opts.decimals ?? 8;
    const balances = {
      tristan: opts.balances?.tristan ?? ethers.parseUnits('100', decimals),
      bastian: opts.balances?.bastian ?? ethers.parseUnits('100', decimals),
      parent: opts.balances?.parent ?? ethers.parseUnits('1000', decimals),
    };
    const walletRegistry = new WalletRegistry(config, logger);

    const capyToken = {
      provider: { id: 'mock-provider' },
      setProvider: sinon.stub(),
      getDecimals: sinon.stub().resolves(decimals),
      getSymbol: sinon.stub().resolves('CAPY'),
      getBalance: sinon.stub().callsFake(async (address) => {
        if (address === config.tristan.address) return balances.tristan;
        if (address === config.bastian.address) return balances.bastian;
        if (address === config.parent.address) return balances.parent;
        return 0n;
      }),
      transfer: sinon.stub().callsFake(async (walletName, to, amount) => {
        if (opts.transferFailsFor && walletName === opts.transferFailsFor) {
          throw new Error(`mock transfer failed for ${walletName}`);
        }
        return {
          hash: `0xcharge${walletName}${amount}`,
          wait: async () => ({ status: 1, blockNumber: 42 }),
        };
      }),
    };

    return {
      config,
      logger,
      provider: capyToken.provider,
      rpcManager: null,
      walletRegistry,
      capyToken,
    };
  }

  async function readJournalRows(wallet, mode = 'mock') {
    const logDir = mode === 'mock' ? getMockLogDir(tempLogDir) : tempLogDir;
    const filePath = path.join(logDir, `${wallet}.ndjson`);
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  describe('splitAllocation', () => {
    it('allocates equal shares with remainder to first child', () => {
      const shares = allocateShares(101n, ['tristan', 'bastian']);
      expect(shares[0]).to.deep.equal({ wallet: 'tristan', amountRaw: 51n });
      expect(shares[1]).to.deep.equal({ wallet: 'bastian', amountRaw: 50n });
      const sum = shares.reduce((acc, row) => acc + row.amountRaw, 0n);
      expect(sum).to.equal(101n);
    });

    it('allocates percent split with remainder to first child', () => {
      const shares = allocateShares(100n, ['tristan', 'bastian'], 'tristan:60,bastian:40');
      expect(shares[0].wallet).to.equal('tristan');
      expect(shares[0].amountRaw).to.equal(60n);
      expect(shares[1].amountRaw).to.equal(40n);
    });

    it('throws for invalid split spec', () => {
      expect(() => parseSplitSpec('tristan:60,bastian:50', ['tristan', 'bastian'])).to.throw(
        /must sum to 100/
      );
      expect(() => parseSplitSpec('unknown:100', ['tristan', 'bastian'])).to.throw(/unknown wallet/i);
    });
  });

  describe('appendTypedLedgerEntry', () => {
    it('writes charge row without breaking readLastLogDate', async () => {
      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: { type: 'day', date: '2026-06-28' },
        logDir: tempLogDir,
        mode: 'gfl_reality',
      });
      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: { type: 'charge', amount: '10', txHash: '0xabc' },
        logDir: tempLogDir,
        mode: 'gfl_reality',
      });
      const last = await readLastLogDate('tristan', tempLogDir);
      expect(last).to.equal('2026-06-28');
    });
  });

  describe('single', () => {
    it('charges full amount child to parent on confirm', async () => {
      const router = buildRouterStub();
      const confirmFn = sinon.stub().resolves('да');
      const action = new ChargeToPoolAction(router, {
        walletName: 'tristan',
        amountHuman: '10',
        confirmFn,
        isTty: true,
        logDir: tempLogDir,
      });

      const result = await action.execute();

      expect(result.ok).to.equal(true);
      expect(result.amountRaw).to.equal(ethers.parseUnits('10', 8).toString());
      expect(router.capyToken.transfer.calledOnce).to.equal(true);
      expect(confirmFn.calledOnce).to.equal(true);
      expect(confirmFn.firstCall.args[0]).to.match(/списание.*в пул/i);
      expect(confirmFn.firstCall.args[0]).to.not.match(/на Tristan/i);
      const rows = await readJournalRows('tristan');
      expect(rows.some((row) => row.type === 'charge')).to.equal(true);
      expect(rows.find((row) => row.type === 'charge').mock).to.equal(true);
    });

    it('partial charge records shortfall when balance is insufficient', async () => {
      const decimals = 8;
      const router = buildRouterStub({
        balances: { tristan: ethers.parseUnits('5', decimals) },
      });
      const confirmFn = sinon.stub().resolves('да');
      const action = new ChargeToPoolAction(router, {
        walletName: 'tristan',
        amountHuman: '10',
        confirmFn,
        isTty: true,
        logDir: tempLogDir,
      });

      const result = await action.execute();

      expect(result.shortfallRaw).to.equal(ethers.parseUnits('5', decimals).toString());
      const chargeRow = (await readJournalRows('tristan')).find((row) => row.type === 'charge');
      expect(chargeRow.shortfall).to.equal(ethers.parseUnits('5', decimals).toString());
    });

    it('cancels without transfer when operator answers no', async () => {
      const router = buildRouterStub();
      const confirmFn = sinon.stub().resolves('нет');
      const action = new ChargeToPoolAction(router, {
        walletName: 'tristan',
        amountHuman: '10',
        confirmFn,
        isTty: true,
        logDir: tempLogDir,
      });

      const result = await action.execute();

      expect(result.cancelled).to.equal(true);
      expect(router.capyToken.transfer.called).to.equal(false);
    });

    it('throws TTY_REQUIRED in gfl_reality without TTY', async () => {
      const router = buildRouterStub({ envOverrides: { CAPY_MODE: 'gfl_reality' } });
      const action = new ChargeToPoolAction(router, {
        walletName: 'tristan',
        amountHuman: '10',
        isTty: false,
        logDir: tempLogDir,
      });

      try {
        await action.execute();
        expect.fail('should throw');
      } catch (error) {
        expect(error.code).to.equal('TTY_REQUIRED');
      }
    });
  });

  describe('all', () => {
    it('splits equal across children and logs batch_id', async () => {
      const router = buildRouterStub();
      const confirmFn = sinon.stub().resolves('да');
      const action = new ChargeToPoolAction(router, {
        walletName: 'all',
        amountHuman: '100',
        confirmFn,
        isTty: true,
        logDir: tempLogDir,
      });

      const result = await action.execute();

      expect(result.ok).to.equal(true);
      expect(result.passed).to.equal(2);
      expect(router.capyToken.transfer.callCount).to.equal(2);
      const tristanRows = await readJournalRows('tristan');
      const chargeRow = tristanRows.find((row) => row.type === 'charge');
      expect(chargeRow.batch_id).to.be.a('string');
      expect(chargeRow.split.mode).to.equal('equal');
    });

    it('splits by CAPYBARA_SPLIT percents', async () => {
      const router = buildRouterStub();
      const confirmFn = sinon.stub().resolves('да');
      const action = new ChargeToPoolAction(router, {
        walletName: 'all',
        amountHuman: '100',
        splitRaw: 'tristan:60,bastian:40',
        confirmFn,
        isTty: true,
        logDir: tempLogDir,
      });

      await action.execute();

      const tristanCharge = (await readJournalRows('tristan')).find((row) => row.type === 'charge');
      const bastianCharge = (await readJournalRows('bastian')).find((row) => row.type === 'charge');
      expect(tristanCharge.amount).to.equal(ethers.parseUnits('60', 8).toString());
      expect(bastianCharge.amount).to.equal(ethers.parseUnits('40', 8).toString());
      expect(tristanCharge.split.mode).to.equal('percent');
    });

    it('blocks all mode when preflight detects short balance', async () => {
      const decimals = 8;
      const router = buildRouterStub({
        balances: {
          tristan: ethers.parseUnits('30', decimals),
          bastian: ethers.parseUnits('100', decimals),
        },
      });
      const confirmFn = sinon.stub().resolves('да');
      const action = new ChargeToPoolAction(router, {
        walletName: 'all',
        amountHuman: '100',
        confirmFn,
        isTty: true,
        logDir: tempLogDir,
      });

      try {
        await action.execute();
        expect.fail('should throw');
      } catch (error) {
        expect(error.message).to.match(/Предпроверка не пройдена/);
        expect(error.message).to.match(/tristan/i);
      }
      expect(router.capyToken.transfer.called).to.equal(false);
      expect(confirmFn.called).to.equal(false);
    });

    it('continues other children when one transfer fails', async () => {
      const router = buildRouterStub({ transferFailsFor: 'tristan' });
      const confirmFn = sinon.stub().resolves('да');
      const action = new ChargeToPoolAction(router, {
        walletName: 'all',
        amountHuman: '100',
        confirmFn,
        isTty: true,
        logDir: tempLogDir,
      });

      const result = await action.execute();

      expect(result.ok).to.equal(false);
      expect(result.passed).to.equal(1);
      expect(result.failed).to.equal(1);
      const bastianRows = await readJournalRows('bastian');
      expect(bastianRows.some((row) => row.type === 'charge')).to.equal(true);
      const tristanLogPath = path.join(getMockLogDir(tempLogDir), 'tristan.ndjson');
      let tristanLogMissing = false;
      try {
        await fs.access(tristanLogPath);
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          tristanLogMissing = true;
        } else {
          throw error;
        }
      }
      expect(tristanLogMissing).to.equal(true);
    });
  });

  describe('dispatch', () => {
    it('routes action 3 via env and rejects unknown wallet', async () => {
      const router = buildRouterStub();
      const manager = new CapybaraActionsManager(router);
      expect(manager.getAvailableActions()).to.include(3);

      process.env.CAPYBARA_WALLET = 'tristan';
      process.env.CAPYBARA_AMOUNT = '10';
      const confirmFn = sinon.stub().resolves('да');
      const charge = new ChargeToPoolAction(router, {
        walletName: process.env.CAPYBARA_WALLET,
        amountHuman: process.env.CAPYBARA_AMOUNT,
        confirmFn,
        isTty: true,
        logDir: tempLogDir,
      });
      const result = await charge.execute();
      expect(result.action).to.equal(3);

      const bad = new ChargeToPoolAction(router, {
        walletName: 'parent',
        amountHuman: '10',
        confirmFn,
        isTty: true,
        logDir: tempLogDir,
      });
      try {
        await bad.execute();
        expect.fail('should throw');
      } catch (error) {
        expect(error.message).to.match(/Неизвестный кошелёк/);
      }

      delete process.env.CAPYBARA_WALLET;
      delete process.env.CAPYBARA_AMOUNT;
    });
  });

  describe('sweep journal retrofit', () => {
    it('writes type sweep row after successful mock sweep', async () => {
      const decimals = 8;
      const router = buildRouterStub({
        balances: { tristan: ethers.parseUnits('50', decimals) },
      });
      const sweep = new SweepToParentAction(router, {
        walletName: 'tristan',
        amountHuman: '10',
        logDir: tempLogDir,
      });

      await sweep.execute();

      const rows = await readJournalRows('tristan');
      const sweepRow = rows.find((row) => row.type === 'sweep');
      expect(sweepRow).to.exist;
      expect(sweepRow.mock).to.equal(true);
      expect(sweepRow.amount).to.equal(ethers.parseUnits('10', decimals).toString());
    });

    it('readLastLogDate still reads day rows when sweep rows present', async () => {
      await appendTypedLedgerEntry({
        wallet: 'tristan',
        entry: { type: 'day', date: '2026-07-01' },
        logDir: tempLogDir,
        mode: 'gfl_reality',
      });
      const decimals = 8;
      const router = buildRouterStub({
        envOverrides: { CAPY_MODE: 'gfl_reality' },
        balances: { tristan: ethers.parseUnits('50', decimals) },
      });
      const sweep = new SweepToParentAction(router, {
        walletName: 'tristan',
        amountHuman: '10',
        logDir: tempLogDir,
      });
      await sweep.execute();
      const last = await readLastLogDate('tristan', tempLogDir);
      expect(last).to.equal('2026-07-01');
    });
  });
});
