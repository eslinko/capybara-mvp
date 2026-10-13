'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const { ethers } = require('ethers');
const {
  loadCapybaraTokenArtifact,
  getDeployerWallet,
  assertGflOrMockSimulate,
  confirmGflReality,
  ARTIFACT_RELATIVE_PATH,
} = require('../../packages/core/src/contract-ops');
const actions = require('../../packages/core/src/actions');

const RAW_KEY = '11'.repeat(32);

describe('ContractOps shared helpers', () => {
  it('exports the shared helpers for actions 51/52', () => {
    expect(actions.loadCapybaraTokenArtifact).to.equal(loadCapybaraTokenArtifact);
    expect(actions.getDeployerWallet).to.equal(getDeployerWallet);
    expect(actions.assertGflOrMockSimulate).to.equal(assertGflOrMockSimulate);
    expect(actions.confirmGflReality).to.equal(confirmGflReality);
  });

  it('missing artifact throws an error that says compile first', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-artifact-'));
    try {
      await loadCapybaraTokenArtifact({ rootDir });
      expect.fail('expected missing artifact');
    } catch (error) {
      expect(error.message).to.match(/compile first/i);
      expect(error.message).to.include(ARTIFACT_RELATIVE_PATH);
    }
  });

  it('loads abi and bytecode from the capybara-root artifact path', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-artifact-'));
    const artifactPath = path.join(rootDir, ARTIFACT_RELATIVE_PATH);
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    const abi = [{ type: 'constructor', inputs: [] }];
    const bytecode = '0x6080';
    await fs.writeFile(artifactPath, JSON.stringify({ abi, bytecode }), 'utf8');

    const loaded = await loadCapybaraTokenArtifact({ rootDir });
    expect(loaded.abi).to.deep.equal(abi);
    expect(loaded.bytecode).to.equal(bytecode);
    expect(loaded.artifactPath).to.equal(artifactPath);
  });

  it('normalizes DEPLOYER_PRIVATE_KEY and matches DEPLOYER_ADDRESS', () => {
    const wallet = new ethers.Wallet(`0x${RAW_KEY}`);
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    const signer = getDeployerWallet({
      provider,
      config: {
        deployer: {
          address: wallet.address,
          privateKey: RAW_KEY,
        },
      },
    });
    expect(signer.address).to.equal(wallet.address);
    expect(signer.privateKey).to.equal(`0x${RAW_KEY}`);
  });

  it('throws when DEPLOYER_ADDRESS does not match the key', () => {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    expect(() => getDeployerWallet({
      provider,
      config: {
        deployer: {
          address: '0x0000000000000000000000000000000000000004',
          privateKey: RAW_KEY,
        },
      },
    })).to.throw(/DEPLOYER_ADDRESS mismatch/);
  });

  it('mock branch returns a would-* shape and does not send', () => {
    const result = assertGflOrMockSimulate('mock');
    expect(result.send).to.equal(false);
    expect(result.would).to.match(/^would-/);
    expect(result.mode).to.equal('mock');
  });

  it('confirmGflReality skips TTY in mock', async () => {
    let asked = false;
    const result = await confirmGflReality(
      { config: { mode: 'mock' } },
      'deploy CapybaraToken',
      {
        isTty: true,
        confirmFn: async () => {
          asked = true;
          return 'да';
        },
      }
    );
    expect(asked).to.equal(false);
    expect(result.send).to.equal(false);
    expect(result.would).to.match(/^would-/);
  });

  it('confirmGflReality requires TTY only for gfl_reality', async () => {
    try {
      await confirmGflReality(
        { config: { mode: 'gfl_reality' } },
        'deploy CapybaraToken',
        { isTty: false }
      );
      expect.fail('expected TTY_REQUIRED');
    } catch (error) {
      expect(error.code).to.equal('TTY_REQUIRED');
    }
  });
});
