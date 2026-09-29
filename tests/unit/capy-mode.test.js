'use strict';

process.env.CAPYBARA_LAZY_CONFIG = '1';

const { expect } = require('chai');
const sinon = require('sinon');
const { ethers } = require('ethers');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const CapyToken = require('../../packages/core/src/CapyToken');
const SweepToParentAction = require('../../packages/core/src/actions/SweepToParentAction');
const { CapybaraActionsManager, GFL_REALITY_BANNER } = require('../../packages/core/src/actions/index');
const RateLimitHelpers = require('../../packages/core/src/lib/infrastructure/RateLimitHelpers');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

describe('Capybara CAPY_MODE', () => {
  const baseEnv = {
    CAPY_RPC_URL: 'http://127.0.0.1:8545',
    CAPY_CHAIN_ID: '31337',
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

  afterEach(() => {
    sinon.restore();
  });

  it('defaults config.mode to mock when CAPY_MODE unset (AC #8a)', () => {
    const config = buildConfigFromEnv(baseEnv);
    expect(config.mode).to.equal('mock');
  });

  describe('CapyToken.transfer', () => {
    let mockContract;
    let capyToken;
    let walletRegistry;
    let infoSpy;

    beforeEach(() => {
      walletRegistry = new WalletRegistry(buildConfigFromEnv(baseEnv), logger);
      mockContract = {
        balanceOf: sinon.stub().resolves(1000n),
        decimals: sinon.stub().resolves(18),
        symbol: sinon.stub().resolves('CAPY'),
        connect: sinon.stub(),
        transfer: sinon.stub().resolves({ hash: '0xreal' }),
      };
      mockContract.connect.returns(mockContract);
      infoSpy = sinon.spy(logger, 'info');
    });

    it('mock mode does not call contract transfer (AC #8b)', async () => {
      capyToken = new CapyToken({}, baseEnv.CAPY_TOKEN_ADDRESS, walletRegistry, logger, {
        mode: 'mock',
      });
      capyToken.contract = mockContract;

      const tx = await capyToken.transfer('tristan', baseEnv.PARENT_ADDRESS, 100n);

      expect(mockContract.connect.called).to.equal(false);
      expect(mockContract.transfer.called).to.equal(false);
      expect(tx.hash).to.match(/^0xmock/);
      expect(infoSpy.calledWithMatch(/\[MOCK\] would transfer/)).to.equal(true);
    });

    it('gfl_reality mode sends transfer via contract (AC #8c)', async () => {
      capyToken = new CapyToken({}, baseEnv.CAPY_TOKEN_ADDRESS, walletRegistry, logger, {
        mode: 'gfl_reality',
      });
      capyToken.contract = mockContract;

      await capyToken.transfer('tristan', baseEnv.PARENT_ADDRESS, 100n);

      expect(mockContract.connect.calledOnce).to.equal(true);
      expect(mockContract.transfer.calledOnce).to.equal(true);
    });

    it('typo mode does not call contract transfer (fail-safe L1)', async () => {
      capyToken = new CapyToken({}, baseEnv.CAPY_TOKEN_ADDRESS, walletRegistry, logger, {
        mode: 'typo',
      });
      capyToken.contract = mockContract;

      const tx = await capyToken.transfer('tristan', baseEnv.PARENT_ADDRESS, 100n);

      expect(mockContract.connect.called).to.equal(false);
      expect(mockContract.transfer.called).to.equal(false);
      expect(tx.hash).to.match(/^0xmock/);
      expect(infoSpy.calledWithMatch(/\[MOCK\] would transfer/)).to.equal(true);
    });

    it('reads are unchanged in mock mode (AC #6)', async () => {
      capyToken = new CapyToken({}, baseEnv.CAPY_TOKEN_ADDRESS, walletRegistry, logger, {
        mode: 'mock',
      });
      capyToken.contract = mockContract;

      expect(await capyToken.getBalance(baseEnv.TRISTAN_ADDRESS)).to.equal(1000n);
      expect(await capyToken.getDecimals()).to.equal(18);
      expect(await capyToken.getSymbol()).to.equal('CAPY');
      expect(mockContract.balanceOf.calledOnce).to.equal(true);
      expect(mockContract.decimals.calledOnce).to.equal(true);
      expect(mockContract.symbol.calledOnce).to.equal(true);
    });
  });

  describe('SweepToParentAction mock path', () => {
    let waitReceiptStub;
    let infoSpy;

    beforeEach(() => {
      waitReceiptStub = sinon.stub(RateLimitHelpers, 'waitForTransactionReceipt');
      infoSpy = sinon.spy(logger, 'info');
    });

    it('mock sweep completes without waitForTransactionReceipt hang (AC #8e)', async () => {
      const config = buildConfigFromEnv({ ...baseEnv, CAPY_MODE: 'mock' });
      const walletRegistry = new WalletRegistry(config, logger);
      const balanceBefore = ethers.parseUnits('100', 18);

      const capyToken = new CapyToken({}, config.token.address, walletRegistry, logger, {
        mode: 'mock',
      });
      const mockContract = {
        balanceOf: sinon.stub().resolves(balanceBefore),
        decimals: sinon.stub().resolves(18),
        symbol: sinon.stub().resolves('CAPY'),
        connect: sinon.stub(),
        transfer: sinon.stub(),
      };
      mockContract.connect.returns(mockContract);
      capyToken.contract = mockContract;

      const router = {
        config,
        logger,
        provider: {},
        rpcManager: null,
        walletRegistry,
        capyToken,
      };

      const sweep = new SweepToParentAction(router, { walletName: 'tristan', amountHuman: '10' });
      const result = await sweep.execute();

      expect(result.ok).to.equal(true);
      expect(result.mock).to.equal(true);
      expect(result.balanceAfter).to.equal(balanceBefore.toString());
      expect(waitReceiptStub.called).to.equal(false);
      expect(infoSpy.calledWithMatch(/\[MOCK\] Пропускаю ожидание on-chain receipt/)).to.equal(true);
    });
  });

  describe('CapybaraActionsManager', () => {
    it('health check returns mode (AC #7)', async () => {
      const config = buildConfigFromEnv({ ...baseEnv, CAPY_MODE: 'mock' });
      const router = {
        config,
        walletRegistry: { listKnownWallets: () => ['tristan', 'bastian', 'parent'] },
        capyToken: { getSymbol: sinon.stub().resolves('CAPY') },
        logger,
      };
      const manager = new CapybaraActionsManager(router);
      const result = await manager.executeAction(0);
      expect(result.mode).to.equal('mock');
    });

    it('logs gfl_reality banner before action 1 (AC #4)', async () => {
      const config = buildConfigFromEnv({ ...baseEnv, CAPY_MODE: 'gfl_reality' });
      const warnSpy = sinon.spy(logger, 'warn');
      const balance = ethers.parseUnits('10', 18);
      const router = {
        config,
        logger,
        provider: {},
        rpcManager: null,
        walletRegistry: new WalletRegistry(config, logger),
        capyToken: {
          provider: {},
          setProvider: sinon.stub(),
          getDecimals: sinon.stub().resolves(18),
          getSymbol: sinon.stub().resolves('CAPY'),
          getBalance: sinon.stub().resolves(balance),
          transfer: sinon.stub().resolves({ hash: '0xabc', wait: async () => ({ status: 1 }) }),
        },
      };
      sinon.stub(RateLimitHelpers, 'waitForTransactionReceipt').resolves({ status: 1 });

      process.env.CAPYBARA_WALLET = 'tristan';
      process.env.CAPYBARA_AMOUNT = '1';

      const manager = new CapybaraActionsManager(router);
      await manager.executeAction(1);

      expect(warnSpy.calledWith(GFL_REALITY_BANNER)).to.equal(true);

      delete process.env.CAPYBARA_WALLET;
      delete process.env.CAPYBARA_AMOUNT;
    });
  });
});
