'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { ethers } = require('ethers');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { DebtLedgerAction } = require('../../packages/core/src/actions/DebtLedgerAction');
const { EXAMPLE_LIMITS_PATH } = require('../../packages/core/src/debt/debtLimits');
const { getChildDebtPath } = require('../../packages/core/src/debt/debtPath');
const { readDebtEvents, projectDebtRemainder } = require('../../packages/core/src/debt/debtProjection');
const { parseHumanToRaw, formatRawAmount } = require('../../packages/core/src/debt/debtAmount');
const { resolveDebtPortion } = require('../../packages/core/src/debt/debtPortion');

const DECIMALS = 8;

const config = buildConfigFromEnv({
  CAPY_RPC_URL: 'http://127.0.0.1:8545',
  CAPY_CHAIN_ID: '31337',
  CAPY_MODE: 'mock',
  CAPY_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
  PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
  PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
  CAPY_DAILY_TRISTAN: '5',
  CAPY_DAILY_BASTIAN: '5',
  TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
  TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
  BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
  BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
});

const SCOPE = {
  mode: 'mock',
  chainId: '31337',
  token: '0x1111111111111111111111111111111111111111',
  pool: '0x2222222222222222222222222222222222222222',
};

function yes() {
  return Promise.resolve('да');
}

describe('debt human decimal amounts', () => {
  /** @type {string} */
  let tempRoot;
  /** @type {bigint} */
  let balance;
  /** @type {bigint|undefined} */
  let sent;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-debt-amount-'));
    balance = ethers.parseUnits('20', DECIMALS);
    sent = undefined;
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function debtRoot() {
    return path.join(tempRoot, 'debt');
  }

  function childFile() {
    return getChildDebtPath({
      child: 'tristan',
      scope: SCOPE,
      debtRoot: debtRoot(),
      mode: 'mock',
    });
  }

  function action(env, decimals = DECIMALS) {
    return new DebtLedgerAction({ config }, {
      debtRoot: debtRoot(),
      limitsPath: EXAMPLE_LIMITS_PATH,
      confirmFn: yes,
      isTty: true,
      now: new Date('2026-10-28T12:00:00.000Z'),
      decimals,
      env,
      balanceFn: async () => balance,
      transferFn: async (_child, pool, amount) => {
        expect(pool).to.equal(SCOPE.pool);
        sent = amount;
        balance -= amount;
        return {
          hash: '0xmockhuman',
          wait: async () => ({ status: 1, transactionHash: '0xmockhuman' }),
        };
      },
      receiptFn: async () => ({ status: 1, transactionHash: '0xmockhuman' }),
    });
  }

  it('round-trips 5.555 and rejects nine fractional digits at decimals 8', () => {
    const raw = parseHumanToRaw('5.555', DECIMALS);
    expect(raw).to.equal(ethers.parseUnits('5.555', DECIMALS));
    expect(formatRawAmount(raw, DECIMALS)).to.equal('5.555 CAPY');
    expect(parseHumanToRaw('5.555', 3)).to.equal(5555n);
    expect(parseHumanToRaw('0.00000001', DECIMALS)).to.equal(1n);
    expect(() => parseHumanToRaw('1.123456789', DECIMALS)).to.throw(/9 fractional digits/);
    expect(() => parseHumanToRaw('1.123456789', DECIMALS)).to.throw(/token decimals are 8/);
  });

  it('repay 5.555 transfers parseUnits raw and keeps create, fine, forgive, and percent in raw', async () => {
    await action({
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-1',
      CAPYBARA_DEBT_AMOUNT: '10',
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
    const created = await readDebtEvents(childFile());
    expect(created[0].amounts.amount).to.equal(ethers.parseUnits('10', DECIMALS).toString());
    expect(created[0].amount_unit).to.equal('token_raw');

    await action({
      CAPYBARA_DEBT_OP: 'fine',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-1',
      CAPYBARA_DEBT_AMOUNT: '0.5',
      CAPYBARA_DEBT_REASON: 'late',
    }).execute();
    expect(projectDebtRemainder(await readDebtEvents(childFile()), 'debt-1'))
      .to.equal(ethers.parseUnits('10.5', DECIMALS));

    const repaid = await action({
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-1',
      CAPYBARA_DEBT_AMOUNT: '5.555',
    }).execute();
    expect(sent).to.equal(ethers.parseUnits('5.555', DECIMALS));
    expect(repaid.remainder).to.equal(ethers.parseUnits('4.945', DECIMALS).toString());

    const forgiven = await action({
      CAPYBARA_DEBT_OP: 'forgive',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-1',
      CAPYBARA_DEBT_PERCENT: '50',
      CAPYBARA_DEBT_REASON: 'half',
    }).execute();
    const half = ethers.parseUnits('4.945', DECIMALS) / 2n;
    expect(forgiven.remainder).to.equal((ethers.parseUnits('4.945', DECIMALS) - half).toString());
    expect(resolveDebtPortion({
      remainder: ethers.parseUnits('4.945', DECIMALS),
      percent: '50',
    })).to.equal(half);
  });

  it('refuses a repay that exceeds the raw remainder and does not transfer', async () => {
    await action({
      CAPYBARA_DEBT_OP: 'create',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-1',
      CAPYBARA_DEBT_AMOUNT: '1',
      CAPYBARA_DEBT_REASON: 'loan',
    }).execute();
    await expect(action({
      CAPYBARA_DEBT_OP: 'repay',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-1',
      CAPYBARA_DEBT_AMOUNT: '5.555',
    }).execute()).to.be.rejectedWith(/exceeds remainder/);
    expect(sent).to.equal(undefined);
  });

  it('scales a legacy human-whole remainder once', async () => {
    const filePath = childFile();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const legacy = {
      schema_version: 1,
      event_id: 'evt-legacy',
      debt_id: 'debt-001-260901',
      child: 'tristan',
      scope: SCOPE,
      type: 'create',
      amounts: { amount: '15000' },
      remainder_before: '0',
      remainder_after: '15000',
      timestamps: { recorded_at: '2026-09-01T00:00:00.000Z' },
    };
    await fs.writeFile(filePath, `${JSON.stringify(legacy)}\n`, 'utf8');
    const shown = await action({
      CAPYBARA_DEBT_OP: 'show',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-001-260901',
    }).execute();
    const expected = (15000n * (10n ** BigInt(DECIMALS))).toString();
    expect(shown.card.remainder).to.equal(expected);
    const migrated = await readDebtEvents(filePath);
    expect(migrated[0].amounts.amount).to.equal(expected);
    expect(migrated[0].amounts.amount_unit).to.equal('token_raw');
    expect(migrated[0].remainder_after).to.equal(expected);
    await action({
      CAPYBARA_DEBT_OP: 'show',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-001-260901',
    }).execute();
    const again = await readDebtEvents(filePath);
    expect(again[0].amounts.amount).to.equal(expected);
  });
});
