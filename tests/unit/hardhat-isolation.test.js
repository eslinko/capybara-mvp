'use strict';

const { expect } = require('chai');
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '../../../');

describe('Capybara hardhat isolation', () => {
  it('loading capybara lib does not mutate deploy env keys', () => {
    const script = `
      process.env.CAPYBARA_LAZY_CONFIG = '1';
      const sentinel = '0x' + 'a'.repeat(64);
      process.env.DEPLOYER_PRIVATE_KEY = sentinel;
      const before = process.env.DEPLOYER_PRIVATE_KEY;
      require('./capybara/packages/core/src/ProviderFactory');
      require('./capybara/packages/core/src/CapyToken');
      require('./capybara/packages/core/src/CapybaraRouter');
      if (process.env.DEPLOYER_PRIVATE_KEY !== before) {
        process.exit(2);
      }
      process.exit(0);
    `;

    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        CAPYBARA_LAZY_CONFIG: '1',
      },
    });

    expect(result.status, result.stderr || result.stdout).to.equal(0);
  });

  it('capybara lib path has no require("hardhat")', () => {
    const { execSync } = require('child_process');
    const grep = execSync(
      "grep -r \"require('hardhat')\" capybara/packages/core/src/ || true",
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      }
    ).trim();
    expect(grep).to.equal('');
  });
});
