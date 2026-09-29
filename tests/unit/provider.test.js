'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const ethersModule = require('ethers');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { createCapybaraProvider, maskPrivateKey } = require('../../packages/core/src/ProviderFactory');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

describe('Capybara ProviderFactory', () => {
  const config = buildConfigFromEnv({
    CAPY_RPC_URL: 'http://127.0.0.1:8545',
    CAPY_CHAIN_ID: '999',
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

  let providerStub;
  let getNetworkStub;
  let getBlockNumberStub;
  let warnStub;
  let jsonRpcProviderStub;
  /** @type {PropertyDescriptor|undefined} */
  let jsonRpcProviderDescriptor;

  beforeEach(() => {
    providerStub = {
      getNetwork: sinon.stub(),
      getBlockNumber: sinon.stub(),
    };
    getNetworkStub = providerStub.getNetwork;
    getBlockNumberStub = providerStub.getBlockNumber;
    warnStub = sinon.stub(logger, 'warn');
    jsonRpcProviderStub = sinon.stub().returns(providerStub);
    jsonRpcProviderDescriptor = Object.getOwnPropertyDescriptor(ethersModule.ethers, 'JsonRpcProvider');
    Object.defineProperty(ethersModule.ethers, 'JsonRpcProvider', {
      configurable: true,
      value: jsonRpcProviderStub,
    });
  });

  afterEach(() => {
    if (jsonRpcProviderDescriptor) {
      Object.defineProperty(ethersModule.ethers, 'JsonRpcProvider', jsonRpcProviderDescriptor);
    }
    sinon.restore();
  });

  it('creates provider from CAPY_RPC_URL and checks connectivity', async () => {
    getNetworkStub.resolves({ chainId: 999n });
    getBlockNumberStub.resolves(42);

    const result = await createCapybaraProvider(config, logger);
    expect(result.provider).to.equal(providerStub);
    expect(result.chainId).to.equal(999);
    expect(jsonRpcProviderStub.called).to.equal(true);
  });

  it('warns on chainId mismatch without throwing', async () => {
    getNetworkStub.resolves({ chainId: 111n });
    getBlockNumberStub.resolves(1);

    await createCapybaraProvider(config, logger);
    expect(warnStub.called).to.equal(true);
    expect(warnStub.firstCall.args[0]).to.include('Chain ID mismatch');
  });

  it('maskPrivateKey does not expose full key', () => {
    const masked = maskPrivateKey('0x' + 'a'.repeat(64));
    expect(masked).to.not.include('a'.repeat(64));
    expect(masked).to.include('...');
  });
});
