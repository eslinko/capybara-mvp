'use strict';

const { expect } = require('chai');
const { ethers } = require('ethers');
const {
  CapybaraActionsManager,
  MintCapybaraTokenAction,
  GFL_REALITY_BANNER,
} = require('../../packages/core/src/actions/index');

const RAW_KEY = '11'.repeat(32);
const TOKEN = '0xabc0000000000000000000000000000000000001';
const OTHER = '0xdef0000000000000000000000000000000000002';
const TX_HASH = `0x${'ab'.repeat(32)}`;

function loggerSink() {
  const lines = [];
  return {
    lines,
    info: (message) => {
      lines.push(String(message));
    },
    warn: (message) => {
      lines.push(String(message));
    },
    error: () => {},
  };
}

function routerFor(mode, extra = {}) {
  const wallet = new ethers.Wallet(`0x${RAW_KEY}`);
  return {
    logger: extra.logger ?? loggerSink(),
    provider: {
      sendTransaction: () => {
        throw new Error('provider.sendTransaction must not run');
      },
    },
    config: {
      mode,
      token: { address: extra.tokenAddress === undefined ? TOKEN : extra.tokenAddress },
      deployer: extra.deployer === undefined
        ? { address: wallet.address, privateKey: RAW_KEY }
        : extra.deployer,
    },
  };
}

function artifact() {
  return { abi: [{ type: 'function', name: 'mint', inputs: [] }], bytecode: '0x6080' };
}

