'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { DebtLedgerAction } = require('../../packages/core/src/actions/DebtLedgerAction');
const { EXAMPLE_LIMITS_PATH } = require('../../packages/core/src/debt/debtLimits');
const { getChildDebtPath } = require('../../packages/core/src/debt/debtPath');
const CapybaraRouter = require('../../packages/core/src/CapybaraRouter');
const { main } = require('../../cli/capybara');

const DECIMALS = 8;
const DRONE_RAW = '943889000000';
const RADAR_RAW = '240000000000';
const OUTSTANDING_RAW = (BigInt(DRONE_RAW) + BigInt(RADAR_RAW)).toString();

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

function numericHuman(formatted) {
  return String(formatted).replace(/ CAPY$/, '').replace(/ /g, '');
}

function row(debtId, amount, comment) {
  return {
    schema_version: 1,
    event_id: `evt-${debtId}`,
    debt_id: debtId,
    child: 'tristan',
    scope: SCOPE,
    type: 'create',
    amount_unit: 'token_raw',
    amounts: { amount, amount_unit: 'token_raw' },
    remainder_before: '0',
    remainder_after: amount,
    comment,
    timestamps: { recorded_at: '2026-09-01T00:00:00.000Z' },
  };
}

describe('debt programmatic status', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-debt-status-'));
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

  function action(env) {
    return new DebtLedgerAction({ config }, {
      debtRoot: debtRoot(),
      limitsPath: EXAMPLE_LIMITS_PATH,
      confirmFn: async () => 'да',
      isTty: true,
      now: new Date('2026-11-09T12:00:00.000Z'),
      decimals: DECIMALS,
      env,
    });
  }

  async function writeFixture() {
    const filePath = childFile();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const lines = [
      row('debt-001-260901', DRONE_RAW, 'drone-repair'),
      row('debt-002-260901', RADAR_RAW, 'radar'),
    ];
    await fs.writeFile(filePath, `${lines.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
  }

  it('returns raw and human summary fields and sums remainders', async () => {
    await writeFixture();
    const summary = await action({
      CAPYBARA_DEBT_OP: 'summary',
      CAPYBARA_WALLET: 'tristan',
    }).execute();
    expect(summary.op).to.equal('summary');
    expect(summary.amount_unit).to.equal('token_raw');
    expect(summary.journalPath).to.equal(childFile());
    expect(summary.mode).to.equal('mock');
    expect(summary.scope).to.deep.equal(SCOPE);
    expect(summary.outstanding).to.equal(OUTSTANDING_RAW);
    expect(numericHuman(summary.outstanding_human)).to.equal('11838.89');
    const sum = summary.debts.reduce((total, card) => total + BigInt(card.remainder), 0n);
    expect(sum.toString()).to.equal(summary.outstanding);
    const drone = summary.debts.find((card) => card.debtId === 'debt-001-260901');
    expect(drone.remainder).to.equal(DRONE_RAW);
    expect(numericHuman(drone.remainder_human)).to.equal('9438.89');
    expect(drone.comment).to.equal('drone-repair');
  });

  it('returns the create comment and human remainder on show', async () => {
    await writeFixture();
    const shown = await action({
      CAPYBARA_DEBT_OP: 'show',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-001-260901',
    }).execute();
    expect(shown.op).to.equal('show');
    expect(shown.journalPath).to.equal(childFile());
    expect(shown.card.remainder).to.equal(DRONE_RAW);
    expect(numericHuman(shown.card.remainder_human)).to.equal('9438.89');
    expect(shown.card.comment).to.equal('drone-repair');
    expect(shown.card.amount_unit).to.equal('token_raw');
  });

  it('prints one JSON object for summary and stays quiet for a mutation', async () => {
    const originalRoute = CapybaraRouter.prototype.route;
    const previousAction = process.env.CAPYBARA_ACTION;
    const previousWallet = process.env.CAPYBARA_WALLET;
    const previousOp = process.env.CAPYBARA_DEBT_OP;
    /** @type {string[]} */
    const chunks = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = function write(chunk, encoding, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
      return true;
    };
    try {
      CapybaraRouter.prototype.route = async () => ({
        op: 'summary',
        outstanding: DRONE_RAW,
        outstanding_human: '9 438.89 CAPY',
        debts: [{ remainder: DRONE_RAW }],
        journalPath: '/tmp/tristan.ndjson',
        amount_unit: 'token_raw',
      });
      process.env.CAPYBARA_ACTION = '6';
      process.env.CAPYBARA_WALLET = 'tristan';
      process.env.CAPYBARA_DEBT_OP = 'summary';
      await main();
      const parsed = JSON.parse(chunks.join('').trim());
      expect(parsed.op).to.equal('summary');
      expect(parsed.outstanding).to.equal(DRONE_RAW);
      expect(parsed.journalPath).to.equal('/tmp/tristan.ndjson');
      expect(parsed.amount_unit).to.equal('token_raw');

      chunks.length = 0;
      CapybaraRouter.prototype.route = async () => ({ op: 'create', ok: true });
      process.env.CAPYBARA_DEBT_OP = 'create';
      await main();
      expect(chunks.join('')).to.equal('');
    } finally {
      process.stdout.write = originalWrite;
      CapybaraRouter.prototype.route = originalRoute;
      if (previousAction === undefined) delete process.env.CAPYBARA_ACTION;
      else process.env.CAPYBARA_ACTION = previousAction;
      if (previousWallet === undefined) delete process.env.CAPYBARA_WALLET;
      else process.env.CAPYBARA_WALLET = previousWallet;
      if (previousOp === undefined) delete process.env.CAPYBARA_DEBT_OP;
      else process.env.CAPYBARA_DEBT_OP = previousOp;
    }
  });
});
