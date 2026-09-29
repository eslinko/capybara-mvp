'use strict';

const DEFAULT_BASE_URL = 'https://api.etherscan.io/v2/api';
const DEFAULT_CHAIN_ID = 137;
const MAX_OFFSET = 10_000;

/**
 * @param {object} row
 * @returns {{ blockNumber: number, transactionHash: string, timeStamp: number, args: { value: bigint } }}
 */
function normalizePolygonscanRow(row) {
  return {
    blockNumber: Number(row.blockNumber),
    transactionHash: row.hash,
    timeStamp: Number(row.timeStamp),
    args: { value: BigInt(row.value) },
  };
}

class PolygonscanClient {
  /**
   * @param {{
   *   apiKey?: string|null,
   *   tokenAddress: string,
   *   baseUrl?: string,
   *   chainId?: number,
   *   fetchImpl?: typeof fetch,
   * }} options
   */
  constructor(options) {
    const rawKey = options.apiKey;
    this.apiKey =
      rawKey === undefined || rawKey === null || String(rawKey).trim() === ''
        ? null
        : String(rawKey).trim();
    this.tokenAddress = options.tokenAddress;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.chainId = options.chainId ?? DEFAULT_CHAIN_ID;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  /** @returns {boolean} */
  hasApiKey() {
    return Boolean(this.apiKey);
  }

  /**
   * @param {{
   *   childAddress: string,
   *   fromBlock: number|string,
   *   toBlock: number|string,
   *   page?: number,
   * }} params
   * @returns {Promise<object[]>}
   */
  async _fetchTokentxPage(params) {
    const url = new URL(this.baseUrl);
    url.searchParams.set('chainid', String(this.chainId));
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'tokentx');
    url.searchParams.set('contractaddress', this.tokenAddress);
    url.searchParams.set('address', params.childAddress);
    url.searchParams.set('startblock', String(params.fromBlock));
    url.searchParams.set('endblock', String(params.toBlock));
    url.searchParams.set('page', String(params.page ?? 1));
    url.searchParams.set('offset', String(MAX_OFFSET));
    url.searchParams.set('sort', 'asc');
    url.searchParams.set('apikey', this.apiKey);

    const response = await this.fetchImpl(url.toString());
    if (!response.ok) {
      throw new Error(`Polygonscan HTTP ${response.status}`);
    }

    const body = await response.json();
    const message = String(body.message ?? '');
    if (body.status !== '1' && message !== 'No transactions found') {
      throw new Error(`Polygonscan API error: ${message || body.result}`);
    }

    return Array.isArray(body.result) ? body.result : [];
  }

  /**
   * Token transfers to child address, filtered to parent→child.
   * Uses block-window pagination to avoid Polygonscan page*offset ~10k limit (L2).
   * @param {{
   *   parentAddress: string,
   *   childAddress: string,
   *   fromBlock?: number|string,
   *   toBlock?: number|string,
   * }} params
   * @returns {Promise<Array<{ blockNumber: number, transactionHash: string, timeStamp: number, args: { value: bigint } }>>}
   */
  async queryParentToChildTransfers(params) {
    if (!this.hasApiKey()) {
      throw new Error('POLYGONSCAN_API_KEY is required for indexer queries');
    }
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetch is not available for PolygonscanClient');
    }

    const parent = params.parentAddress.toLowerCase();
    const child = params.childAddress.toLowerCase();
    const endBlock = Number(params.toBlock ?? 99_999_999);
    let windowStart = Number(params.fromBlock ?? 0);

    /** @type {ReturnType<typeof normalizePolygonscanRow>[]} */
    const all = [];

    while (windowStart <= endBlock) {
      const pageResults = await this._fetchTokentxPage({
        childAddress: params.childAddress,
        fromBlock: windowStart,
        toBlock: endBlock,
        page: 1,
      });

      const filtered = pageResults.filter(
        (row) => row.from?.toLowerCase() === parent && row.to?.toLowerCase() === child
      );
      all.push(...filtered.map(normalizePolygonscanRow));

      if (pageResults.length < MAX_OFFSET) {
        break;
      }

      const maxBlock = pageResults.reduce(
        (max, row) => Math.max(max, Number(row.blockNumber)),
        windowStart
      );
      if (maxBlock >= endBlock) {
        break;
      }
      windowStart = maxBlock + 1;
    }

    return all;
  }
}

module.exports = {
  PolygonscanClient,
  normalizePolygonscanRow,
  DEFAULT_BASE_URL,
  DEFAULT_CHAIN_ID,
  MAX_OFFSET,
};
