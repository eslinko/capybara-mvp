/**
 * RPC Provider Manager
 * 
 * Manages alternative RPC endpoints for Polygon mainnet with automatic
 * fallback switching on rate limit errors.
 * 
 * @version 1.0.0
 * @date 2026-01-26
 */

const { ethers } = require('ethers');

class RpcProviderManager {
  constructor(networkName, chainId, logger, primaryEndpoint = null) {
    this.networkName = networkName;
    this.chainId = chainId;
    this.logger = logger;
    
    // Initialize endpoints list
    this.endpoints = this._buildEndpointsList(primaryEndpoint);
    
    // Round-robin state
    this.currentIndex = 0;
    this.switchCount = 0;
    this.maxSwitches = 10;
    
    // Switch history for debugging
    this.switchHistory = [];
  }
  
  /**
   * Build list of alternative RPC endpoints
   * @private
   * @param {string|null} primaryEndpoint - Primary endpoint from env/config
   * @returns {Array<string>} - List of endpoints
   */
  _buildEndpointsList(primaryEndpoint) {
    // Order: most reliable first. publicnode last — diagnostic showed it returns hash but does not broadcast tx.
    // ВАЖНО: это ПУБЛИЧНЫЕ fallback-эндпоинты без ключа. Основной (keyed) endpoint приходит
    // как primaryEndpoint из CAPY_RPC_URL / POLYGON_MAINNET_RPC и ставится первым (см. _buildEndpointsList).
    // Проверка живости 2026-07-01: см. docs/analysis/manual-RPC-ankr-podklyuchenie-2026-07-01.md
    const alternativeEndpoints = [
      'https://1rpc.io/matic', // ✅ 1RPC (Automata) — жив (200)
      'https://polygon.drpc.org', // ✅ dRPC — жив (200)
      'https://polygon-bor-rpc.publicnode.com', // ⚠️ жив, но может вернуть hash без реального broadcast (A1/A2)
      // REMOVED endpoints (dead or require API key as of 2026-07-01):
      // 'https://polygon-rpc.com', // ❌ 401 "API key disabled, tenant disabled"
      // 'https://rpc.ankr.com/polygon', // ❌ keyless больше не работает — нужен ключ (задаётся как primaryEndpoint)
      // 'https://rpc-mainnet.matic.network', // ❌ DNS не резолвится (HTTP 000)
      // 'https://polygon.llamarpc.com', // ❌ DNS not resolving (ENOTFOUND)
    ];
    
    // If primary endpoint is provided, use it as first
    if (primaryEndpoint) {
      // Remove primaryEndpoint from alternatives if it's there
      const filtered = alternativeEndpoints.filter(e => e !== primaryEndpoint);
      return [primaryEndpoint, ...filtered];
    }
    
    // Otherwise, use default first (polygon-rpc.com)
    return alternativeEndpoints;
  }
  
  /**
   * Get list of all alternative endpoints
   * @returns {Array<string>} - Copy of endpoints list
   */
  getAlternativeEndpoints() {
    return [...this.endpoints];
  }
  
  /**
   * Get next endpoint in round-robin fashion
   * Skips current endpoint to ensure we switch to a different one
   * @returns {string} - Next endpoint URL
   */
  getNextEndpoint() {
    // Check if max switches reached
    if (this.switchCount >= this.maxSwitches) {
      this.logger.warn(`[RPC] Max switches (${this.maxSwitches}) reached, resetting to first endpoint`);
      this.currentIndex = 0;
      this.switchCount = 0;
    }
    
    // CRITICAL: Increment index BEFORE getting endpoint to ensure we switch to a different one
    // This prevents returning the same endpoint that just failed
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    this.switchCount++;
    
    // Get next endpoint (after increment)
    const endpoint = this.endpoints[this.currentIndex];
    
    // Log selection
    this.logger.info(`[RPC] Selected endpoint ${this.switchCount}/${this.endpoints.length}: ${endpoint}`);
    
    // Save to history
    this.switchHistory.push({
      index: this.currentIndex,
      endpoint: endpoint,
      timestamp: Date.now(),
      switchCount: this.switchCount
    });
    
    return endpoint;
  }
  
  /**
   * Create new ethers.JsonRpcProvider for given endpoint
   * @param {string} endpoint - RPC endpoint URL
   * @returns {ethers.JsonRpcProvider} - New provider instance
   */
  createProvider(endpoint) {
    this.logger.debug(`[RPC] Creating provider for endpoint: ${endpoint}`);
    const provider = new ethers.JsonRpcProvider(endpoint);
    return provider;
  }
  
  /**
   * Check if fallback should be used for this network
   * @returns {boolean} - True if fallback is needed (Polygon mainnet)
   */
  shouldUseFallback() {
    return this.chainId === 137;
  }
  
  /**
   * Get current endpoint (without incrementing index)
   * @returns {string} - Current endpoint URL
   */
  getCurrentEndpoint() {
    return this.endpoints[this.currentIndex];
  }
  
  /**
   * Reset round-robin state
   */
  reset() {
    this.currentIndex = 0;
    this.switchCount = 0;
    this.logger.debug(`[RPC] Reset round-robin state`);
  }
  
  /**
   * Get switch history
   * @returns {Array<Object>} - History of endpoint switches
   */
  getSwitchHistory() {
    return [...this.switchHistory];
  }
}

module.exports = RpcProviderManager;
