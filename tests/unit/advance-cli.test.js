'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const CapybaraRouter = require('../../packages/core/src/CapybaraRouter');
const { CapybaraActionsManager } = require('../../packages/core/src/actions');
const { AdvanceLedgerAction } = require('../../packages/core/src/actions/AdvanceLedgerAction');
const { getChildAdvancePath } = require('../../packages/core/src/advance/advancePath');
const { projectAdvanceRemainder, readAdvanceEvents } = require('../../packages/core/src/advance/advanceProjection');
const { main } = require('../../cli/capybara');

const SCOPE = {
  mode: 'mock',
  chainId: '31337',
  token: '0x1111111111111111111111111111111111111111',
  pool: '0x2222222222222222222222222222222222222222',
};

const DECIMALS = 8;
const RAW_400 = 400n * (10n ** BigInt(DECIMALS));

describe('advance action 7', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-adv7-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function advanceRoot() {
    return path.join(tempRoot, 'advance');
  }

  async function limitsPath() {
    const filePath = path.join(tempRoot, 'advance-limits.json');
    await fs.writeFile(filePath, `${JSON.stringify({
      max_open_advances: { disabled: true },
      max_advance_outstanding: { disabled: true },
      children: {},
    })}\n`);
    return filePath;
  }

  /**
   * @param {Record<string, string>} env
   * @param {{ mode?: string, transferFn?: Function }} [extra]
   */
  function action(env, extra = {}) {
    return new AdvanceLedgerAction({
      config: {
        mode: extra.mode ?? SCOPE.mode,
        chainId: SCOPE.chainId,
        token: { address: SCOPE.token },
        parent: { address: SCOPE.pool },
      },
    }, {
      advanceRoot: advanceRoot(),
      limitsPath: extra.limitsPath,
      decimals: DECIMALS,
      env,
      confirmFn: extra.confirmFn,
      isTty: extra.isTty,
      transferFn: extra.transferFn,
    });
  }

  it('routes action 7 and rejects an unknown sub-op', async () => {
    const manager = new CapybaraActionsManager({
      config: { mode: 'mock' },
      logger: { warn() {} },
    });
    expect(manager.getAvailableActions()).to.deep.equal([0, 1, 2, 3, 4, 6, 7, 51, 52]);
    try {
      await manager.executeAction(5);
      expect.fail('action 5 should throw');
    } catch (error) {
      expect(error.message).to.equal('Unknown Capybara action: 5. use 51 or 52');
    }
    const ledger = action({ CAPYBARA_WALLET: 'tristan', CAPYBARA_ADVANCE_OP: 'reconcile' });
    try {
      await ledger.execute();
      expect.fail('reconcile should throw');
    } catch (error) {
      expect(error.message).to.include('unknown CAPYBARA_ADVANCE_OP: reconcile');
      expect(error.message).to.include('issue, forgive, settle, summary, show');
    }
  });

  it('issues 400 in mock without a live transfer and leaves debt bytes alone', async () => {
    const debtFile = path.join(tempRoot, 'debt.ndjson');
    await fs.writeFile(debtFile, '{"debt":"untouched"}\n');
    const before = await fs.readFile(debtFile);
    let transfers = 0;
    const limits = await limitsPath();
    const issued = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'activity float',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }, {
      limitsPath: limits,
      transferFn: async () => {
        transfers += 1;
        return { hash: '0xlive' };
      },
    }).execute();
    expect(transfers).to.equal(0);
    expect(issued.txHash).to.equal('mock:adv-400');
    expect(issued.amount).to.equal(RAW_400.toString());
    const filePath = getChildAdvancePath({
      child: 'tristan',
      scope: SCOPE,
      advanceRoot: advanceRoot(),
      mode: 'mock',
    });
    const events = await readAdvanceEvents(filePath);
    expect(events).to.have.length(1);
    expect(events[0].tx_hash).to.equal('mock:adv-400');
    expect(events[0].amounts.amount).to.equal(RAW_400.toString());
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
    const prodPath = getChildAdvancePath({
      child: 'tristan',
      scope: { ...SCOPE, mode: 'gfl_reality' },
      advanceRoot: advanceRoot(),
      mode: 'gfl_reality',
    });
    await expect(fs.access(prodPath)).to.be.rejected;
    expect(await fs.readFile(debtFile)).to.deep.equal(before);
  });

  it('does not open an advance when the pool transfer fails', async () => {
    const limits = await limitsPath();
    const ledger = action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'activity float',
      CAPYBARA_ADVANCE_ID: 'adv-fail',
    }, {
      mode: 'gfl_reality',
      limitsPath: limits,
      isTty: true,
      confirmFn: async () => 'да',
      transferFn: async () => {
        throw new Error('pool transfer failed');
      },
    });
    try {
      await ledger.execute();
      expect.fail('transfer failure should throw');
    } catch (error) {
      expect(error.message).to.equal('pool transfer failed');
    }
    const filePath = getChildAdvancePath({
      child: 'tristan',
      scope: { ...SCOPE, mode: 'gfl_reality' },
      advanceRoot: advanceRoot(),
      mode: 'gfl_reality',
    });
    await expect(fs.access(filePath)).to.be.rejected;
  });

  it('forgives an open 400 without a transfer and rejects a second forgive', async () => {
    const limits = await limitsPath();
    const env = {
      CAPYBARA_WALLET: 'bastian',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_ID: 'adv-forgive',
    };
    let transfers = 0;
    await action({
      ...env,
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_REASON: 'open',
    }, {
      limitsPath: limits,
      transferFn: async () => {
        transfers += 1;
        return { hash: '0xlive' };
      },
    }).execute();
    const forgiven = await action({
      ...env,
      CAPYBARA_ADVANCE_OP: 'forgive',
      CAPYBARA_ADVANCE_REASON: 'waived',
    }, {
      limitsPath: limits,
      transferFn: async () => {
        transfers += 1;
        return { hash: '0xlive' };
      },
    }).execute();
    expect(transfers).to.equal(0);
    expect(forgiven.remainder).to.equal('0');
    const filePath = getChildAdvancePath({
      child: 'bastian',
      scope: SCOPE,
      advanceRoot: advanceRoot(),
      mode: 'mock',
    });
    const events = await readAdvanceEvents(filePath);
    expect(events.map((event) => event.type)).to.deep.equal(['issue', 'forgive']);
    expect(events[1].comment).to.equal('waived');
    expect(projectAdvanceRemainder(events, 'adv-forgive')).to.equal(0n);
    try {
      await action({
        ...env,
        CAPYBARA_ADVANCE_OP: 'forgive',
        CAPYBARA_ADVANCE_REASON: 'again',
      }, { limitsPath: limits }).execute();
      expect.fail('closed forgive should throw');
    } catch (error) {
      expect(error.message).to.include('already closed');
    }
    expect(await readAdvanceEvents(filePath)).to.have.length(2);
  });

  it('lists open advances and restores show history on stdout and stderr', async () => {
    const limits = await limitsPath();
    const env = {
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'float',
      CAPYBARA_ADVANCE_ID: 'adv-show',
    };
    await action({ ...env, CAPYBARA_ADVANCE_OP: 'issue' }, { limitsPath: limits }).execute();
    const summary = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'summary',
    }, { limitsPath: limits }).execute();
    expect(summary.advances).to.have.length(1);
    expect(summary.advances[0].advanceId).to.equal('adv-show');
    expect(summary.advances[0].remainder_human).to.equal('400 CAPY');
    const shown = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'show',
      CAPYBARA_ADVANCE_ID: 'adv-show',
    }, { limitsPath: limits }).execute();
    expect(shown.history).to.have.length(1);
    expect(shown.history[0].type).to.equal('issue');
    expect(shown.card.remainder).to.equal(RAW_400.toString());

    const originalRoute = CapybaraRouter.prototype.route;
    const previousAction = process.env.CAPYBARA_ACTION;
    const previousWallet = process.env.CAPYBARA_WALLET;
    const outChunks = [];
    const errChunks = [];
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    process.stdout.write = function write(chunk, encoding, cb) {
      outChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
      return true;
    };
    process.stderr.write = function write(chunk, encoding, cb) {
      errChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
      return true;
    };
    try {
      CapybaraRouter.prototype.route = async () => summary;
      process.env.CAPYBARA_ACTION = '7';
      process.env.CAPYBARA_WALLET = 'tristan';
      await main();
      const parsed = JSON.parse(outChunks.join('').trim());
      expect(parsed.op).to.equal('summary');
      expect(parsed.advances[0].advanceId).to.equal('adv-show');
      expect(errChunks.join('')).to.include('adv-show');
      expect(errChunks.join('')).to.include('400 CAPY');
      expect(errChunks.join('')).to.include('read-only');
      expect(outChunks.join('')).to.not.include('read-only');

      outChunks.length = 0;
      errChunks.length = 0;
      CapybaraRouter.prototype.route = async () => ({ op: 'issue', ok: true });
      await main();
      expect(outChunks.join('')).to.equal('');
      expect(errChunks.join('')).to.equal('');
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      CapybaraRouter.prototype.route = originalRoute;
      if (previousAction === undefined) delete process.env.CAPYBARA_ACTION;
      else process.env.CAPYBARA_ACTION = previousAction;
      if (previousWallet === undefined) delete process.env.CAPYBARA_WALLET;
      else process.env.CAPYBARA_WALLET = previousWallet;
    }
  });

  it('does not open an advance when the receipt status is not success', async () => {
    const limits = await limitsPath();
    const ledger = action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'reverted',
      CAPYBARA_ADVANCE_ID: 'adv-reverted',
    }, {
      mode: 'gfl_reality',
      limitsPath: limits,
      isTty: true,
      confirmFn: async () => 'да',
      transferFn: async () => ({
        hash: '0xreverted',
        wait: async () => ({ status: 0 }),
      }),
    });
    try {
      await ledger.execute();
      expect.fail('failed receipt should throw');
    } catch (error) {
      expect(error.message).to.include('not successful');
    }
    const filePath = getChildAdvancePath({
      child: 'tristan',
      scope: { ...SCOPE, mode: 'gfl_reality' },
      advanceRoot: advanceRoot(),
      mode: 'gfl_reality',
    });
    await expect(fs.access(filePath)).to.be.rejected;
  });

  it('scales a human outstanding cap and leaves a disabled cap and the open count alone', async () => {
    const capped = path.join(tempRoot, 'capped-limits.json');
    await fs.writeFile(capped, `${JSON.stringify({
      max_open_advances: { disabled: true },
      max_advance_outstanding: 1000,
      children: {},
    })}\n`);
    const issued = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'inside cap',
      CAPYBARA_ADVANCE_ID: 'adv-400-cap',
    }, { limitsPath: capped }).execute();
    expect(issued.amount).to.equal(RAW_400.toString());
    try {
      await action({
        CAPYBARA_WALLET: 'bastian',
        CAPYBARA_ADVANCE_OP: 'issue',
        CAPYBARA_ADVANCE_AMOUNT: '1001',
        CAPYBARA_ADVANCE_REASON: 'over cap',
        CAPYBARA_ADVANCE_ID: 'adv-1001',
      }, { limitsPath: capped }).execute();
      expect.fail('1001 should be denied');
    } catch (error) {
      expect(error.message).to.include('advance issue denied');
    }
    const deniedPath = getChildAdvancePath({
      child: 'bastian',
      scope: SCOPE,
      advanceRoot: advanceRoot(),
      mode: 'mock',
    });
    await expect(fs.access(deniedPath)).to.be.rejected;

    const counted = path.join(tempRoot, 'open-count-limits.json');
    await fs.writeFile(counted, `${JSON.stringify({
      max_open_advances: 1,
      max_advance_outstanding: { disabled: true },
      children: {},
    })}\n`);
    await action({
      CAPYBARA_WALLET: 'bastian',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '1',
      CAPYBARA_ADVANCE_REASON: 'first',
      CAPYBARA_ADVANCE_ID: 'adv-open-1',
    }, { limitsPath: counted }).execute();
    try {
      await action({
        CAPYBARA_WALLET: 'bastian',
        CAPYBARA_ADVANCE_OP: 'issue',
        CAPYBARA_ADVANCE_AMOUNT: '1',
        CAPYBARA_ADVANCE_REASON: 'second',
        CAPYBARA_ADVANCE_ID: 'adv-open-2',
      }, { limitsPath: counted }).execute();
      expect.fail('a second open advance should be denied');
    } catch (error) {
      expect(error.message).to.include('advance issue denied');
    }
  });
});
