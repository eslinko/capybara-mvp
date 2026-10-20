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

  it('SCANNER_API_KEY wins over the POLYGONSCAN_API_KEY alias', () => {
    const config = buildConfigFromEnv({
      ...fixtureEnv,
      SCANNER_API_KEY: 'SCANNERKEY12345',
      POLYGONSCAN_API_KEY: 'POLYGONKEY12345',
      SCANNER_API_BASE: 'https://scanner.example/api',
    });
    expect(config.scannerApiKey).to.equal('SCANNERKEY12345');
    expect(config.polygonscanApiKey).to.equal('SCANNERKEY12345');
    expect(config.scannerApiBase).to.equal('https://scanner.example/api');
    const aliasOnly = buildConfigFromEnv({
      ...fixtureEnv,
      POLYGONSCAN_API_KEY: 'POLYGONKEY12345',
    });
    expect(aliasOnly.scannerApiKey).to.equal('POLYGONKEY12345');
    expect(aliasOnly.polygonscanApiKey).to.equal('POLYGONKEY12345');
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

  it('indexer chain id follows CAPY_CHAIN_ID and ignores POLYGONSCAN_CHAIN_ID', () => {
    const config = buildConfigFromEnv({
      ...fixtureEnv,
      CAPY_CHAIN_ID: '6281971',
      POLYGONSCAN_CHAIN_ID: '137',
    });
    expect(config.chainId).to.equal(6281971);
    expect(config.polygonscanChainId).to.equal(6281971);
    expect(buildConfigFromEnv(fixtureEnv).polygonscanChainId).to.equal(31337);
  });

  it('buildConfigFromEnv reads NETWORK_SCANNER as networkScanner', () => {
    const config = buildConfigFromEnv({
      ...fixtureEnv,
      NETWORK_SCANNER: '  https://dogeos-testnet.l2scan.co/  ',
    });
    expect(config.networkScanner).to.equal('https://dogeos-testnet.l2scan.co/');
    expect(config.scanner).to.equal(undefined);
    expect(validateCapybaraEnv({
      ...fixtureEnv,
      NETWORK_SCANNER: 'https://dogeos-testnet.l2scan.co/',
    })).to.deep.equal([]);
  });

  it('buildConfigFromEnv sets networkScanner null when explorer env is absent', () => {
    const config = buildConfigFromEnv(fixtureEnv);
    expect(config.networkScanner).to.equal(null);
  });

  it('validateCapybaraEnv rejects a non-http NETWORK_SCANNER', () => {
    const errors = validateCapybaraEnv({
      ...fixtureEnv,
      NETWORK_SCANNER: 'ftp://dogeos-testnet.l2scan.co/',
    });
    expect(errors.some((e) => e.includes('NETWORK_SCANNER must use http:// or https://'))).to.equal(true);
  });

  it('buildConfigFromEnv uses SCANNER only when NETWORK_SCANNER is empty', () => {
    const aliasOnly = buildConfigFromEnv({
      ...fixtureEnv,
      SCANNER: 'https://dogeos-testnet.l2scan.co/',
    });
    expect(aliasOnly.networkScanner).to.equal('https://dogeos-testnet.l2scan.co/');
    const primaryWins = buildConfigFromEnv({
      ...fixtureEnv,
      NETWORK_SCANNER: 'https://polygonscan.com/',
      SCANNER: 'https://dogeos-testnet.l2scan.co/',
    });
    expect(primaryWins.networkScanner).to.equal('https://polygonscan.com/');
    const bothEmpty = buildConfigFromEnv({
      ...fixtureEnv,
      NETWORK_SCANNER: '   ',
      SCANNER: '',
    });
    expect(bothEmpty.networkScanner).to.equal(null);
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

  it('action 51 starts without CAPY_TOKEN_ADDRESS when deployer and RPC are set', () => {
    const { CAPY_TOKEN_ADDRESS: _token, ...withoutToken } = fixtureEnv;
    const env = {
      ...withoutToken,
      CAPYBARA_ACTION: '51',
      DEPLOYER_ADDRESS: '0x5555555555555555555555555555555555555555',
      DEPLOYER_PRIVATE_KEY: 'd'.repeat(64),
    };
    const errors = validateCapybaraEnv(env);
    expect(errors.some((error) => error.includes('CAPY_TOKEN_ADDRESS'))).to.equal(false);
    const config = loadAndValidateConfig(env, { exitOnError: false });
    expect(config.token.address).to.equal('');
    expect(config.deployer.privateKey).to.equal(`0x${'d'.repeat(64)}`);
  });

  it('action 52 and actions 0–4 still require CAPY_TOKEN_ADDRESS', () => {
    const { CAPY_TOKEN_ADDRESS: _token, ...withoutToken } = fixtureEnv;
    const deployer = {
      DEPLOYER_ADDRESS: '0x5555555555555555555555555555555555555555',
      DEPLOYER_PRIVATE_KEY: '0x' + 'd'.repeat(64),
    };
    const missingFor52 = validateCapybaraEnv({ ...withoutToken, ...deployer, CAPYBARA_ACTION: '52' });
    expect(missingFor52.some((error) => error.includes('CAPY_TOKEN_ADDRESS'))).to.equal(true);
    const missingFor0 = validateCapybaraEnv({ ...withoutToken, CAPYBARA_ACTION: '0' });
    expect(missingFor0.some((error) => error.includes('CAPY_TOKEN_ADDRESS'))).to.equal(true);
  });

  it('actions 51 and 52 require DEPLOYER_* and normalize the deployer key', () => {
    const missing = validateCapybaraEnv({ ...fixtureEnv, CAPYBARA_ACTION: '51' });
    expect(missing.some((error) => error.includes('DEPLOYER_ADDRESS is required'))).to.equal(true);
    expect(missing.some((error) => error.includes('DEPLOYER_PRIVATE_KEY is required'))).to.equal(true);
    const config = buildConfigFromEnv({
      ...fixtureEnv,
      CAPYBARA_ACTION: '52',
      DEPLOYER_ADDRESS: '0x5555555555555555555555555555555555555555',
      DEPLOYER_PRIVATE_KEY: '0x' + 'e'.repeat(64),
    });
    expect(config.deployer.address).to.match(/^0x5555/);
    expect(config.deployer.privateKey).to.equal(`0x${'e'.repeat(64)}`);
    expect(buildConfigFromEnv(fixtureEnv).deployer).to.equal(null);
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

  describe('CAPY_RECONCILE actualSource', () => {
    const key = 'SCANNERKEY12';

    it('defaults to auto and journal when no key and no mode', () => {
      const config = buildConfigFromEnv(fixtureEnv);
      expect(config.reconcileMode).to.equal('auto');
      expect(config.actualSource).to.equal('journal');
    });

    for (const mode of ['auto', 'journal', 'indexer']) {
      it(`${mode} without a key resolves to journal`, () => {
        const config = buildConfigFromEnv({ ...fixtureEnv, CAPY_RECONCILE: mode });
        expect(config.reconcileMode).to.equal(mode);
        expect(config.actualSource).to.equal('journal');
      });

      it(`${mode} with SCANNER_API_KEY resolves to indexer`, () => {
        const config = buildConfigFromEnv({
          ...fixtureEnv,
          CAPY_RECONCILE: mode,
          SCANNER_API_KEY: key,
        });
        expect(config.reconcileMode).to.equal(mode);
        expect(config.actualSource).to.equal('indexer');
      });
    }

    it('blockscan wins with and without a key', () => {
      expect(buildConfigFromEnv({ ...fixtureEnv, CAPY_RECONCILE: 'blockscan' }).actualSource).to.equal('blockscan');
      expect(buildConfigFromEnv({
        ...fixtureEnv,
        CAPY_RECONCILE: 'blockscan',
        SCANNER_API_KEY: key,
      }).actualSource).to.equal('blockscan');
    });

    it('POLYGONSCAN_API_KEY alias alone still counts as a key', () => {
      const config = buildConfigFromEnv({ ...fixtureEnv, POLYGONSCAN_API_KEY: key });
      expect(config.reconcileMode).to.equal('auto');
      expect(config.actualSource).to.equal('indexer');
    });

    it('blank CAPY_RECONCILE is auto', () => {
      const config = buildConfigFromEnv({ ...fixtureEnv, CAPY_RECONCILE: '   ' });
      expect(config.reconcileMode).to.equal('auto');
      expect(config.actualSource).to.equal('journal');
    });

    it('validateCapybaraEnv names an invalid CAPY_RECONCILE', () => {
      const errors = validateCapybaraEnv({ ...fixtureEnv, CAPY_RECONCILE: 'chain' });
      expect(errors.some((error) => error.includes('CAPY_RECONCILE must be one of: auto, journal, blockscan, indexer'))).to.equal(true);
    });
  });
});
