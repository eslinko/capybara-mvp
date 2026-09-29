'use strict';

const { ethers } = require('ethers');
const RpcProviderManager = require('./lib/infrastructure/RpcProviderManager');

/**
 * Mask private key for logs (same pattern as EthersUtils.getSigner).
 * @param {string} key
 * @returns {string}
 */
function maskPrivateKey(key) {
  if (!key || key.length < 14) {
    return '***';
  }
  return `${key.substring(0, 10)}...${key.substring(key.length - 4)}`;
}

/**
 * @param {object} config
 * @param {import('../../utils/Logger')} logger
 * @returns {Promise<{ provider: import('ethers').Provider, chainId: number, rpcManager: RpcProviderManager|null }>}
 */
async function createCapybaraProvider(config, logger) {
  let rpcUrl = config.rpc.url;
  let provider = new ethers.JsonRpcProvider(rpcUrl);
  let rpcManager = null;

  const expectedChainId = Number(config.chainId);

  if (expectedChainId === 137) {
    rpcManager = new RpcProviderManager('polygon', 137, logger, rpcUrl);
    if (rpcManager.shouldUseFallback()) {
      rpcUrl = rpcManager.getCurrentEndpoint();
      provider = rpcManager.createProvider(rpcUrl);
      logger.info(`[CAPY] RpcProviderManager enabled for chainId 137; endpoint: ${rpcUrl}`);
    }
  }

  const network = await provider.getNetwork();
  const blockNumber = await provider.getBlockNumber();
  const chainId = Number(network.chainId);

  logger.info(`[CAPY] Provider connected: chainId=${chainId}, block=${blockNumber}, rpc=${rpcUrl}`);

  if (expectedChainId && chainId !== expectedChainId) {
    logger.warn(
      `[CAPY] Chain ID mismatch: CAPY_CHAIN_ID=${expectedChainId}, network.chainId=${chainId}`
    );
  }

  return { provider, chainId, rpcManager };
}

module.exports = {
  createCapybaraProvider,
  maskPrivateKey,
};
