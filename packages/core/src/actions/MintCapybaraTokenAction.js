'use strict';

const { ethers } = require('ethers');
const { parseAmountHuman } = require('../charge-pool/splitAllocation');
const { appendTypedLedgerEntry } = require('../daily-payments/ndjsonLogWriter');
const {
  loadCapybaraTokenArtifact,
  getDeployerWallet,
  confirmGflReality,
} = require('../contract-ops');

/** Story decimals. Do not use the 18 fallback from ActivityPayoutAction. */
const MINT_DECIMALS = 8;

/**
 * Additional mint of CapybaraToken. Mock does not broadcast.
 */
class MintCapybaraTokenAction {
  /**
   * @param {object} router
   * @param {{
   *   loadArtifact?: typeof loadCapybaraTokenArtifact,
   *   resolveWallet?: typeof getDeployerWallet,
   *   confirm?: typeof confirmGflReality,
   *   Contract?: typeof ethers.Contract,
   *   isTty?: boolean,
   *   confirmFn?: (question: string) => Promise<string>,
   *   amountHuman?: string,
   *   toAddress?: string,
   *   appendJournal?: typeof appendTypedLedgerEntry,
   *   logDir?: string,
   * }} [options]
   */
  constructor(router, options = {}) {
    this.router = router;
    this.logger = router?.logger ?? null;
    this.loadArtifact = options.loadArtifact ?? loadCapybaraTokenArtifact;
    this.resolveWallet = options.resolveWallet ?? getDeployerWallet;
    this.confirm = options.confirm ?? confirmGflReality;
    this.Contract = options.Contract ?? ethers.Contract;
    this.isTty = options.isTty;
    this.confirmFn = options.confirmFn;
    this.appendJournal = options.appendJournal ?? appendTypedLedgerEntry;
    this.logDir = options.logDir;
    this._amountOverride = Object.prototype.hasOwnProperty.call(options, 'amountHuman')
      ? options.amountHuman
      : undefined;
    this._toOverride = Object.prototype.hasOwnProperty.call(options, 'toAddress')
      ? options.toAddress
      : undefined;
  }

  /**
   * @param {{
   *   mode: string,
   *   tokenAddress: string,
   *   to: string,
   *   amountHuman: string,
   *   amountWei: bigint,
   *   txHash: string|null,
   *   deployer: string,
   *   mock: boolean,
   * }} fields
   * @returns {object}
   */
  _journalShape(fields) {
    return {
      type: 'token_minted',
      ts: new Date().toISOString(),
      mode: fields.mode,
      token: fields.tokenAddress,
      to: fields.to,
      amountHuman: fields.amountHuman,
      amountWei: fields.amountWei.toString(),
      txHash: fields.txHash ?? null,
      mock: fields.mock,
      deployer: fields.deployer,
    };
  }

  /**
   * @param {object} entry
   * @param {string} deployer
   * @param {string} mode
   * @returns {Promise<void>}
   */
  async _writeJournal(entry, deployer, mode) {
    const params = {
      wallet: deployer,
      entry,
      mode,
    };
    if (this.logDir) {
      params.logDir = this.logDir;
    }
    await this.appendJournal(params);
  }

  /**
   * @returns {string}
   */
  _tokenAddress() {
    const address = String(this.router?.config?.token?.address ?? '').trim();
    if (!address) {
      throw new Error('🚫 CAPY_TOKEN_ADDRESS не задан — укажите адрес контракта');
    }
    if (!ethers.isAddress(address)) {
      throw new Error(`🚫 CAPY_TOKEN_ADDRESS не является адресом (получено «${address}»)`);
    }
    return address;
  }

