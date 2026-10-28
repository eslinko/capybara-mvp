'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { DebtLedgerAction } = require('../../packages/core/src/actions/DebtLedgerAction');
const DailyPaymentsAction = require('../../packages/core/src/actions/DailyPaymentsAction');
const CapyToken = require('../../packages/core/src/CapyToken');
const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const { appendTypedLedgerEntry } = require('../../packages/core/src/daily-payments/ndjsonLogWriter');
const { EXAMPLE_LIMITS_PATH, loadDebtLimitsFile, resolveChildLimits } = require('../../packages/core/src/debt/debtLimits');
const { checkNewDebt } = require('../../packages/core/src/debt/debtAvailability');
const { getChildDebtPath } = require('../../packages/core/src/debt/debtPath');
const { projectDebtRemainderFromFile } = require('../../packages/core/src/debt/debtProjection');

const TOKEN_A = '0x1111111111111111111111111111111111111111';
const POOL_A = '0x2222222222222222222222222222222222222222';
const TOKEN_B = '0x9999999999999999999999999999999999999999';
const POOL_B = '0x8888888888888888888888888888888888888888';

function baseEnv(overrides) {
  return buildConfigFromEnv({
    CAPY_RPC_URL: 'http://127.0.0.1:8545',
    CAPY_CHAIN_ID: '31337',
    CAPY_MODE: 'mock',
    CAPY_TOKEN_ADDRESS: TOKEN_A,
    PARENT_ADDRESS: POOL_A,
    PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
    CAPY_DAILY_TRISTAN: '5',
    CAPY_DAILY_BASTIAN: '5',
    TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
    TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
    BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
    BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
    ...overrides,
  });
}

function scopeOf(config) {
  return {
    mode: config.mode,
    chainId: String(config.chainId),
    token: config.token.address,
    pool: config.parent.address,
  };
}

function yes() {
  return Promise.resolve('да');
}

