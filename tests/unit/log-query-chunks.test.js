'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const {
  DEFAULT_LOG_QUERY_BLOCK_CHUNK_SIZE,
  isBlockRangeTooLargeError,
  queryRangeAdaptive,
  queryFilterInBlockChunks,
} = require('../../packages/core/src/logQueryChunks');

describe('logQueryChunks', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('isBlockRangeTooLargeError detects 1rpc 50-block limit (-32602)', () => {
    const error = new Error('could not coalesce error');
    error.error = { code: -32602, message: 'eth_getLogs is limited to 0 - 50 blocks range' };
    expect(isBlockRangeTooLargeError(error)).to.equal(true);
  });

  it('isBlockRangeTooLargeError detects Ankr -32062 payload', () => {
    const error = new Error('could not coalesce error');
    error.code = 'UNKNOWN_ERROR';
    error.error = { code: -32062, message: 'Block range is too large' };
    expect(isBlockRangeTooLargeError(error)).to.equal(true);
  });

  it('queryRangeAdaptive splits range when provider rejects block span', async () => {
    const queryChunk = sinon.stub().callsFake(async (from, to) => {
      const span = to - from + 1;
      if (span > 250) {
        const err = new Error('Block range is too large');
        err.error = { code: -32062, message: 'Block range is too large' };
        throw err;
      }
      return [{ blockNumber: from }];
    });

    const { events, rpcCalls, minSpanUsed } = await queryRangeAdaptive(queryChunk, 0, 499);
    expect(events.length).to.be.greaterThan(0);
    expect(rpcCalls).to.be.greaterThan(1);
    expect(minSpanUsed).to.be.at.most(250);
  });

  it('queries a single chunk when span fits chunkSize', async () => {
    const queryChunk = sinon.stub().resolves([{ blockNumber: 1 }]);
    const provider = {
      getBlock: sinon.stub().resolves({ number: 100 }),
    };

    const { events, meta } = await queryFilterInBlockChunks({
      contract: {},
      eventFilter: 'filter',
      fromBlock: 0,
      toBlock: 49,
      provider,
      queryChunk,
    });

    expect(queryChunk.calledOnce).to.equal(true);
    expect(queryChunk.firstCall.args).to.deep.equal([0, 49]);
    expect(events).to.have.length(1);
    expect(meta.chunkCount).to.equal(1);
  });

  it('splits wide block ranges into multiple chunks (Ankr block-range limit)', async () => {
    const queryChunk = sinon.stub().resolves([]);
    const provider = {
      getBlock: sinon.stub().resolves({ number: 5000 }),
    };

    const { meta } = await queryFilterInBlockChunks({
      contract: {},
      eventFilter: 'filter',
      fromBlock: 0,
      toBlock: 5000,
      provider,
      chunkSize: DEFAULT_LOG_QUERY_BLOCK_CHUNK_SIZE,
      queryChunk,
    });

    expect(meta.chunkCount).to.equal(101);
    expect(queryChunk.getCall(0).args).to.deep.equal([0, 49]);
    expect(queryChunk.getCall(1).args).to.deep.equal([50, 99]);
    expect(queryChunk.getCall(100).args).to.deep.equal([5000, 5000]);
  });

  it('resolves toBlock latest via provider', async () => {
    const queryChunk = sinon.stub().resolves([]);
    const provider = {
      getBlock: sinon.stub().withArgs('latest').resolves({ number: 42 }),
    };

    await queryFilterInBlockChunks({
      contract: {},
      eventFilter: 'filter',
      fromBlock: 40,
      toBlock: 'latest',
      provider,
      queryChunk,
    });

    expect(queryChunk.calledOnce).to.equal(true);
    expect(queryChunk.firstCall.args).to.deep.equal([40, 42]);
  });
});
