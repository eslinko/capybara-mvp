'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const CapyToken = require('../../packages/core/src/CapyToken');
const RpcProviderManager = require('../../packages/core/src/lib/infrastructure/RpcProviderManager');
const RateLimitHelpers = require('../../packages/core/src/lib/infrastructure/RateLimitHelpers');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

describe('Capybara CapyToken', () => {
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

  let mockContract;
  let capyToken;
  let walletRegistry;

  beforeEach(() => {
    walletRegistry = new WalletRegistry(config, logger);
    mockContract = {
      balanceOf: sinon.stub().resolves(1000n),
      decimals: sinon.stub().resolves(18),
      symbol: sinon.stub().resolves('CAPY'),
      connect: sinon.stub(),
      transfer: sinon.stub().resolves({ hash: '0xabc' }),
      filters: { Transfer: sinon.stub().returns('transfer-filter') },
      queryFilter: sinon.stub().resolves([]),
    };
    mockContract.connect.returns(mockContract);

    capyToken = new CapyToken(
      { getNetwork: sinon.stub() },
      config.token.address,
      walletRegistry,
      logger,
      { mode: 'gfl_reality' }
    );
    capyToken.contract = mockContract;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('reads balanceOf/decimals/symbol via minimal ABI contract', async () => {
    expect(await capyToken.getBalance(config.tristan.address)).to.equal(1000n);
    expect(await capyToken.getDecimals()).to.equal(18);
    expect(await capyToken.getSymbol()).to.equal('CAPY');
  });

  it('transfer delegates to connected contract transfer', async () => {
    await capyToken.transfer('tristan', config.parent.address, 100n);
    expect(mockContract.connect.calledOnce).to.equal(true);
    expect(mockContract.transfer.calledOnce).to.equal(true);
  });

  it('queryTransfers delegates to contract.queryFilter', async () => {
    await capyToken.queryTransfers({}, 0, 100);
    expect(mockContract.queryFilter.callCount).to.equal(3);
  });

  it('queryTransfers splits wide ranges into chunked queryFilter calls', async () => {
    capyToken.provider = {
      getBlock: sinon.stub().withArgs('latest').resolves({ number: 5000 }),
    };

    await capyToken.queryTransfers({}, 0, 5000);

    expect(mockContract.queryFilter.callCount).to.equal(101);
    expect(mockContract.queryFilter.getCall(0).args.slice(1)).to.deep.equal([0, 49]);
    expect(mockContract.queryFilter.getCall(100).args.slice(1)).to.deep.equal([5000, 5000]);
  });

  it('retries read on rate limit for chainId 137 with rpcManager', async () => {
    const rpcManager = new RpcProviderManager('polygon', 137, logger, 'https://primary.example');
    const createProviderStub = sinon.stub(rpcManager, 'createProvider');
    const altProvider = { id: 'alt-provider' };
    createProviderStub.returns(altProvider);

    const rateLimitError = new Error('call rate limit exhausted');
    mockContract.balanceOf.onFirstCall().rejects(rateLimitError);
    mockContract.balanceOf.onSecondCall().resolves(500n);

    sinon.stub(RateLimitHelpers, 'executeWithRateLimitRetry').callsFake(async (operation, options) => {
      try {
        return await operation();
      } catch (error) {
        if (options.ethersUtils && options.rpcManager) {
          const nextEndpoint = options.rpcManager.getNextEndpoint();
          options.ethersUtils.provider = options.rpcManager.createProvider(nextEndpoint);
        }
        return operation();
      }
    });

    const token137 = new CapyToken(
      { id: 'primary-provider' },
      config.token.address,
      walletRegistry,
      logger,
      { rpcManager, chainId: 137 }
    );
    token137.contract = mockContract;

    const balance = await token137.getBalance(config.tristan.address);
    expect(balance).to.equal(500n);
    expect(mockContract.balanceOf.callCount).to.equal(2);
    expect(createProviderStub.called).to.equal(true);
    expect(token137.provider).to.equal(altProvider);
  });
});
