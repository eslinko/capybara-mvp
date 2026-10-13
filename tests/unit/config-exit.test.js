'use strict';

const { expect } = require('chai');
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '../../../');

describe('Capybara config exit codes', () => {
  it('exits nonzero when required capybara env key is missing', () => {
    const script = `
      process.env.CAPYBARA_LAZY_CONFIG = '1';
      delete process.env.CAPY_TOKEN_ADDRESS;
      delete require.cache[require.resolve('./capybara/packages/core/src/config/build')];
      require('./capybara/packages/core/src/config/build').loadAndValidateConfig(process.env);
    `;

    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        CAPYBARA_LAZY_CONFIG: '1',
        CAPYBARA_ACTION: '0',
        CAPY_RPC_URL: 'http://127.0.0.1:8545',
        CAPY_CHAIN_ID: '31337',
        PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
        PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
        CAPY_DAILY_TRISTAN: '5',
        CAPY_DAILY_BASTIAN: '5',
        TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
        TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
        BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
        BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
      },
    });

    expect(result.status).to.equal(1);
  });

  it('exits nonzero for invalid CAPY_CHAIN_ID via loadAndValidateConfig default exit', () => {
    const script = `
      process.env.CAPYBARA_LAZY_CONFIG = '1';
      process.env.CAPY_CHAIN_ID = 'not-a-number';
      delete require.cache[require.resolve('./capybara/packages/core/src/config/build')];
      require('./capybara/packages/core/src/config/build').loadAndValidateConfig(process.env);
    `;

    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        CAPYBARA_LAZY_CONFIG: '1',
        CAPY_RPC_URL: 'http://127.0.0.1:8545',
        CAPY_CHAIN_ID: 'not-a-number',
        CAPY_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
        PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
        PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
        CAPY_DAILY_TRISTAN: '5',
        CAPY_DAILY_BASTIAN: '5',
        TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
        TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
        BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
        BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
      },
    });

    expect(result.status).to.equal(1);
  });

  it('CAPYBARA_ACTION=5 exits with a hint to use 51 or 52', () => {
    const result = spawnSync(process.execPath, ['capybara/cli/capybara.js'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        CAPYBARA_ACTION: '5',
        CAPYBARA_LAZY_CONFIG: '1',
        CAPY_RPC_URL: 'http://127.0.0.1:8545',
        CAPY_CHAIN_ID: '31337',
        CAPY_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
        PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
        PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
        CAPY_DAILY_TRISTAN: '5',
        CAPY_DAILY_BASTIAN: '5',
        TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
        TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
        BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
        BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
      },
    });

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).to.equal(1);
    expect(output).to.include('51');
    expect(output).to.include('52');
    expect(output).to.match(/use 51 or 52/);
  });

  it('CAPYBARA_ACTION=51 does not require CAPYBARA_WALLET', () => {
    const result = spawnSync(process.execPath, ['capybara/cli/capybara.js'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        CAPYBARA_ACTION: '51',
        CAPYBARA_LAZY_CONFIG: '1',
      },
    });
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).to.equal(1);
    expect(output).to.not.include('CAPYBARA_WALLET is required');
    expect(output).to.match(/CAPY_RPC_URL is required|configuration validation failed/i);
  });
});
