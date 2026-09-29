'use strict';

process.env.CAPYBARA_LAZY_CONFIG = '1';

const { expect } = require('chai');
const sinon = require('sinon');
const { ethers } = require('ethers');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const SweepToParentAction = require('../../packages/core/src/actions/SweepToParentAction');
const { CapybaraActionsManager } = require('../../packages/core/src/actions/index');
const RateLimitHelpers = require('../../packages/core/src/lib/infrastructure/RateLimitHelpers');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

describe('Capybara SweepToParentAction (action 1)', () => {
  const config = buildConfigFromEnv({
    CAPY_RPC_URL: 'http://127.0.0.1:8545',
    CAPY_CHAIN_ID: '31337',
    CAPY_MODE: 'gfl_reality',
    CAPY_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
    PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
    PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
    CAPY_DAILY_TRISTAN: '5',
    CAPY_DAILY_BASTIAN: '5',
    TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
    TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
    BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
    BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
  });

  /** @type {import('sinon').SinonStub} */
  let waitReceiptStub;
  /** @type {import('sinon').SinonSpy} */
  let infoSpy;
  /** @type {import('sinon').SinonSpy} */
  let sectionSpy;

  beforeEach(() => {
    waitReceiptStub = sinon.stub(RateLimitHelpers, 'waitForTransactionReceipt').resolves({ status: 1 });
    infoSpy = sinon.spy(logger, 'info');
    sectionSpy = sinon.spy(logger, 'section');
  });

  afterEach(() => {
    sinon.restore();
  });

  /**
   * @param {{ balance?: bigint, balanceAfter?: bigint, decimals?: number, symbol?: string }} opts
   */
  function buildRouterStub(opts = {}) {
    const balanceBefore = opts.balance ?? ethers.parseUnits('100', 18);
    const balanceAfter = opts.balanceAfter ?? 0n;
    const decimals = opts.decimals ?? 18;
    const symbol = opts.symbol ?? 'CAPY';
    const walletRegistry = new WalletRegistry(config, logger);

    const capyToken = {
      provider: { id: 'mock-provider' },
      setProvider: sinon.stub(),
      getDecimals: sinon.stub().resolves(decimals),
      getSymbol: sinon.stub().resolves(symbol),
      getBalance: sinon.stub(),
      transfer: sinon.stub().resolves({ hash: '0xsweephash1234567890abcdef' }),
    };

    capyToken.getBalance.onCall(0).resolves(balanceBefore);
    capyToken.getBalance.onCall(1).resolves(balanceAfter);

    return {
      config,
      logger,
      provider: capyToken.provider,
      rpcManager: null,
      walletRegistry,
      capyToken,
    };
  }

  it('transfers specified human amount to parent and logs friendly Russian messages', async () => {
    const router = buildRouterStub({ balance: ethers.parseUnits('100', 18), balanceAfter: ethers.parseUnits('90', 18) });
    const expectedRaw = ethers.parseUnits('10', 18);
    const sweep = new SweepToParentAction(router, { walletName: 'tristan', amountHuman: '10' });

    const result = await sweep.execute();

    expect(result.ok).to.equal(true);
    expect(result.txHash).to.equal('0xsweephash1234567890abcdef');
    expect(result.amountRaw).to.equal(expectedRaw.toString());
    expect(result.amountHuman).to.equal('10.0');
    expect(router.capyToken.transfer.calledOnce).to.equal(true);
    expect(router.capyToken.transfer.firstCall.args[0]).to.equal('tristan');
    expect(router.capyToken.transfer.firstCall.args[1]).to.equal(config.parent.address);
    expect(router.capyToken.transfer.firstCall.args[2]).to.equal(expectedRaw);
    expect(waitReceiptStub.calledOnce).to.equal(true);

    expect(sectionSpy.calledWith(SweepToParentAction.SECTION_TITLE)).to.equal(true);
    expect(infoSpy.calledWithMatch(/👛 Кошелёк: tristan/)).to.equal(true);
    expect(infoSpy.calledWithMatch(/📤 Перевожу: 10 CAPY/)).to.equal(true);

    const successLog = infoSpy.getCalls().find((call) =>
      String(call.args[0]).includes('✅ Готово! Переведено 10 CAPY')
    );
    expect(successLog).to.exist;
    expect(successLog.args[1].amountRaw).to.equal(expectedRaw.toString());
    expect(successLog.args[1].txHash).to.equal('0xsweephash1234567890abcdef');
    expect(successLog.args[1].balanceAfterRaw).to.equal(ethers.parseUnits('90', 18).toString());
  });

  it('sweeps full balance when CAPYBARA_AMOUNT omitted and marks full-balance suffix', async () => {
    const fullBalance = ethers.parseUnits('42.5', 18);
    const router = buildRouterStub({ balance: fullBalance, balanceAfter: 0n });
    const sweep = new SweepToParentAction(router, { walletName: 'bastian' });

    const result = await sweep.execute();

    expect(result.amountRaw).to.equal(fullBalance.toString());
    expect(router.capyToken.transfer.firstCall.args[2]).to.equal(fullBalance);
    expect(result.balanceAfter).to.equal('0');
    expect(infoSpy.calledWithMatch(/\(вся сумма\)/)).to.equal(true);
  });

  it('returns skipped result when balance is zero without sending transfer', async () => {
    const router = buildRouterStub({ balance: 0n, balanceAfter: 0n });
    const sweep = new SweepToParentAction(router, { walletName: 'tristan', amountHuman: '1' });

    const result = await sweep.execute();

    expect(result.skipped).to.equal(true);
    expect(result.reason).to.equal('zero_balance');
    expect(router.capyToken.transfer.called).to.equal(false);
    expect(infoSpy.calledWithMatch(/🫙 Нечего переводить — баланс 0 CAPY/)).to.equal(true);
  });

  it('returns requested_zero_amount when explicit amount is 0 with positive balance', async () => {
    const router = buildRouterStub({ balance: ethers.parseUnits('100', 18) });
    const sweep = new SweepToParentAction(router, { walletName: 'tristan', amountHuman: '0' });

    const result = await sweep.execute();

    expect(result.skipped).to.equal(true);
    expect(result.reason).to.equal('requested_zero_amount');
    expect(result.message).to.match(/Указана сумма 0 CAPY/);
    expect(result.message).to.match(/баланс: 100 CAPY/);
    expect(router.capyToken.transfer.called).to.equal(false);
  });

  it('throws when amount exceeds balance before transfer', async () => {
    const router = buildRouterStub({ balance: ethers.parseUnits('5', 18) });
    const sweep = new SweepToParentAction(router, { walletName: 'tristan', amountHuman: '10' });

    try {
      await sweep.execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/🚫 Сумма .* больше баланса/);
    }
    expect(router.capyToken.transfer.called).to.equal(false);
  });

  it('throws for negative amount before transfer', async () => {
    const router = buildRouterStub({ balance: ethers.parseUnits('100', 18) });
    const sweep = new SweepToParentAction(router, { walletName: 'tristan', amountHuman: '-5' });

    try {
      await sweep.execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/не может быть отрицательной/);
    }
    expect(router.capyToken.transfer.called).to.equal(false);
  });

  it('throws for non-numeric amount before transfer', async () => {
    const router = buildRouterStub({ balance: ethers.parseUnits('100', 18) });
    const sweep = new SweepToParentAction(router, { walletName: 'tristan', amountHuman: 'abc' });

    try {
      await sweep.execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/Некорректная сумма «abc»/);
    }
    expect(router.capyToken.transfer.called).to.equal(false);
  });

  it('throws for unknown wallet name', async () => {
    const router = buildRouterStub();
    const sweep = new SweepToParentAction(router, { walletName: 'unknown' });

    try {
      await sweep.execute();
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/Unknown wallet/);
    }
  });

  it('CapybaraActionsManager routes action 1 via env wallet and amount', async () => {
    const router = buildRouterStub({ balance: ethers.parseUnits('50', 18), balanceAfter: ethers.parseUnits('40', 18) });
    process.env.CAPYBARA_WALLET = 'tristan';
    process.env.CAPYBARA_AMOUNT = '10';

    const manager = new CapybaraActionsManager(router);
    const result = await manager.executeAction(1);

    expect(result.ok).to.equal(true);
    expect(result.action).to.equal(1);
    expect(result.txHash).to.equal('0xsweephash1234567890abcdef');

    delete process.env.CAPYBARA_WALLET;
    delete process.env.CAPYBARA_AMOUNT;
  });
});