  /**
   * @returns {{ amountHuman: string, amountWei: bigint }}
   */
  _resolveAmount() {
    const raw = this._amountOverride !== undefined
      ? this._amountOverride
      : process.env.CAPYBARA_AMOUNT;
    const amountHuman = raw == null ? '' : String(raw).trim();
    if (!amountHuman) {
      throw new Error('🚫 CAPYBARA_AMOUNT не задан — укажите сумму минта');
    }
    const amountWei = parseAmountHuman(amountHuman, MINT_DECIMALS);
    return { amountHuman, amountWei };
  }

  /**
   * @param {string} deployerAddress
   * @returns {string}
   */
  _resolveTo(deployerAddress) {
    const raw = this._toOverride !== undefined
      ? this._toOverride
      : process.env.CAPYBARA_TO;
    const trimmed = raw == null ? '' : String(raw).trim();
    const to = trimmed === '' ? deployerAddress : trimmed;
    if (!ethers.isAddress(to)) {
      throw new Error(`🚫 CAPYBARA_TO не является адресом (получено «${to}»)`);
    }
    return to;
  }

  /**
   * @param {import('ethers').Contract} contract
   * @param {string} deployerAddress
   * @returns {Promise<void>}
   */
  async _assertOwnerIsDeployer(contract, deployerAddress) {
    if (typeof contract.owner !== 'function') {
      return;
    }
    let owner = null;
    try {
      owner = await contract.owner();
    } catch {
      owner = null;
    }
    if (!owner) {
      return;
    }
    if (String(owner).toLowerCase() !== deployerAddress.toLowerCase()) {
      throw new Error(
        `🚫 owner() ${owner} не совпадает с deployer ${deployerAddress}`
      );
    }
  }

  /**
   * @returns {Promise<object>}
   */
  async execute() {
    const mode = this.router?.config?.mode === 'gfl_reality' ? 'gfl_reality' : 'mock';
    const tokenAddress = this._tokenAddress();
    const { amountHuman, amountWei } = this._resolveAmount();
    const { abi } = await this.loadArtifact();
    const wallet = this.resolveWallet(this.router);
    const to = this._resolveTo(wallet.address);

    if (mode === 'gfl_reality') {
      const gate = await this.confirm(this.router, `mint ${amountHuman} to ${to}`, {
        isTty: this.isTty,
        confirmFn: this.confirmFn,
      });
      if (!gate?.confirmed) {
        return { ok: false, action: 52, cancelled: true, mock: false };
      }
    }

    if (mode === 'mock') {
      const line = `[MOCK] would mint ${amountHuman} to ${to}`;
      this.logger?.info?.(line);
      const journal = this._journalShape({
        mode,
        tokenAddress,
        to,
        amountHuman,
        amountWei,
        txHash: null,
        deployer: wallet.address,
        mock: true,
      });
      await this._writeJournal(journal, wallet.address, mode);
      return {
        ok: true,
        action: 52,
        mock: true,
        wouldMint: true,
        amountHuman,
        amountWei: amountWei.toString(),
        to,
        tokenAddress,
        deployer: wallet.address,
        journal,
      };
    }

    const contract = new this.Contract(tokenAddress, abi, wallet);
    await this._assertOwnerIsDeployer(contract, wallet.address);
    const tx = await contract.mint(to, amountWei);
    const receipt = typeof tx?.wait === 'function' ? await tx.wait() : null;
    const txHash = receipt?.hash ?? tx?.hash ?? null;
    this.logger?.info?.(`mint tx ${txHash}`);
    const journal = this._journalShape({
      mode,
      tokenAddress,
      to,
      amountHuman,
      amountWei,
      txHash,
      deployer: wallet.address,
      mock: false,
    });
    await this._writeJournal(journal, wallet.address, mode);

    return {
      ok: true,
      action: 52,
      mock: false,
      txHash,
      amountHuman,
      amountWei: amountWei.toString(),
      to,
      tokenAddress,
      deployer: wallet.address,
      journal,
    };
  }
}

module.exports = MintCapybaraTokenAction;
module.exports.MINT_DECIMALS = MINT_DECIMALS;
