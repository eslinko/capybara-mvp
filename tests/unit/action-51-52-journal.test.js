'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const { ethers } = require('ethers');
const DeployCapybaraTokenAction = require('../../packages/core/src/actions/DeployCapybaraTokenAction');
const MintCapybaraTokenAction = require('../../packages/core/src/actions/MintCapybaraTokenAction');

const RAW_KEY = '22'.repeat(32);
const TOKEN = '0xabc0000000000000000000000000000000000001';
const CHAIN_ID = 137;

function loggerSink() {
  return { info() {}, warn() {}, error() {} };
}

function routerFor(mode) {
  const wallet = new ethers.Wallet(`0x${RAW_KEY}`);
  return {
    logger: loggerSink(),
    provider: { sendTransaction() { throw new Error('provider.sendTransaction must not run'); } },
    config: {
      mode,
      chainId: CHAIN_ID,
      token: { address: TOKEN },
      deployer: { address: wallet.address, privateKey: RAW_KEY },
    },
  };
}

async function readLines(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

describe('action 51/52 journal NDJSON', () => {
  let logDir;
  let walletAddress;

  beforeEach(async () => {
    logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-tkn05-'));
    walletAddress = new ethers.Wallet(`0x${RAW_KEY}`).address;
  });

  it('mock 51 writes token_deployed under logs/capybara/mock', async () => {
    const action = new DeployCapybaraTokenAction(routerFor('mock'), {
      logDir,
      loadArtifact: async () => ({ abi: [], bytecode: '0x6080' }),
    });
    const result = await action.execute();
    const filePath = path.join(logDir, 'mock', `${walletAddress.toLowerCase()}.ndjson`);
    const rows = await readLines(filePath);
    expect(rows).to.have.length(1);
    expect(rows[0]).to.include({
      type: 'token_deployed',
      mode: 'mock',
      deployer: walletAddress,
      wouldDeploy: true,
      address: null,
      txHash: null,
      chainId: CHAIN_ID,
      mock: true,
    });
    expect(rows[0].ts).to.be.a('string');
    expect(result.journal.type).to.equal('token_deployed');
  });

  it('mock 52 writes token_minted with amount and default to', async () => {
    const action = new MintCapybaraTokenAction(routerFor('mock'), {
      logDir,
      amountHuman: '1',
      toAddress: '',
      loadArtifact: async () => ({ abi: [], bytecode: '0x6080' }),
    });
    await action.execute();
    const filePath = path.join(logDir, 'mock', `${walletAddress.toLowerCase()}.ndjson`);
    const rows = await readLines(filePath);
    expect(rows).to.have.length(1);
    expect(rows[0]).to.include({
      type: 'token_minted',
      mode: 'mock',
      token: TOKEN,
      to: walletAddress,
      amountHuman: '1',
      amountWei: '100000000',
      txHash: null,
      mock: true,
    });
    expect(rows[0].ts).to.be.a('string');
  });

  it('gfl_reality 51 writes token_deployed outside the mock subdir', async () => {
    const txHash = `0x${'cd'.repeat(32)}`;
    const deployed = '0xabc0000000000000000000000000000000000009';
    const Factory = class {
      deploy() {
        return {
          waitForDeployment: async () => {},
          getAddress: async () => deployed,
          deploymentTransaction: () => ({ hash: txHash }),
        };
      }
    };
    const action = new DeployCapybaraTokenAction(routerFor('gfl_reality'), {
      logDir,
      loadArtifact: async () => ({ abi: [], bytecode: '0x6080' }),
      Factory,
      isTty: true,
      confirmFn: async () => 'да',
    });
    await action.execute();
    const filePath = path.join(logDir, `${walletAddress.toLowerCase()}.ndjson`);
    const rows = await readLines(filePath);
    expect(rows[0]).to.include({
      type: 'token_deployed',
      mode: 'gfl_reality',
      address: deployed,
      txHash,
      chainId: CHAIN_ID,
      wouldDeploy: false,
      mock: false,
    });
  });
});