describe('action 52 MintCapybaraToken', () => {
  const envKeys = ['CAPYBARA_AMOUNT', 'CAPYBARA_TO'];
  /** @type {Array<string|undefined>} */
  let saved;

  beforeEach(() => {
    saved = envKeys.map((key) => process.env[key]);
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    envKeys.forEach((key, index) => {
      const value = saved[index];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  it('execute() is callable from the manager and is not the stub', async () => {
    const logger = loggerSink();
    const router = routerFor('mock', { logger });
    const manager = new CapybaraActionsManager(router);
    const action = new MintCapybaraTokenAction(router, {
      loadArtifact: async () => artifact(),
      amountHuman: '1',
      toAddress: '',
    });
    const direct = await action.execute();
    expect(direct.wouldMint).to.equal(true);
    expect(direct.stub).to.equal(undefined);
    expect(manager.getAvailableActions()).to.include(52);
    expect(typeof manager.action52Mint).to.equal('function');
    expect(manager.action52MintStub).to.equal(undefined);
  });

  it('empty CAPYBARA_AMOUNT is a clear error', async () => {
    const router = routerFor('mock');
    const action = new MintCapybaraTokenAction(router, {
      loadArtifact: async () => artifact(),
      amountHuman: '   ',
    });
    try {
      await action.execute();
      expect.fail('expected missing amount');
    } catch (error) {
      expect(error.message).to.match(/CAPYBARA_AMOUNT не задан/);
    }
  });

  it('parses human amount with decimals 8 and defaults to the deployer', async () => {
    const router = routerFor('mock');
    const wallet = new ethers.Wallet(`0x${RAW_KEY}`);
    let constructed = 0;
    const action = new MintCapybaraTokenAction(router, {
      loadArtifact: async () => artifact(),
      amountHuman: '1',
      toAddress: '',
      Contract: class {
        constructor() {
          constructed += 1;
        }
      },
    });
    const result = await action.execute();
    expect(constructed).to.equal(0);
    expect(result.amountWei).to.equal('100000000');
    expect(result.to).to.equal(wallet.address);
    expect(result.to.toLowerCase()).to.equal(router.config.deployer.address.toLowerCase());
    expect(result.tokenAddress).to.equal(TOKEN);
    expect(result.journal.type).to.equal('token_minted');
    expect(result.journal.mock).to.equal(true);
    expect(result.journal.txHash).to.equal(null);
  });

  it('invalid CAPYBARA_TO is an error', async () => {
    const router = routerFor('mock');
    const action = new MintCapybaraTokenAction(router, {
      loadArtifact: async () => artifact(),
      amountHuman: '1',
      toAddress: 'not-an-address',
    });
    try {
      await action.execute();
      expect.fail('expected invalid address');
    } catch (error) {
      expect(error.message).to.match(/CAPYBARA_TO не является адресом/);
    }
  });

  it('CAPY_TOKEN_ADDRESS is required from config', async () => {
    const router = routerFor('mock', { tokenAddress: '' });
    const action = new MintCapybaraTokenAction(router, {
      loadArtifact: async () => artifact(),
      amountHuman: '1',
    });
    try {
      await action.execute();
      expect.fail('expected missing token');
    } catch (error) {
      expect(error.message).to.match(/CAPY_TOKEN_ADDRESS не задан/);
    }
  });

  it('mock smoke does not broadcast and logs would-mint', async () => {
    const logger = loggerSink();
    const router = routerFor('mock', { logger });
    const wallet = new ethers.Wallet(`0x${RAW_KEY}`);
    let constructed = 0;
    process.env.CAPYBARA_AMOUNT = '1';
    const action = new MintCapybaraTokenAction(router, {
      loadArtifact: async () => artifact(),
      Contract: class {
        constructor() {
          constructed += 1;
        }
      },
    });
    const result = await action.execute();
    expect(constructed).to.equal(0);
    expect(result).to.include({ ok: true, mock: true, wouldMint: true, action: 52 });
    expect(logger.lines.join('\n')).to.equal(
      `[MOCK] would mint 1 to ${wallet.address}`
    );
  });

  it('gfl_reality mint logs the tx hash after TTY confirm', async () => {
    const logger = loggerSink();
    const router = routerFor('gfl_reality', { logger });
    const wallet = new ethers.Wallet(`0x${RAW_KEY}`);
    const mintCalls = [];
    const Contract = class {
      owner() {
        return wallet.address;
      }

      mint(to, amountWei) {
        mintCalls.push({ to, amountWei });
        return {
          hash: TX_HASH,
          wait: async () => ({ hash: TX_HASH }),
        };
      }
    };
    const action = new MintCapybaraTokenAction(router, {
      loadArtifact: async () => artifact(),
      Contract,
      isTty: true,
      confirmFn: async () => 'да',
      amountHuman: '1.5',
      toAddress: OTHER,
    });
    const result = await action.execute();
    expect(mintCalls).to.have.length(1);
    expect(mintCalls[0].to).to.equal(OTHER);
    expect(mintCalls[0].amountWei).to.equal(150000000n);
    expect(result.txHash).to.equal(TX_HASH);
    expect(result.mock).to.equal(false);
    expect(logger.lines.join('\n')).to.include(`mint tx ${TX_HASH}`);
    expect(result.journal.type).to.equal('token_minted');
    expect(result.journal.txHash).to.equal(TX_HASH);
  });

  it('gfl_reality without a TTY throws TTY_REQUIRED and does not mint', async () => {
    const router = routerFor('gfl_reality');
    let constructed = 0;
    const action = new MintCapybaraTokenAction(router, {
      loadArtifact: async () => artifact(),
      Contract: class {
        constructor() {
          constructed += 1;
        }
      },
      isTty: false,
      amountHuman: '1',
    });
    try {
      await action.execute();
      expect.fail('expected TTY_REQUIRED');
    } catch (error) {
      expect(error.code).to.equal('TTY_REQUIRED');
    }
    expect(constructed).to.equal(0);
  });

  it('owner mismatch is a clear error and does not mint', async () => {
    const router = routerFor('gfl_reality');
    let minted = 0;
    const Contract = class {
      owner() {
        return OTHER;
      }

      mint() {
        minted += 1;
      }
    };
    const action = new MintCapybaraTokenAction(router, {
      loadArtifact: async () => artifact(),
      Contract,
      isTty: true,
      confirmFn: async () => 'да',
      amountHuman: '1',
    });
    try {
      await action.execute();
      expect.fail('expected owner mismatch');
    } catch (error) {
      expect(error.message).to.match(/owner\(\)/);
      expect(error.message).to.include(OTHER);
    }
    expect(minted).to.equal(0);
  });

  it('manager warns before action 52 in gfl_reality', async () => {
    const logger = loggerSink();
    const router = routerFor('gfl_reality', { logger, tokenAddress: '' });
    const manager = new CapybaraActionsManager(router);
    process.env.CAPYBARA_AMOUNT = '1';
    try {
      await manager.action52Mint();
      expect.fail('expected missing token');
    } catch (error) {
      expect(error.message).to.match(/CAPY_TOKEN_ADDRESS не задан/);
    }
    expect(logger.lines.join('\n')).to.include(GFL_REALITY_BANNER);
  });
});
