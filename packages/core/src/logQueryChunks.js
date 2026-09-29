'use strict';

/** Outer stride; strict providers (1rpc) allow ~50 blocks for filtered getLogs. */
const DEFAULT_LOG_QUERY_BLOCK_CHUNK_SIZE = 50;

const MIN_LOG_QUERY_BLOCK_CHUNK_SIZE = 16;

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isBlockRangeTooLargeError(error) {
  const msg = String(error?.message || error?.shortMessage || '');
  const nested = error?.error;
  const nestedMsg = nested?.message ? String(nested.message) : '';
  const combined = `${msg} ${nestedMsg}`;
  const code = error?.code ?? nested?.code;

  if (code === -32062 || code === -32602) {
    return true;
  }
  if (/block range is too large/i.test(combined)) {
    return true;
  }
  if (/eth_getLogs is limited to/i.test(combined)) {
    return true;
  }
  if (/limited to \d+\s*-\s*\d+ blocks range/i.test(combined)) {
    return true;
  }
  return false;
}

/**
 * @param {import('ethers').Provider} provider
 * @param {number|string} blockTag
 * @returns {Promise<number>}
 */
async function resolveBlockNumber(provider, blockTag) {
  if (blockTag === 'latest') {
    const block = await provider.getBlock('latest');
    if (block == null) {
      throw new Error('RPC returned null for latest block — cannot resolve block number');
    }
    return Number(block.number);
  }
  return Number(blockTag);
}

/**
 * Query one inclusive block range; on -32062 split in half recursively.
 * @param {(from: number, to: number) => Promise<import('ethers').Log[]>} runQuery
 * @param {number} from
 * @param {number} to
 * @param {number} minChunkSize
 * @returns {Promise<{ events: import('ethers').Log[], rpcCalls: number, minSpanUsed: number }>}
 */
async function queryRangeAdaptive(runQuery, from, to, minChunkSize = MIN_LOG_QUERY_BLOCK_CHUNK_SIZE) {
  const span = to - from + 1;
  if (span <= 0) {
    return { events: [], rpcCalls: 0, minSpanUsed: span };
  }

  try {
    const events = await runQuery(from, to);
    return { events, rpcCalls: 1, minSpanUsed: span };
  } catch (error) {
    if (!isBlockRangeTooLargeError(error) || span <= minChunkSize) {
      throw error;
    }
    const mid = from + Math.floor(span / 2) - 1;
    const left = await queryRangeAdaptive(runQuery, from, mid, minChunkSize);
    const right = await queryRangeAdaptive(runQuery, mid + 1, to, minChunkSize);
    return {
      events: [...left.events, ...right.events],
      rpcCalls: left.rpcCalls + right.rpcCalls,
      minSpanUsed: Math.min(left.minSpanUsed, right.minSpanUsed),
    };
  }
}

/**
 * Query contract logs in bounded block chunks to avoid RPC "Block range is too large".
 * @param {{
 *   contract: import('ethers').Contract,
 *   eventFilter: import('ethers').ContractEventName,
 *   fromBlock: number|string,
 *   toBlock: number|string,
 *   provider: import('ethers').Provider,
 *   chunkSize?: number,
 *   minChunkSize?: number,
 *   queryChunk?: (from: number, to: number) => Promise<import('ethers').Log[]>,
 * }} params
 * @returns {Promise<{ events: import('ethers').Log[], meta: { start: number, end: number, span: number, chunkSize: number, chunkCount: number, rpcCalls: number, minSpanUsed: number } }>}
 */
async function queryFilterInBlockChunks(params) {
  const {
    contract,
    eventFilter,
    fromBlock,
    toBlock,
    provider,
    chunkSize = DEFAULT_LOG_QUERY_BLOCK_CHUNK_SIZE,
    minChunkSize = MIN_LOG_QUERY_BLOCK_CHUNK_SIZE,
    queryChunk,
  } = params;

  const start = Number(fromBlock);
  const end = await resolveBlockNumber(provider, toBlock);
  if (start > end) {
    return {
      events: [],
      meta: {
        start,
        end,
        span: 0,
        chunkSize,
        chunkCount: 0,
        rpcCalls: 0,
        minSpanUsed: 0,
      },
    };
  }

  const runQuery =
    queryChunk ??
    ((chunkFrom, chunkTo) => contract.queryFilter(eventFilter, chunkFrom, chunkTo));

  /** @type {import('ethers').Log[]} */
  const allEvents = [];
  let chunkCount = 0;
  let rpcCalls = 0;
  let minSpanUsed = Number.MAX_SAFE_INTEGER;

  for (let chunkStart = start; chunkStart <= end; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize - 1, end);
    chunkCount += 1;
    const result = await queryRangeAdaptive(runQuery, chunkStart, chunkEnd, minChunkSize);
    allEvents.push(...result.events);
    rpcCalls += result.rpcCalls;
    minSpanUsed = Math.min(minSpanUsed, result.minSpanUsed);
  }

  if (minSpanUsed === Number.MAX_SAFE_INTEGER) {
    minSpanUsed = 0;
  }

  return {
    events: allEvents,
    meta: {
      start,
      end,
      span: end - start + 1,
      chunkSize,
      chunkCount,
      rpcCalls,
      minSpanUsed,
    },
  };
}

module.exports = {
  DEFAULT_LOG_QUERY_BLOCK_CHUNK_SIZE,
  MIN_LOG_QUERY_BLOCK_CHUNK_SIZE,
  isBlockRangeTooLargeError,
  resolveBlockNumber,
  queryRangeAdaptive,
  queryFilterInBlockChunks,
};