describe('debt scope isolation and action 2/3 regression', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-debt-scope-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function debtRoot() {
    return path.join(tempRoot, 'debt');
  }

  function childPath(config, child) {
    return getChildDebtPath({
      child,
      scope: scopeOf(config),
      debtRoot: debtRoot(),
      mode: config.mode,
    });
  }

  /**
   * @param {object} config
   * @param {NodeJS.ProcessEnv} env
   * @param {{ transferFn?: Function, balanceFn?: () => Promise<bigint>, receiptFn?: Function }} [options]
   */
  function action(config, env, options = {}) {
    const router = { config };
    if (options.capyToken) {
      router.capyToken = options.capyToken;
    }
    return new DebtLedgerAction(router, {
      debtRoot: debtRoot(),
      limitsPath: EXAMPLE_LIMITS_PATH,
      confirmFn: yes,
      isTty: true,
      now: new Date('2026-10-26T12:00:00.000Z'),
      decimals: options.decimals ?? 0,
      env,
      balanceFn: options.balanceFn,
      transferFn: options.transferFn,
      receiptFn: options.receiptFn,
    });
  }

  async function createDebt(config, child, debtId, amount) {
    await action(config, {
      CAPYBARA_WALLET: child,
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: debtId,
      CAPYBARA_DEBT_AMOUNT: amount,
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
  }

  it('AC-18 keeps a mock create off the live transfer and off the prod debt file', async () => {
    const prod = baseEnv({ CAPY_MODE: 'gfl_reality' });
    const mock = baseEnv({ CAPY_MODE: 'mock' });
    await createDebt(prod, 'tristan', 'prod-1', '10');
    await createDebt(prod, 'tristan', 'prod-2', '10');
    const prodFile = childPath(prod, 'tristan');
    const before = await fs.readFile(prodFile, 'utf8');

    let liveSend = 0;
    await action(mock, {
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_DEBT_ID: 'mock-1',
      CAPYBARA_DEBT_AMOUNT: '10',
      CAPYBARA_DEBT_REASON: 'loan',
    }, {
      transferFn: async () => {
        liveSend += 1;
        throw new Error('live transfer');
      },
    }).execute();

    expect(liveSend).to.equal(0);
    expect(await fs.readFile(prodFile, 'utf8')).to.equal(before);
    const mockFile = childPath(mock, 'tristan');
    expect(mockFile.includes(`${path.sep}mock${path.sep}`)).to.equal(true);
    expect(await projectDebtRemainderFromFile(mockFile, 'mock-1')).to.equal(10n);

    const loaded = await loadDebtLimitsFile(EXAMPLE_LIMITS_PATH);
    const preview = await checkNewDebt({
      child: 'tristan',
      scope: scopeOf(prod),
      debtRoot: debtRoot(),
      mode: prod.mode,
      limits: resolveChildLimits(loaded, 'tristan', {}),
      newDebtId: 'prod-3',
      newAmount: '1',
      now: new Date('2026-10-26T12:00:00.000Z'),
      manualBlock: false,
    });
    expect(preview.allowed).to.equal(false);
    expect(await fs.readFile(prodFile, 'utf8')).to.equal(before);
  });

  it('AC-18 mock repay uses the mock gate and does not call the token contract', async () => {
    const prod = baseEnv({ CAPY_MODE: 'gfl_reality' });
    const mock = baseEnv({ CAPY_MODE: 'mock' });
    await createDebt(prod, 'tristan', 'prod-keep', '40');
    const prodFile = childPath(prod, 'tristan');
    const before = await fs.readFile(prodFile, 'utf8');
    await createDebt(mock, 'tristan', 'mock-repay', '20');

    let liveSend = 0;
    const token = new CapyToken(
      {},
      mock.token.address,
      new WalletRegistry(mock),
      null,
      { mode: 'mock', chainId: 31337 }
    );
    token.getDecimals = async () => 8;
    token.getSymbol = async () => 'CAPY';
    token.contract.transfer = () => {
      liveSend += 1;
      throw new Error('live transfer');
    };

    const result = await action(mock, {
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_DEBT_ID: 'mock-repay',
      CAPYBARA_DEBT_AMOUNT: '10',
    }, {
      capyToken: token,
      balanceFn: async () => 20n,
      receiptFn: async () => ({ status: 1, transactionHash: '0xmock' }),
    }).execute();

    expect(liveSend).to.equal(0);
    expect(String(result.txHash || result.hash || '')).to.match(/^0xmock/);
    expect(await projectDebtRemainderFromFile(childPath(mock, 'tristan'), 'mock-repay')).to.equal(10n);
    expect(await fs.readFile(prodFile, 'utf8')).to.equal(before);
  });

  it('AC-23 does not repay or show a debt from another scope or wallet', async () => {
    const home = baseEnv({ CAPY_MODE: 'mock' });
    const otherNet = baseEnv({
      CAPY_MODE: 'mock',
      CAPY_CHAIN_ID: '1',
      CAPY_TOKEN_ADDRESS: TOKEN_B,
      PARENT_ADDRESS: POOL_B,
    });
    await createDebt(home, 'tristan', 'home-debt', '50');
    await createDebt(otherNet, 'bastian', 'foreign-debt', '70');

    await action(home, {
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_DEBT_ID: 'home-debt',
      CAPYBARA_DEBT_AMOUNT: '10',
    }, {
      balanceFn: async () => 50n,
      transferFn: async () => ({
        hash: '0xhome',
        wait: async () => ({ status: 1, transactionHash: '0xhome' }),
      }),
      receiptFn: async () => ({ status: 1, transactionHash: '0xhome' }),
    }).execute();

    expect(await projectDebtRemainderFromFile(childPath(home, 'tristan'), 'home-debt')).to.equal(40n);
    expect(await projectDebtRemainderFromFile(childPath(otherNet, 'bastian'), 'foreign-debt')).to.equal(70n);

    let missing = null;
    try {
      await action(home, {
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_DEBT_OP: 'show',
        CAPYBARA_DEBT_ID: 'foreign-debt',
      }).execute();
    } catch (error) {
      missing = error;
    }
    expect(String(missing && missing.message)).to.match(/debt_id not found: foreign-debt/);

    let switchedSends = 0;
    let switched = null;
    try {
      await action(otherNet, {
        CAPYBARA_WALLET: 'bastian',
        CAPYBARA_DEBT_OP: 'repay',
        CAPYBARA_DEBT_ID: 'home-debt',
        CAPYBARA_DEBT_AMOUNT: '10',
      }, {
        balanceFn: async () => 70n,
        transferFn: async () => {
          switchedSends += 1;
          throw new Error('live transfer');
        },
      }).execute();
    } catch (error) {
      switched = error;
    }
    expect(switchedSends).to.equal(0);
    expect(String(switched && switched.message)).to.match(/exceeds remainder 0/);

    let otherWallet = null;
    try {
      await action(home, {
        CAPYBARA_WALLET: 'bastian',
        CAPYBARA_DEBT_OP: 'show',
        CAPYBARA_DEBT_ID: 'home-debt',
      }).execute();
    } catch (error) {
      otherWallet = error;
    }
    expect(String(otherWallet && otherWallet.message)).to.match(/debt_id not found: home-debt/);
    expect(await projectDebtRemainderFromFile(childPath(home, 'tristan'), 'home-debt')).to.equal(40n);
    expect(await projectDebtRemainderFromFile(childPath(otherNet, 'bastian'), 'foreign-debt')).to.equal(70n);
  });

  it('AC-24 leaves Debt unchanged when action 2 skips and action 3 writes a charge', async () => {
    const config = baseEnv({ CAPY_MODE: 'mock' });
    let liveSend = 0;
    const logger = {
      section() {},
      info() {},
      warn() {},
      debug() {},
      error() {},
    };
    const result = await new DailyPaymentsAction({
      logger,
      config,
      walletRegistry: new WalletRegistry(config),
      capyToken: {
        transfer() {
          liveSend += 1;
          throw new Error('live transfer');
        },
        getDecimals() {
          throw new Error('rpc');
        },
      },
    }, {
      walletName: 'tristan',
      from: '2026-10-27',
      to: '2026-10-01',
      todayFn: () => '2026-10-26',
      logDir: path.join(tempRoot, 'pay'),
    }).execute();

    expect(result.action).to.equal(2);
    expect(result.skipped).to.equal(true);
    expect(result.owedTotal).to.equal('0');
    expect(liveSend).to.equal(0);

    const chargeFile = await appendTypedLedgerEntry({
      wallet: 'tristan',
      logDir: path.join(tempRoot, 'pay'),
      mode: 'mock',
      entry: { type: 'charge', amount: '10' },
    });
    expect(await fs.readFile(chargeFile, 'utf8')).to.include('"type":"charge"');
    let debtMissing = false;
    try {
      await fs.access(childPath(config, 'tristan'));
    } catch (error) {
      debtMissing = error && error.code === 'ENOENT';
    }
    expect(debtMissing).to.equal(true);
  });
});
