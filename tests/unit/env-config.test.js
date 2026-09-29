'use strict';

const { expect } = require('chai');
const path = require('path');
const {
  REQUIRED_KEYS,
  validateCapybaraEnv,
  buildConfigFromEnv,
  loadAndValidateConfig,
} = require('../../packages/core/src/config/build');

describe('Capybara config', () => {
  const fixtureEnv = {
    CAPY_RPC_URL: 'http://127.0.0.1:8545',
    CAPY_CHAIN_ID: '31337',
    CAPY_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
    PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
    PARENT_PRIVATE_KEY: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    CAPY_DAILY_TRISTAN: '5',
    CAPY_DAILY_BASTIAN: '5',
    TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
    TRISTAN_PRIVATE_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
    BASTIAN_PRIVATE_KEY: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  };

  /** @type {NodeJS.ProcessEnv} */
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envSnapshot)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envSnapshot);
  });

  it('REQUIRED_KEYS matches story scope', () => {
    expect(REQUIRED_KEYS).to.include.members([
      'TRISTAN_PRIVATE_KEY',
      'TRISTAN_ADDRESS',
      'BASTIAN_PRIVATE_KEY',
      'BASTIAN_ADDRESS',
      'CAPY_TOKEN_ADDRESS',
      'PARENT_ADDRESS',
      'PARENT_PRIVATE_KEY',
      'CAPY_DAILY_TRISTAN',
      'CAPY_DAILY_BASTIAN',
      'CAPY_RPC_URL',
      'CAPY_CHAIN_ID',
    ]);
  });

  it('validateCapybaraEnv returns errors for missing keys', () => {
    const errors = validateCapybaraEnv({});
    expect(errors.length).to.be.greaterThan(0);
    expect(errors.some((e) => e.includes('CAPY_RPC_URL'))).to.equal(true);
  });

  it('validateCapybaraEnv rejects invalid daily rate', () => {
    const errors = validateCapybaraEnv({ ...fixtureEnv, CAPY_DAILY_TRISTAN: '0' });
    expect(errors.some((e) => e.includes('CAPY_DAILY_TRISTAN must be greater than 0'))).to.equal(true);
  });

  it('validateCapybaraEnv rejects non-numeric CAPY_CHAIN_ID', () => {
    const errors = validateCapybaraEnv({
      ...fixtureEnv,
      CAPY_CHAIN_ID: 'not-a-number',
    });
    expect(errors.some((e) => e.includes('CAPY_CHAIN_ID must be a positive integer'))).to.equal(true);
  });

  it('buildConfigFromEnv normalizes host-only CAPY_RPC_URL with https scheme', () => {
    const config = buildConfigFromEnv({ ...fixtureEnv, CAPY_RPC_URL: 'polygon-rpc.com' });
    expect(config.rpc.url).to.equal('https://polygon-rpc.com');
  });

  it('buildConfigFromEnv preserves explicit http(s) CAPY_RPC_URL', () => {
    const config = buildConfigFromEnv({
      ...fixtureEnv,
      CAPY_RPC_URL: 'https://custom-rpc.example/v1',
    });
    expect(config.rpc.url).to.equal('https://custom-rpc.example/v1');
  });

  it('validateCapybaraEnv rejects invalid CAPY_RPC_URL protocol', () => {
    const errors = validateCapybaraEnv({ ...fixtureEnv, CAPY_RPC_URL: 'ftp://bad.example' });
    expect(errors.some((e) => e.includes('CAPY_RPC_URL must use http:// or https://'))).to.equal(true);
  });

  it('buildConfigFromEnv normalizes private keys with 0x prefix', () => {
    const config = buildConfigFromEnv(fixtureEnv);
    expect(config.tristan.privateKey).to.match(/^0x[a-fA-F0-9]{64}$/);
    expect(config.bastian.privateKey).to.match(/^0x[a-fA-F0-9]{64}$/);
    expect(config.parent.privateKey).to.match(/^0x[a-fA-F0-9]{64}$/);
    expect(config.dailyRates.tristan).to.equal('5');
    expect(config.dailyRates.bastian).to.equal('5');
    expect(config.rpc.url).to.equal(fixtureEnv.CAPY_RPC_URL);
    expect(config.chainId).to.equal(31337);
    expect(config.mode).to.equal('mock');
  });

  it('buildConfigFromEnv defaults CAPY_MODE to mock when unset', () => {
    const config = buildConfigFromEnv(fixtureEnv);
    expect(config.mode).to.equal('mock');
  });

  it('buildConfigFromEnv accepts gfl_reality mode', () => {
    const config = buildConfigFromEnv({ ...fixtureEnv, CAPY_MODE: 'gfl_reality' });
    expect(config.mode).to.equal('gfl_reality');
  });

  it('validateCapybaraEnv rejects invalid CAPY_MODE', () => {
    const errors = validateCapybaraEnv({ ...fixtureEnv, CAPY_MODE: 'realty' });
    expect(errors.some((e) => e.includes('CAPY_MODE must be one of'))).to.equal(true);
  });

  it('buildConfigFromEnv omits polygonscanApiKey when unset', () => {
    const config = buildConfigFromEnv(fixtureEnv);
    expect(config.polygonscanApiKey).to.equal(null);
  });

  it('buildConfigFromEnv accepts valid POLYGONSCAN_API_KEY', () => {
    const config = buildConfigFromEnv({ ...fixtureEnv, POLYGONSCAN_API_KEY: 'ABCDEFGHIJKLMNOP' });
    expect(config.polygonscanApiKey).to.equal('ABCDEFGHIJKLMNOP');
  });

  it('validateCapybaraEnv rejects invalid POLYGONSCAN_API_KEY format', () => {
    const errors = validateCapybaraEnv({ ...fixtureEnv, POLYGONSCAN_API_KEY: 'bad key!' });
    expect(errors.some((e) => e.includes('POLYGONSCAN_API_KEY has invalid format'))).to.equal(true);
  });

  it('loadAndValidateConfig throws on invalid CAPY_MODE when exitOnError=false', () => {
    expect(() =>
      loadAndValidateConfig({ ...fixtureEnv, CAPY_MODE: 'realty' }, { exitOnError: false })
    ).to.throw(/CAPY_MODE must be one of/i);
  });

  it('loadAndValidateConfig throws when exitOnError=false and keys missing', () => {
    expect(() => loadAndValidateConfig({}, { exitOnError: false })).to.throw(/required/i);
  });

  it('loadAndValidateConfig throws on invalid CAPY_CHAIN_ID when exitOnError=false', () => {
    expect(() =>
      loadAndValidateConfig({ ...fixtureEnv, CAPY_CHAIN_ID: 'not-a-number' }, { exitOnError: false })
    ).to.throw(/CAPY_CHAIN_ID must be a positive integer/i);
  });

  it('loads fixture test.env via dotenv path', () => {
    const envPath = path.join(__dirname, '../fixtures/capybara/test.env');
    require('dotenv').config({ path: envPath, override: true });
    const config = loadAndValidateConfig(process.env, { exitOnError: false });
    expect(config.token.address).to.match(/^0x/i);
  });

  it('reloadConfig via config index getter reflects latest config', () => {
    process.env.CAPYBARA_LAZY_CONFIG = '1';
    const capyConfig = require('../../packages/core/src/config/index');
    const first = capyConfig.reloadConfig(fixtureEnv);
    expect(capyConfig.config).to.equal(first);
    const updatedEnv = { ...fixtureEnv, CAPY_CHAIN_ID: '137' };
    const second = capyConfig.reloadConfig(updatedEnv);
    expect(capyConfig.config).to.equal(second);
    expect(capyConfig.config.chainId).to.equal(137);
    delete process.env.CAPYBARA_LAZY_CONFIG;
    delete require.cache[require.resolve('../../packages/core/src/config/index')];
  });
});
