'use strict';

const { maskPrivateKey } = require('./ProviderFactory');

const KNOWN_WALLETS = ['tristan', 'bastian', 'parent'];
const CHILD_WALLETS = ['tristan', 'bastian'];

class WalletRegistry {
  /**
   * @param {object} config
   * @param {import('../utils/Logger')} [logger]
   */
  constructor(config, logger = null) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * @param {string} name
   * @returns {{ address: string, privateKey?: string }}
   */
  resolve(name) {
    const key = String(name).toLowerCase().trim();
    if (!KNOWN_WALLETS.includes(key)) {
      throw new Error(
        `Unknown wallet "${name}". Known wallets: ${KNOWN_WALLETS.join(', ')}`
      );
    }

    if (key === 'parent') {
      const parent = this.config.parent;
      if (!parent?.address || !parent?.privateKey) {
        throw new Error('Wallet "parent" is not configured');
      }
      if (this.logger) {
        this.logger.debug(
          `[CAPY] Resolved wallet "parent" address=${parent.address} key=${maskPrivateKey(parent.privateKey)}`
        );
      }
      return {
        address: parent.address,
        privateKey: parent.privateKey,
      };
    }

    const wallet = this.config[key];
    if (!wallet?.address || !wallet?.privateKey) {
      throw new Error(`Wallet "${name}" is not configured`);
    }

    if (this.logger) {
      this.logger.debug(
        `[CAPY] Resolved wallet "${key}" address=${wallet.address} key=${maskPrivateKey(wallet.privateKey)}`
      );
    }

    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
    };
  }

  /**
   * @returns {string[]}
   */
  listKnownWallets() {
    return [...KNOWN_WALLETS];
  }

  /**
   * Child wallets only (excludes parent) — fixed order for split remainder policy.
   * @returns {string[]}
   */
  listChildren() {
    return [...CHILD_WALLETS];
  }
}

module.exports = WalletRegistry;
