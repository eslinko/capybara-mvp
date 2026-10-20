'use strict';

const { ethers } = require('ethers');
const { PolygonscanClient } = require('../indexer/PolygonscanClient');
const {
  utcDateFromUnixSeconds,
  estimateFromBlockForUtcDate,
  estimateToBlockForUtcDate,
} = require('./dateUtils');
const { actualByDayFromJournal } = require('./ndjsonLogReader');

/**
 * @param {import('ethers').Log[]} events
 * @param {import('ethers').Provider} provider
 * @param {string[]} periodDays
 * @returns {Promise<Record<string, bigint>>}
 */
async function aggregateTransfersByDay(events, provider, periodDays) {
  const periodSet = new Set(periodDays);
  /** @type {Record<string, bigint>} */
  const actualByDay = {};
  for (const day of periodDays) {
    actualByDay[day] = 0n;
  }

  /** @type {Map<number, number>} */
  const blockTimestampCache = new Map();

  for (const event of events) {
    const blockNumber = event.blockNumber;
    let timestamp = event.timeStamp;
    if (timestamp === undefined || timestamp === null) {
      timestamp = blockTimestampCache.get(blockNumber);
      if (timestamp === undefined) {
        const block = await provider.getBlock(blockNumber);
        if (block == null) {
          throw new Error(`Block ${blockNumber} not found — cannot reconcile transfer timestamp`);
        }
        timestamp = block.timestamp;
        blockTimestampCache.set(blockNumber, timestamp);
      }
    }

    const day = utcDateFromUnixSeconds(timestamp);
    if (!periodSet.has(day)) {
      continue;
    }

    const value = event.args?.value ?? event.args?.[2] ?? 0n;
    actualByDay[day] += BigInt(value);
  }

  return actualByDay;
}

/**
 * @param {{
 *   capyToken: import('../CapyToken'),
 *   polygonscanClient?: import('../indexer/PolygonscanClient').PolygonscanClient|null,
 *   provider: import('ethers').Provider,
 *   parentAddress: string,
 *   childAddress: string,
 *   fromBlock: number|string,
 *   toBlock: number|string,
 *   logger?: import('../../utils/Logger')|null,
 * }} params
 * @returns {Promise<{ events: object[], source: 'indexer'|'blockscan', fallbackReason?: 'no_api_key'|'indexer_error'|null, fallbackError?: string|null }>}
 */
async function fetchTransferEvents(params) {
  const {
    capyToken,
    polygonscanClient = null,
    parentAddress,
    childAddress,
    fromBlock,
    toBlock,
    logger = null,
  } = params;

  /** @type {'no_api_key'|'indexer_error'|null} */
  let fallbackReason = null;
  /** @type {string|null} */
  let fallbackError = null;

  if (polygonscanClient?.hasApiKey()) {
    try {
      const events = await polygonscanClient.queryParentToChildTransfers({
        parentAddress,
        childAddress,
        fromBlock,
        toBlock,
      });
      return { events, source: 'indexer', fallbackReason: null, fallbackError: null };
    } catch (error) {
      fallbackReason = 'indexer_error';
      fallbackError = error.message;
      if (logger) {
        logger.warn(
          `⚠️ Индексатор не ответил — fallback на block-scan: ${error.message}`
        );
      }
    }
  } else {
    fallbackReason = 'no_api_key';
    if (logger) {
      logger.warn('Indexer API key не задан — сверка через полный скан RPC (медленно)');
    }
  }

  const events = await capyToken.queryTransfers(
    { from: parentAddress, to: childAddress },
    fromBlock,
    toBlock
  );
  return { events, source: 'blockscan', fallbackReason, fallbackError };
}

