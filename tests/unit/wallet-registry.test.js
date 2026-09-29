'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

describe('Capybara WalletRegistry', () => {
  const config = buildConfigFromEnv({
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
  });

  let registry;
  let debugStub;

  beforeEach(() => {
    debugStub = sinon.stub(logger, 'debug');
    registry = new WalletRegistry(config, logger);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('resolves tristan with address and privateKey', () => {
    const wallet = registry.resolve('tristan');
    expect(wallet.address).to.equal(config.tristan.address);
    expect(wallet.privateKey).to.equal(config.tristan.privateKey);
  });

  it('resolves bastian with address and privateKey', () => {
    const wallet = registry.resolve('Bastian');
    expect(wallet.address).to.equal(config.bastian.address);
    expect(wallet.privateKey).to.be.a('string');
  });

  it('resolves parent with address and privateKey', () => {
    const wallet = registry.resolve('parent');
    expect(wallet.address).to.equal(config.parent.address);
    expect(wallet.privateKey).to.equal(config.parent.privateKey);
  });

  it('throws for unknown wallet name', () => {
    expect(() => registry.resolve('unknown')).to.throw(/Unknown wallet/i);
  });

  it('does not log full private keys', () => {
    registry.resolve('tristan');
    const logText = debugStub.firstCall ? debugStub.firstCall.args.join(' ') : '';
    expect(logText).to.not.include('a'.repeat(64));
  });

  it('listChildren returns child wallets without parent', () => {
    expect(registry.listChildren()).to.deep.equal(['tristan', 'bastian']);
    expect(registry.listChildren()).to.not.include('parent');
  });
});
