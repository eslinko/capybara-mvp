'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { ethers } = require('ethers');
const {
  PolygonscanClient,
  normalizePolygonscanRow,
  DEFAULT_BASE_URL,
  DEFAULT_CHAIN_ID,
} = require('../../packages/core/src/indexer/PolygonscanClient');
const {
  fetchTransferEvents,
  reconcileDailyPayments,
} = require('../../packages/core/src/daily-payments/reconcileEngine');
const DailyPaymentsAction = require('../../packages/core/src/actions/DailyPaymentsAction');
const { formatReconcileSourceLine } = DailyPaymentsAction;

describe('PolygonscanClient', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('hasApiKey is false when key missing', () => {
    const client = new PolygonscanClient({ apiKey: null, tokenAddress: '0xtoken' });
    expect(client.hasApiKey()).to.equal(false);
  });

  it('normalizes tokentx rows for aggregateTransfersByDay', () => {
    const row = normalizePolygonscanRow({
      blockNumber: '12345',
      hash: '0xabc',
      timeStamp: '1719859200',
      value: '5000000000000000000',
      from: '0xparent',
      to: '0xchild',
    });
    expect(row.blockNumber).to.equal(12345);
    expect(row.timeStamp).to.equal(1719859200);
    expect(row.args.value).to.equal(ethers.parseUnits('5', 18));
  });

  it('defaults to Etherscan V2 base URL and chainid=137', () => {
    const client = new PolygonscanClient({ apiKey: 'ABCDEFGHIJKL', tokenAddress: '0xtoken' });
    expect(client.baseUrl).to.equal(DEFAULT_BASE_URL);
    expect(client.baseUrl).to.include('etherscan.io/v2');
    expect(client.chainId).to.equal(DEFAULT_CHAIN_ID);
  });

  it('queryParentToChildTransfers uses V2 URL with chainid param', async () => {
    const parent = '0x2222222222222222222222222222222222222222';
    const child = '0x3333333333333333333333333333333333333333';
    const fetchImpl = sinon.stub().resolves({
      ok: true,
      json: async () => ({ status: '1', result: [] }),
    });

    const client = new PolygonscanClient({
      apiKey: 'ABCDEFGHIJKL',
      tokenAddress: '0xtoken',
      fetchImpl,
    });

    await client.queryParentToChildTransfers({
      parentAddress: parent,
      childAddress: child,
      fromBlock: 0,
      toBlock: 999,
    });

    const calledUrl = fetchImpl.firstCall.args[0];
    expect(calledUrl).to.include('api.etherscan.io/v2/api');
    expect(calledUrl).to.include('chainid=137');
    expect(calledUrl).to.include('action=tokentx');
  });

  it('query URL uses a passed non-137 chainId instead of the unit default', async () => {
    const parent = '0x2222222222222222222222222222222222222222';
    const child = '0x3333333333333333333333333333333333333333';
    const fetchImpl = sinon.stub().resolves({
      ok: true,
      json: async () => ({ status: '1', result: [] }),
    });

    const client = new PolygonscanClient({
      apiKey: 'ABCDEFGHIJKL',
      tokenAddress: '0xtoken',
      chainId: 6281971,
      fetchImpl,
    });

    await client.queryParentToChildTransfers({
      parentAddress: parent,
      childAddress: child,
      fromBlock: 0,
      toBlock: 999,
    });

    const calledUrl = fetchImpl.firstCall.args[0];
    expect(calledUrl).to.include('chainid=6281971');
    expect(calledUrl).to.not.include('chainid=137');
  });

  it('queryParentToChildTransfers advances block window when offset limit hit (L2)', async () => {
    const parent = '0x2222222222222222222222222222222222222222';
    const child = '0x3333333333333333333333333333333333333333';
    const fetchImpl = sinon.stub();

    const fullWindowRow = (blockNumber) => ({
      blockNumber: String(blockNumber),
      hash: `0x${blockNumber}`,
      timeStamp: String(Date.parse('2026-07-01T12:00:00Z') / 1000),
      value: '1000',
      from: parent,
      to: child,
    });

    const firstWindow = Array.from({ length: 10_000 }, (_, i) => fullWindowRow(100 + i));
    const secondWindow = [
      fullWindowRow(10_100),
    ];

    fetchImpl.onFirstCall().resolves({
      ok: true,
      json: async () => ({ status: '1', result: firstWindow }),
    });
    fetchImpl.onSecondCall().resolves({
      ok: true,
      json: async () => ({ status: '1', result: secondWindow }),
    });

    const client = new PolygonscanClient({
      apiKey: 'ABCDEFGHIJKL',
      tokenAddress: '0xtoken',
      fetchImpl,
    });

    const events = await client.queryParentToChildTransfers({
      parentAddress: parent,
      childAddress: child,
      fromBlock: 0,
      toBlock: 99_999,
    });

    expect(events).to.have.length(10_001);
    expect(fetchImpl.callCount).to.equal(2);
    const secondUrl = fetchImpl.secondCall.args[0];
    expect(secondUrl).to.include('startblock=10100');
  });

  it('queryParentToChildTransfers filters parent→child and paginates', async () => {
    const parent = '0x2222222222222222222222222222222222222222';
    const child = '0x3333333333333333333333333333333333333333';
    const fetchImpl = sinon.stub();
    fetchImpl.onFirstCall().resolves({
      ok: true,
      json: async () => ({
        status: '1',
        result: [
          {
            blockNumber: '100',
            hash: '0x1',
            timeStamp: String(Date.parse('2026-07-01T12:00:00Z') / 1000),
            value: '5000000000000000000',
            from: parent,
            to: child,
          },
          {
            blockNumber: '101',
            hash: '0x2',
            timeStamp: String(Date.parse('2026-07-01T13:00:00Z') / 1000),
            value: '1000',
            from: '0xother',
            to: child,
          },
        ],
      }),
    });

    const client = new PolygonscanClient({
      apiKey: 'ABCDEFGHIJKL',
      tokenAddress: '0xtoken',
      fetchImpl,
    });

    const events = await client.queryParentToChildTransfers({
      parentAddress: parent,
      childAddress: child,
      fromBlock: 0,
      toBlock: 999,
    });

    expect(events).to.have.length(1);
    expect(events[0].blockNumber).to.equal(100);
    expect(fetchImpl.calledOnce).to.equal(true);
  });

  it('throws on Polygonscan API error', async () => {
    const fetchImpl = sinon.stub().resolves({
      ok: true,
      json: async () => ({ status: '0', message: 'Invalid API Key' }),
    });
    const client = new PolygonscanClient({
      apiKey: 'ABCDEFGHIJKL',
      tokenAddress: '0xtoken',
      fetchImpl,
    });

    try {
      await client.queryParentToChildTransfers({
        parentAddress: '0xparent',
        childAddress: '0xchild',
      });
      expect.fail('expected API error');
    } catch (error) {
      expect(error.message).to.match(/Invalid API Key/i);
    }
  });
});