/**
 * @param {{
 *   capyToken: import('../CapyToken'),
 *   polygonscanClient?: import('../indexer/PolygonscanClient').PolygonscanClient|null,
 *   provider: import('ethers').Provider,
 *   parentAddress: string,
 *   childAddress: string,
 *   dailyRateHuman: string,
 *   decimals: number,
 *   periodDays: string[],
 *   fromBlock?: number|string,
 *   toBlock?: number|string,
 *   logger?: import('../../utils/Logger')|null,
 *   tokenAddress?: string,
 *   polygonscanApiKey?: string|null,
 *   polygonscanApiBase?: string,
 *   polygonscanChainId?: number,
 *   actualSource?: 'journal'|'indexer'|'blockscan'|null,
 *   wallet?: string|null,
 *   logDir?: string,
 * }} params
 * @returns {Promise<{ breakdown: Array<{ date: string, expected: bigint, actual: bigint, match: boolean, owed: bigint }>, owedTotal: bigint, reconcileSource: 'indexer'|'blockscan'|'journal', reconcileFallbackReason: 'no_api_key'|'indexer_error'|null }>}
 */
async function reconcileDailyPayments(params) {
  const {
    capyToken,
    provider,
    parentAddress,
    childAddress,
    dailyRateHuman,
    decimals,
    periodDays,
    fromBlock: fromBlockParam,
    toBlock: toBlockParam = 'latest',
    logger = null,
    polygonscanClient: polygonscanClientParam = null,
    tokenAddress,
    polygonscanApiKey = null,
    polygonscanApiBase,
    polygonscanChainId,
    actualSource = null,
    wallet = null,
    logDir,
  } = params;

  const expectedRaw = ethers.parseUnits(dailyRateHuman, decimals);

  if (actualSource === 'journal') {
    const actualByDay = await actualByDayFromJournal(wallet, periodDays, logDir);
    const { breakdown, owedTotal } = buildOwedBreakdown(periodDays, actualByDay, expectedRaw);
    return {
      breakdown,
      owedTotal,
      reconcileSource: 'journal',
      reconcileFallbackReason: null,
    };
  }

  let fromBlock = fromBlockParam;
  if (fromBlock === undefined || fromBlock === 0) {
    if (periodDays.length > 0) {
      fromBlock = await estimateFromBlockForUtcDate(provider, periodDays[0]);
    } else {
      fromBlock = 0;
    }
  }

  let toBlock = toBlockParam;
  if (toBlock === 'latest' && periodDays.length > 0) {
    toBlock = await estimateToBlockForUtcDate(provider, periodDays[periodDays.length - 1]);
  }

  const polygonscanClient =
    polygonscanClientParam ??
    (tokenAddress
      ? new PolygonscanClient({
          apiKey: polygonscanApiKey,
          tokenAddress,
          baseUrl: polygonscanApiBase,
          chainId: polygonscanChainId,
        })
      : null);

  const { events, source: reconcileSource, fallbackReason: reconcileFallbackReason } =
    await fetchTransferEvents({
    capyToken,
    polygonscanClient,
    provider,
    parentAddress,
    childAddress,
    fromBlock,
    toBlock,
    logger,
  });

  const actualByDay = await aggregateTransfersByDay(events, provider, periodDays);
  const { breakdown, owedTotal } = buildOwedBreakdown(periodDays, actualByDay, expectedRaw);

  return { breakdown, owedTotal, reconcileSource, reconcileFallbackReason };
}

/**
 * @param {string[]} periodDays
 * @param {Record<string, bigint>} actualByDay
 * @param {bigint} expectedRaw
 * @returns {{ breakdown: Array<{ date: string, expected: bigint, actual: bigint, match: boolean, owed: bigint }>, owedTotal: bigint }}
 */
function buildOwedBreakdown(periodDays, actualByDay, expectedRaw) {
  /** @type {Array<{ date: string, expected: bigint, actual: bigint, match: boolean, owed: bigint }>} */
  const breakdown = [];
  let owedTotal = 0n;

  for (const day of periodDays) {
    const actual = actualByDay[day] ?? 0n;
    const owedDay = actual >= expectedRaw ? 0n : expectedRaw - actual;
    owedTotal += owedDay;
    breakdown.push({
      date: day,
      expected: expectedRaw,
      actual,
      match: actual >= expectedRaw,
      owed: owedDay,
    });
  }

  return { breakdown, owedTotal };
}

module.exports = {
  aggregateTransfersByDay,
  fetchTransferEvents,
  reconcileDailyPayments,
};
