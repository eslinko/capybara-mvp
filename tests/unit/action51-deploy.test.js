'use strict';

const { expect } = require('chai');
const { ethers } = require('ethers');
const {
  CapybaraActionsManager,
  DeployCapybaraTokenAction,
  GFL_REALITY_BANNER,
} = require('../../packages/core/src/actions/index');
const { loadCapybaraTokenArtifact } = require('../../packages/core/src/contract-ops');

const RAW_KEY = '11'.repeat(32);
const DEPLOYED = '0xabc0000000000000000000000000000000000001';

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
  const sendTransaction = () => {
    throw new Error('provider.sendTransaction must not run');
  };
  return {
    logger: extra.logger ?? loggerSink(),
    provider: { sendTransaction },
    config: {
      mode,
      deployer: extra.deployer === undefined
        ? { address: wallet.address, privateKey: RAW_KEY }
        : extra.deployer,
    },
  };
}

describe('action 51 DeployCapybaraToken', () => {
  it('execute() is callable from the manager and is not the stub', async () => {
    const logger = loggerSink();
    const router = routerFor('mock', { logger });
    const manager = new CapybaraActionsManager(router);
    const artifact = { abi: [{ type: 'constructor', inputs: [] }], bytecode: '0x6080' };
    const action = new DeployCapybaraTokenAction(router, {
      loadArtifact: async () => artifact,
    });
    const direct = await action.execute();
    expect(direct.wouldDeploy).to.equal(true);
    expect(direct.stub).to.equal(undefined);
    expect(manager.getAvailableActions()).to.include(51);
    expect(typeof manager.action51Deploy).to.equal('function');
    expect(manager.action51DeployStub).to.equal(undefined);
  });

  it('mock smoke does not broadcast and logs would-deploy', async () => {
    const logger = loggerSink();
    const router = routerFor('mock', { logger });
    let factoryCalls = 0;
    const action = new DeployCapybaraTokenAction(router, {
      loadArtifact: async () => ({ abi: [], bytecode: '0x00' }),
      Factory: class {
        constructor() {
          factoryCalls += 1;
        }
      },
    });
    const result = await action.execute();
    expect(factoryCalls).to.equal(0);
    expect(result).to.include({ ok: true, mock: true, wouldDeploy: true, action: 51 });
    expect(logger.lines.join('\n')).to.match(/\[MOCK\] would deploy CapybaraToken from 0x/i);
    expect(result.journal.type).to.equal('token_deployed');
    expect(result.journal.mock).to.equal(true);
  });

  it('gfl_reality deploy logs the address and CAPY_TOKEN_ADDRESS instruction', async () => {
    const logger = loggerSink();
    const router = routerFor('gfl_reality', { logger });
    const txHash = '0x' + 'ab'.repeat(32);
    const Factory = class {
      deploy() {
        return {
          waitForDeployment: async () => {},
          getAddress: async () => DEPLOYED,
          deploymentTransaction: () => ({ hash: txHash }),
          symbol: async () => 'CAPY',
          decimals: async () => 8,
        };
      }
    };
    const action = new DeployCapybaraTokenAction(router, {
      loadArtifact: async () => ({ abi: [], bytecode: '0x6080' }),
      Factory,
      isTty: true,
      confirmFn: async () => 'да',
    });
    const result = await action.execute();
    expect(result.address).to.equal(DEPLOYED);
    expect(result.txHash).to.equal(txHash);
    expect(result.symbol).to.equal('CAPY');
    expect(result.instruction).to.include('CAPY_TOKEN_ADDRESS');
    expect(result.instruction).to.include(DEPLOYED);
    expect(logger.lines.join('\n')).to.include(`CAPY_TOKEN_ADDRESS=${DEPLOYED}`);
    expect(result.journal.type).to.equal('token_deployed');
  });

  it('gfl_reality without a TTY throws TTY_REQUIRED and does not deploy', async () => {
    const router = routerFor('gfl_reality');
    let factoryCalls = 0;
    const action = new DeployCapybaraTokenAction(router, {
      loadArtifact: async () => ({ abi: [], bytecode: '0x6080' }),
      Factory: class {
        constructor() {
          factoryCalls += 1;
        }
      },
      isTty: false,
    });
    try {
      await action.execute();
      expect.fail('expected TTY_REQUIRED');
    } catch (error) {
      expect(error.code).to.equal('TTY_REQUIRED');
    }
    expect(factoryCalls).to.equal(0);
  });

  it('missing artifact throws compile first', async () => {
    const router = routerFor('mock');
    const action = new DeployCapybaraTokenAction(router, {
      loadArtifact: () => loadCapybaraTokenArtifact({
        rootDir: '/tmp/capy-no-artifact-tkn03',
      }),
    });
    try {
      await action.execute();
      expect.fail('expected missing artifact');
    } catch (error) {
      expect(error.message).to.match(/compile first/i);
    }
  });

  it('missing deployer is a clear error', async () => {
    const router = routerFor('mock', { deployer: null });
    const action = new DeployCapybaraTokenAction(router, {
      loadArtifact: async () => ({ abi: [], bytecode: '0x6080' }),
    });
    try {
      await action.execute();
      expect.fail('expected missing deployer');
    } catch (error) {
      expect(error.message).to.match(/DEPLOYER_PRIVATE_KEY is required/);
    }
  });

  it('manager warns before action 51 in gfl_reality', async () => {
    const logger = loggerSink();
    const router = routerFor('gfl_reality', { logger });
    const manager = new CapybaraActionsManager(router);
    try {
      await manager.action51Deploy();
      expect.fail('expected deploy to stop before broadcast');
    } catch (error) {
      // Missing artifact → "compile first". Compiled artifact → TTY gate, still before broadcast.
      expect(error.message).to.match(/compile first|интерактивный TTY/i);
    }
    expect(logger.lines.join('\n')).to.include(GFL_REALITY_BANNER);
  });
});