describe('reconcile indexer integration', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('uses polygonscan when client succeeds (matches block-scan fixture)', async () => {
    const decimals = 18;
    const dailyRate = '5';
    const expectedRaw = ethers.parseUnits(dailyRate, decimals);
    const ts = Date.parse('2026-07-01T12:00:00Z') / 1000;

    const indexerEvents = [
      {
        blockNumber: 100,
        timeStamp: ts,
        args: { value: expectedRaw },
      },
    ];

    const blockScanEvents = [
      {
        blockNumber: 100,
        args: { value: expectedRaw },
      },
    ];

    const provider = {
      getBlock: sinon.stub().callsFake(async (arg) => {
        if (arg === 'latest') {
          return { number: 500, timestamp: ts };
        }
        if (arg === 100) {
          return { timestamp: ts };
        }
        return null;
      }),
    };

    const polygonscanClient = {
      hasApiKey: () => true,
      queryParentToChildTransfers: sinon.stub().resolves(indexerEvents),
    };

    const capyToken = {
      queryTransfers: sinon.stub().resolves(blockScanEvents),
    };

    const indexerResult = await reconcileDailyPayments({
      capyToken,
      polygonscanClient,
      provider,
      parentAddress: '0xparent',
      childAddress: '0xchild',
      dailyRateHuman: dailyRate,
      decimals,
      periodDays: ['2026-07-01'],
      fromBlock: 1,
      toBlock: 200,
    });

    expect(indexerResult.reconcileSource).to.equal('polygonscan');
    expect(indexerResult.reconcileFallbackReason).to.equal(null);
    expect(capyToken.queryTransfers.called).to.equal(false);
    expect(indexerResult.owedTotal).to.equal(0n);

    capyToken.queryTransfers.resetHistory();
    const blockResult = await reconcileDailyPayments({
      capyToken,
      provider,
      parentAddress: '0xparent',
      childAddress: '0xchild',
      dailyRateHuman: dailyRate,
      decimals,
      periodDays: ['2026-07-01'],
      fromBlock: 1,
      toBlock: 200,
    });

    expect(blockResult.reconcileSource).to.equal('blockscan');
    expect(blockResult.reconcileFallbackReason).to.equal('no_api_key');
    expect(capyToken.queryTransfers.calledOnce).to.equal(true);
    expect(blockResult.owedTotal).to.equal(indexerResult.owedTotal);
  });

  it('fetchTransferEvents falls back on indexer error with distinct warning (M1)', async () => {
    const capyToken = {
      queryTransfers: sinon.stub().resolves([{ blockNumber: 1, args: { value: 0n } }]),
    };
    const polygonscanClient = {
      hasApiKey: () => true,
      queryParentToChildTransfers: sinon.stub().rejects(new Error('rate limit')),
    };
    const logger = { warn: sinon.spy() };

    const { source, fallbackReason } = await fetchTransferEvents({
      capyToken,
      polygonscanClient,
      parentAddress: '0xp',
      childAddress: '0xc',
      fromBlock: 0,
      toBlock: 100,
      logger,
    });

    expect(source).to.equal('blockscan');
    expect(fallbackReason).to.equal('indexer_error');
    expect(capyToken.queryTransfers.calledOnce).to.equal(true);
    expect(logger.warn.calledOnce).to.equal(true);
    expect(String(logger.warn.firstCall.args[0])).to.match(/POLYGONSCAN_API_KEY задан/i);
    expect(String(logger.warn.firstCall.args[0])).to.match(/rate limit/i);
  });

  it('fetchTransferEvents reports no_api_key when key missing', async () => {
    const capyToken = {
      queryTransfers: sinon.stub().resolves([{ blockNumber: 1, args: { value: 0n } }]),
    };
    const polygonscanClient = { hasApiKey: () => false };
    const logger = { warn: sinon.spy() };

    const { source, fallbackReason } = await fetchTransferEvents({
      capyToken,
      polygonscanClient,
      parentAddress: '0xp',
      childAddress: '0xc',
      fromBlock: 0,
      toBlock: 100,
      logger,
    });

    expect(source).to.equal('blockscan');
    expect(fallbackReason).to.equal('no_api_key');
    expect(String(logger.warn.firstCall.args[0])).to.match(/POLYGONSCAN_API_KEY не задан/i);
  });
});

describe('formatReconcileSourceLine (M1)', () => {
  it('distinguishes polygonscan success from indexer_error fallback', () => {
    expect(formatReconcileSourceLine('polygonscan')).to.match(/Etherscan indexer/i);
    expect(formatReconcileSourceLine('blockscan', 'indexer_error')).to.match(/ключ задан/i);
    expect(formatReconcileSourceLine('blockscan', 'no_api_key')).to.match(/POLYGONSCAN_API_KEY не задан/i);
  });
});
