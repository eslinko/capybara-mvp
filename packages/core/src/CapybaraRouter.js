'use strict';

const logger = require('./lib/infrastructure/Logger');
const capybaraConfig = require('./config/index');
const { createCapybaraProvider } = require('./ProviderFactory');
const WalletRegistry = require('./WalletRegistry');
const CapyToken = require('./CapyToken');
const { CapybaraActionsManager } = require('./actions/index');

class CapybaraRouter {
  constructor() {
    this.logger = logger;
    this.config = null;
    this.provider = null;
    this.rpcManager = null;
    this.walletRegistry = null;
    this.capyToken = null;
    this.actionsManager = null;
    this.initialized = false;
  }

  /** @returns {Promise<void>} */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.logger.section('Initializing Capybara Router');

    this.config = capybaraConfig.config || capybaraConfig.reloadConfig(process.env);

    const { provider, rpcManager } = await createCapybaraProvider(this.config, this.logger);
    this.provider = provider;
    this.rpcManager = rpcManager;

    this.walletRegistry = new WalletRegistry(this.config, this.logger);
    const tokenAddress = String(this.config.token?.address ?? '').trim();
    if (tokenAddress) {
      this.capyToken = new CapyToken(
        this.provider,
        tokenAddress,
        this.walletRegistry,
        this.logger,
        { rpcManager: this.rpcManager, chainId: this.config.chainId, mode: this.config.mode }
      );
    } else {
      this.capyToken = null;
      this.logger.info('[CAPY] CapyToken skipped: CAPY_TOKEN_ADDRESS empty (action 51)');
    }

    this.actionsManager = new CapybaraActionsManager(this);
    this.initialized = true;
    this.logger.success('Capybara Router initialized successfully');
  }

  /**
   * @param {number} action
   * @returns {Promise<object>}
   */
  async route(action) {
    if (!this.initialized) {
      await this.initialize();
    }

    this.logger.info(`Routing Capybara action: ${action}`);
    try {
      const result = await this.actionsManager.executeAction(action);
      this.logger.info(`Capybara action ${action} completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(`Capybara action ${action} failed:`, error.message);
      throw error;
    }
  }

  /** @returns {number[]} */
  getAvailableActions() {
    return this.actionsManager ? this.actionsManager.getAvailableActions() : [];
  }
}

module.exports = CapybaraRouter;
