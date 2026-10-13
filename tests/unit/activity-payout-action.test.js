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
const ActivityPayoutAction = require('../../packages/core/src/actions/ActivityPayoutAction');
const {
  resolveActivityPayoutAmount,
} = require('../../packages/core/src/actions/ActivityPayoutAction');
const { CapybaraActionsManager } = require('../../packages/core/src/actions/index');
const { loadFamilyCatalog } = require('../../packages/core/src/family-catalog');
const {
  getWalletLogPath,
  resolveLogDirForMode,
} = require('../../packages/core/src/daily-payments/ndjsonLogReader');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');
const { main: cliMain } = require('../../cli/capybara');

describe('ACT-03 ActivityPayoutAction (action 4)', () => {
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

  /** @type {string} */
  let tempLogDir;

  beforeEach(async () => {
    tempLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-act03-'));
  });

  afterEach(async () => {
    sinon.restore();
    if (tempLogDir) {
      await fs.rm(tempLogDir, { recursive: true, force: true });
    }
  });

  function buildTestConfig(overrides = {}) {
    return buildConfigFromEnv({ ...baseEnv, ...overrides });
  }

  function buildRouterStub(opts = {}) {
    const config = buildTestConfig(opts.envOverrides ?? {});
    const decimals = opts.decimals ?? 8;
    const walletRegistry = new WalletRegistry(config, logger);
    const balances = {
      parent: opts.parentBalance ?? ethers.parseUnits('1000000', decimals),
      tristan: opts.childBalance ?? ethers.parseUnits('10', decimals),
    };

    const capyToken = {
      provider: { id: 'mock-provider' },
      setProvider: sinon.stub(),
      getDecimals: sinon.stub().resolves(decimals),
      getSymbol: sinon.stub().resolves('CAPY'),
      getBalance: sinon.stub().callsFake(async (addr) => {
        if (addr === config.parent.address) return balances.parent;
        return balances.tristan;
      }),
      transfer: sinon.stub().callsFake(async () => ({
        hash: '0xact4mocktx',
        wait: async () => ({ blockNumber: 77 }),
      })),
    };

    return {
      config,
      walletRegistry,
      capyToken,
      provider: { id: 'mock-provider' },
      rpcManager: null,
      logger,
    };
  }

  async function readMockRows(wallet) {
    const filePath = getWalletLogPath(wallet, resolveLogDirForMode(tempLogDir, 'mock'));
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  const baseOpts = {
    walletName: 'tristan',
    system: 'cidead',
    level: 'primaria-3',
    period: 'T1',
    subject: 'matematicas',
    activityType: 'control',
    subtype: 'controlnaya',
    metricValue: '8.5',
  };

  describe('amount resolve', () => {
    const catalog = loadFamilyCatalog();

    it('CIDEAD auto score 8.5 → score_digit_scale amount 85', () => {
      const result = resolveActivityPayoutAmount({
        catalog,
        system: 'cidead',
        activityType: 'control',
        metricValue: '8.5',
      });
      expect(result.amountHuman).to.equal('85');
      expect(result.source).to.equal('auto');
    });

    it('CIDEAD score 0 → no payout amount', () => {
      const result = resolveActivityPayoutAmount({
        catalog,
        system: 'cidead',
        activityType: 'control',
        metricValue: '0',
      });
      expect(result.amountHuman).to.equal(null);
      expect(result.source).to.equal('auto_zero');
    });

    it('RU without custom amount → clear error', () => {
      expect(() =>
        resolveActivityPayoutAmount({
          catalog,
          system: 'ru',
          activityType: 'control',
          metricValue: '90',
        })
      ).to.throw(/custom_only|CAPYBARA_AMOUNT/);
    });

    it('RU with custom amount → ok', () => {
      const result = resolveActivityPayoutAmount({
        catalog,
        system: 'ru',
        activityType: 'control',
        metricValue: '90',
        amountRaw: '50',
      });
      expect(result.amountHuman).to.equal('50');
      expect(result.source).to.equal('custom');
    });
  });

  describe('execute mock journal', () => {
    it('mock: activity_validated + payout share submission_id when amount>0', async () => {
      const router = buildRouterStub();
      const action = new ActivityPayoutAction(router, {
        ...baseOpts,
        logDir: tempLogDir,
        transferFn: async () => ({ txHash: '0xpay', mock: true }),
      });
      const result = await action.execute();
      expect(result.ok).to.equal(true);
      expect(result.committed).to.equal(2);
      expect(result.amountHuman).to.equal('85');

      const rows = await readMockRows('tristan');
      expect(rows).to.have.length(2);
      expect(rows[0].type).to.equal('activity_validated');
      expect(rows[1].type).to.equal('payout');
      expect(rows[0].submission_id).to.equal(rows[1].submission_id);
      expect(rows[0].value).to.equal('8.5');
    });

    it('score 0 → only activity_validated row', async () => {
      const router = buildRouterStub();
      let transferCalled = false;
      const action = new ActivityPayoutAction(router, {
        ...baseOpts,
        metricValue: '0',
        logDir: tempLogDir,
        transferFn: async () => {
          transferCalled = true;
          return { txHash: 'nope' };
        },
      });
      const result = await action.execute();
      expect(result.ok).to.equal(true);
      expect(result.committed).to.equal(1);
      expect(transferCalled).to.equal(false);
      const rows = await readMockRows('tristan');
      expect(rows).to.have.length(1);
      expect(rows[0].type).to.equal('activity_validated');
    });

    it('transfer fail → rollback (0 journal lines)', async () => {
      const router = buildRouterStub();
      const action = new ActivityPayoutAction(router, {
        ...baseOpts,
        logDir: tempLogDir,
        transferFn: async () => {
          throw new Error('simulated transfer failure');
        },
      });
      const result = await action.execute();
      expect(result.ok).to.equal(false);
      expect(result.rolledBack).to.equal(true);
      const rows = await readMockRows('tristan');
      expect(rows).to.have.length(0);
    });

    it('rejects non-child wallet', async () => {
      const router = buildRouterStub();
      const action = new ActivityPayoutAction(router, {
        ...baseOpts,
        walletName: 'parent',
        logDir: tempLogDir,
      });
      try {
        await action.execute();
        expect.fail('expected throw');
      } catch (error) {
        expect(String(error.message)).to.match(/tristan или bastian/);
      }
    });
  });

  describe('TTY / mock gates', () => {
    it('gfl_reality amount>0 without TTY throws TTY_REQUIRED', async () => {
      const router = buildRouterStub({ envOverrides: { CAPY_MODE: 'gfl_reality' } });
      const action = new ActivityPayoutAction(router, {
        ...baseOpts,
        logDir: tempLogDir,
        isTty: false,
        transferFn: async () => ({ txHash: '0x' }),
      });
      try {
        await action.execute();
        expect.fail('expected throw');
      } catch (error) {
        expect(error.code).to.equal('TTY_REQUIRED');
      }
      const rows = await readMockRows('tristan');
      // gfl_reality writes to prod dir under tempLogDir, not mock/
      const prodPath = getWalletLogPath('tristan', resolveLogDirForMode(tempLogDir, 'gfl_reality'));
      let prodExists = true;
      try {
        await fs.access(prodPath);
      } catch {
        prodExists = false;
      }
      expect(prodExists).to.equal(false);
      expect(rows).to.have.length(0);
    });

    it('gfl_reality cancel confirm → no journal', async () => {
      const router = buildRouterStub({ envOverrides: { CAPY_MODE: 'gfl_reality' } });
      const action = new ActivityPayoutAction(router, {
        ...baseOpts,
        logDir: tempLogDir,
        isTty: true,
        confirmFn: async () => 'нет',
        transferFn: async () => ({ txHash: '0x' }),
      });
      const result = await action.execute();
      expect(result.cancelled).to.equal(true);
      const prodPath = getWalletLogPath('tristan', resolveLogDirForMode(tempLogDir, 'gfl_reality'));
      let content = '';
      try {
        content = await fs.readFile(prodPath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      expect(content.trim()).to.equal('');
    });
  });

  describe('manager registry', () => {
    it('action map includes 4', () => {
      const router = buildRouterStub();
      const mgr = new CapybaraActionsManager(router);
      expect(mgr.getAvailableActions()).to.deep.equal([0, 1, 2, 3, 4, 51, 52]);
    });
  });
});

describe('ACT-03 CLI precheck action 4', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    sinon.restore();
  });

  it('exits when CAPYBARA_WALLET missing for action 4', async () => {
    process.env.CAPYBARA_ACTION = '4';
    delete process.env.CAPYBARA_WALLET;
    const exitStub = sinon.stub(process, 'exit');
    const errorStub = sinon.stub(require('../../packages/core/src/lib/infrastructure/Logger'), 'error');
    // avoid constructing router
    exitStub.callsFake(() => {
      throw new Error('exit');
    });
    try {
      await cliMain();
      expect.fail('expected exit');
    } catch (error) {
      expect(String(error.message)).to.match(/exit/);
    }
    expect(exitStub.calledWith(1)).to.equal(true);
    expect(errorStub.called).to.equal(true);
    const msg = errorStub.firstCall.args.join(' ');
    expect(msg).to.match(/CAPYBARA_WALLET/);
  });

  it('exits when wallet is parent for action 4', async () => {
    process.env.CAPYBARA_ACTION = '4';
    process.env.CAPYBARA_WALLET = 'parent';
    const exitStub = sinon.stub(process, 'exit');
    const errorStub = sinon.stub(require('../../packages/core/src/lib/infrastructure/Logger'), 'error');
    exitStub.callsFake(() => {
      throw new Error('exit');
    });
    try {
      await cliMain();
      expect.fail('expected exit');
    } catch (error) {
      expect(String(error.message)).to.match(/exit/);
    }
    expect(exitStub.calledWith(1)).to.equal(true);
    const msg = errorStub.firstCall.args.join(' ');
    expect(msg).to.match(/tristan or bastian/);
  });
});
