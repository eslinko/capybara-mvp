'use strict';

const { ethers } = require('ethers');
const {
  loadCapybaraTokenArtifact,
  getDeployerWallet,
  confirmGflReality,
} = require('../contract-ops');

/**
 * @param {string} address
 * @returns {string}
 */
function buildCopyInstruction(address) {
  return (
    `Скопируйте адрес в capybara/.env как CAPY_TOKEN_ADDRESS=${address} и перезапустите остальные действия. ` +
    `Copy the address into capybara/.env as CAPY_TOKEN_ADDRESS=${address} then re-run other actions.`
  );
}

/**
 * Deploy CapybaraToken from the deployer wallet. Mock does not broadcast.
 */
class DeployCapybaraTokenAction {
  /**
   * @param {object} router
   * @param {{
   *   loadArtifact?: typeof loadCapybaraTokenArtifact,
   *   resolveWallet?: typeof getDeployerWallet,
   *   confirm?: typeof confirmGflReality,
   *   Factory?: typeof ethers.ContractFactory,
   *   isTty?: boolean,
   *   confirmFn?: (question: string) => Promise<string>,
   * }} [options]
   */
  constructor(router, options = {}) {
    this.router = router;
    this.logger = router?.logger ?? null;
    this.loadArtifact = options.loadArtifact ?? loadCapybaraTokenArtifact;
    this.resolveWallet = options.resolveWallet ?? getDeployerWallet;
    this.confirm = options.confirm ?? confirmGflReality;
    this.Factory = options.Factory ?? ethers.ContractFactory;
    this.isTty = options.isTty;
    this.confirmFn = options.confirmFn;
  }

  /**
   * @param {{ mode: string, address: string|null, txHash: string|null, mock: boolean }} fields
   * @returns {object}
   */
  _journalShape(fields) {
    return {
      type: 'token_deployed',
      address: fields.address,
      txHash: fields.txHash,
      deployer: fields.deployer,
      mode: fields.mode,
      mock: fields.mock,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async execute() {
    const mode = this.router?.config?.mode === 'gfl_reality' ? 'gfl_reality' : 'mock';
    const { abi, bytecode } = await this.loadArtifact();
    const wallet = this.resolveWallet(this.router);

    if (mode === 'gfl_reality') {
      const gate = await this.confirm(this.router, 'deploy CapybaraToken', {
        isTty: this.isTty,
        confirmFn: this.confirmFn,
      });
      if (!gate?.confirmed) {
        return { ok: false, action: 51, cancelled: true, mock: false };
      }
    }

    if (mode === 'mock') {
      const line = `[MOCK] would deploy CapybaraToken from ${wallet.address}`;
      this.logger?.info?.(line);
      return {
        ok: true,
        action: 51,
        mock: true,
        wouldDeploy: true,
        deployer: wallet.address,
        journal: this._journalShape({
          mode,
          address: null,
          txHash: null,
          deployer: wallet.address,
          mock: true,
        }),
      };
    }

    const factory = new this.Factory(abi, bytecode, wallet);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    const deploymentTx = contract.deploymentTransaction?.();
    const txHash = deploymentTx?.hash ?? null;
    const instruction = buildCopyInstruction(address);

    this.logger?.info?.(`CapybaraToken deployed at ${address}`);
    this.logger?.info?.(instruction);

    let symbol = null;
    let decimals = null;
    if (typeof contract.symbol === 'function') {
      symbol = await contract.symbol();
    }
    if (typeof contract.decimals === 'function') {
      decimals = await contract.decimals();
    }

    return {
      ok: true,
      action: 51,
      mock: false,
      address,
      txHash,
      symbol,
      decimals,
      instruction,
      journal: this._journalShape({
        mode,
        address,
        txHash,
        deployer: wallet.address,
        mock: false,
      }),
    };
  }
}

module.exports = DeployCapybaraTokenAction;
module.exports.buildCopyInstruction = buildCopyInstruction;
