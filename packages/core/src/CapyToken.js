'use strict';

const crypto = require('crypto');
const { ethers } = require('ethers');
const { MINIMAL_ERC20_ABI } = require('./erc20-minimal-abi');
const { maskPrivateKey } = require('./ProviderFactory');
const { executeWithRateLimitRetry } = require('./lib/infrastructure/RateLimitHelpers');
const { queryFilterInBlockChunks } = require('./logQueryChunks');

class CapyToken {
  /**
   * @param {import('ethers').Provider} provider
   * @param {string} tokenAddress
   * @param {import('./WalletRegistry')} walletRegistry
   * @param {import('../utils/Logger')} [logger]
   * @param {{ rpcManager?: import('../utils/RpcProviderManager')|null, chainId?: number|null, mode?: 'mock'|'gfl_reality' }} [options]
   */
  constructor(provider, tokenAddress, walletRegistry, logger = null, options = {}) {
    this.provider = provider;
    this.tokenAddress = tokenAddress;
    this.walletRegistry = walletRegistry;
    this.logger = logger;
    this.rpcManager = options.rpcManager || null;
    this.chainId = options.chainId ?? null;
    this.mode = options.mode ?? 'mock';
    this._providerHolder = { provider: this.provider };
    this.contract = new ethers.Contract(tokenAddress, MINIMAL_ERC20_ABI, provider);
  }

  /**
   * @param {import('ethers').Provider} provider
   */
  setProvider(provider) {
    this.provider = provider;
    this._providerHolder.provider = provider;
    this.contract = new ethers.Contract(this.tokenAddress, MINIMAL_ERC20_ABI, provider);
  }

  /**
   * Polygon mainnet retry only (chainId 137 and an rpcManager).
   * Any other chain calls the operation directly. Do not widen this gate:
   * that would change Polygon retry semantics.
   * @returns {boolean}
   */
  _usesRpcRetry() {
    return Boolean(this.rpcManager && Number(this.chainId) === 137);
  }

  /**
   * @template T
   * @param {string} operationName
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async _withRpcRetry(operationName, fn) {
    if (!this._usesRpcRetry()) {
      return fn();
    }

    const result = await executeWithRateLimitRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 1000,
      rpcManager: this.rpcManager,
      ethersUtils: this._providerHolder,
      operationName,
    });

    if (this._providerHolder.provider !== this.provider) {
      this.setProvider(this._providerHolder.provider);
    }

    return result;
  }

  /**
   * @param {string} address
   * @returns {Promise<bigint>}
   */
  async getBalance(address) {
    return this._withRpcRetry('CapyToken.getBalance', () => this.contract.balanceOf(address));
  }

  /** @returns {Promise<number>} */
  async getDecimals() {
    const decimals = await this._withRpcRetry('CapyToken.getDecimals', () => this.contract.decimals());
    return Number(decimals);
  }

  /** @returns {Promise<string>} */
  async getSymbol() {
    return this._withRpcRetry('CapyToken.getSymbol', () => this.contract.symbol());
  }

  /**
   * @param {string} fromWallet
   * @param {string} toAddr
   * @param {bigint|string|number} amount
   * @returns {{ hash: string, wait: () => Promise<{ status: number, transactionHash: string }> }}
   */
  _createMockTransferResponse(fromWallet, toAddr, amount) {
    const hashInput = `${fromWallet}:${toAddr}:${amount.toString()}`;
    const hash = `0xmock${crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 56)}`;
    return {
      hash,
      wait: async () => ({ status: 1, transactionHash: hash }),
    };
  }

  /**
   * @param {string} fromWallet
   * @param {string} toAddr
   * @param {bigint|string|number} amount
   * @returns {Promise<import('ethers').ContractTransactionResponse>}
   */
  async transfer(fromWallet, toAddr, amount) {
    const walletInfo = this.walletRegistry.resolve(fromWallet);
    if (!walletInfo.privateKey) {
      throw new Error(`Wallet "${fromWallet}" has no private key for signing`);
    }

    if (this.mode !== 'gfl_reality') {
      const decimals = await this.getDecimals();
      const symbol = await this.getSymbol();
      const amountRaw = typeof amount === 'bigint' ? amount : BigInt(amount);
      const human = ethers.formatUnits(amountRaw, decimals);
      if (this.logger) {
        this.logger.info(
          `[MOCK] would transfer ${human} ${symbol} (raw ${amountRaw.toString()}) from ${fromWallet} to ${toAddr} key=${maskPrivateKey(walletInfo.privateKey)}`
        );
      }
      return /** @type {import('ethers').ContractTransactionResponse} */ (
        this._createMockTransferResponse(fromWallet, toAddr, amountRaw)
      );
    }

    if (this.logger) {
      this.logger.debug(
        `[CAPY] CapyToken.transfer from=${fromWallet} key=${maskPrivateKey(walletInfo.privateKey)} to=${toAddr}`
      );
    }

    const signer = new ethers.Wallet(walletInfo.privateKey, this.provider);
    const contractWithSigner = this.contract.connect(signer);
    return this._withRpcRetry('CapyToken.transfer', () => contractWithSigner.transfer(toAddr, amount));
  }

  /**
   * @param {object} filter
   * @param {number|string} fromBlock
   * @param {number|string} toBlock
   * @returns {Promise<Array>}
   */
  async queryTransfers(filter = {}, fromBlock, toBlock) {
    const from = filter.from ?? null;
    const to = filter.to ?? null;
    const eventFilter = this.contract.filters.Transfer(from, to);

    const { events } = await queryFilterInBlockChunks({
      contract: this.contract,
      eventFilter,
      fromBlock,
      toBlock,
      provider: this.provider,
      queryChunk: (chunkFrom, chunkTo) =>
        this._withRpcRetry(
          `CapyToken.queryTransfers[${chunkFrom}-${chunkTo}]`,
          () => this.contract.queryFilter(eventFilter, chunkFrom, chunkTo)
        ),
    });

    return events;
  }
}

module.exports = CapyToken;
