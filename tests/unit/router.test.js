'use strict';

process.env.CAPYBARA_LAZY_CONFIG = '1';

const { expect } = require('chai');
const sinon = require('sinon');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { CapybaraActionsManager } = require('../../packages/core/src/actions/index');

describe('Capybara router and actions', () => {
  const config = buildConfigFromEnv({
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
  });

  /** @type {import('../../packages/core/src/CapybaraRouter')} */
  let routerStub;

  beforeEach(() => {
    routerStub = {
      config,
      walletRegistry: {
        listKnownWallets: () => ['tristan', 'bastian', 'parent'],
      },
      capyToken: {
        getSymbol: sinon.stub().resolves('CAPY'),
      },
    };
  });

  it('CapybaraActionsManager routes known action 0', async () => {
    const manager = new CapybaraActionsManager(routerStub);
    const result = await manager.executeAction(0);
    expect(result.ok).to.equal(true);
    expect(result.action).to.equal(0);
    expect(result.mode).to.equal('mock');
    expect(result.symbol).to.equal('CAPY');
  });

  it('unknown action throws with available list', async () => {
    const manager = new CapybaraActionsManager(routerStub);
    try {
      await manager.executeAction(99);
      expect.fail('should throw');
    } catch (error) {
      expect(error.message).to.match(/Unknown Capybara action: 99/);
      expect(error.message).to.include('Available actions: 0, 1, 2');
    }
  });

  it('CapybaraActionsManager registers action 1', async () => {
    const manager = new CapybaraActionsManager(routerStub);
    expect(manager.getAvailableActions()).to.deep.equal([0, 1, 2, 3, 4]);
  });

  it('CapybaraRouter.route uses actions manager when initialized', async () => {
    const CapybaraRouter = require('../../packages/core/src/CapybaraRouter');
    const router = new CapybaraRouter();

    router.config = config;
    router.provider = {};
    router.walletRegistry = routerStub.walletRegistry;
    router.capyToken = routerStub.capyToken;
    router.actionsManager = new CapybaraActionsManager(router);
    router.initialized = true;

    const result = await router.route(0);
    expect(result.ok).to.equal(true);
  });
});
