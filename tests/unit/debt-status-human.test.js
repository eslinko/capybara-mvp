'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const { DebtLedgerAction } = require('../../packages/core/src/actions/DebtLedgerAction');
const { EXAMPLE_LIMITS_PATH } = require('../../packages/core/src/debt/debtLimits');
const { getChildDebtPath } = require('../../packages/core/src/debt/debtPath');
const { formatHumanBlock } = require('../../packages/core/src/debt/debtStatusHuman');
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

function row(debtId, type, amount, comment) {
  return {
    schema_version: 1,
    event_id: `evt-${debtId}-${type}-${amount}`,
    debt_id: debtId,
    child: 'tristan',
    scope: SCOPE,
    type,
    amount_unit: 'token_raw',
    amounts: { amount, amount_unit: 'token_raw' },
    remainder_before: '0',
    remainder_after: amount,
    comment,
    timestamps: { recorded_at: '2026-09-01T00:00:00.000Z' },
  };
}

describe('debt human summary', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-debt-human-'));
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

  async function writeLines(lines) {
    const filePath = childFile();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${lines.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
  }

  async function writeFixture() {
    await writeLines([
      row('debt-001-260901', 'create', DRONE_RAW, 'drone-repair'),
      row('debt-002-260901', 'create', RADAR_RAW, 'radar'),
    ]);
  }

  it('adds human amount fields and a read-only table for the Tristan-like total', async () => {
    await writeFixture();
    const summary = await action({
      CAPYBARA_DEBT_OP: 'summary',
      CAPYBARA_WALLET: 'tristan',
    }).execute();
    expect(summary.outstanding).to.equal(OUTSTANDING_RAW);
    expect(summary.outstanding_human).to.equal('11 838.89 CAPY');
    const drone = summary.debts.find((card) => card.debtId === 'debt-001-260901');
    expect(drone.original).to.equal(DRONE_RAW);
    expect(drone.original_human).to.equal('9 438.89 CAPY');
    expect(drone.settled_human).to.equal('0 CAPY');
    expect(drone.fines_human).to.equal('0 CAPY');
    expect(drone.forgiven_human).to.equal('0 CAPY');
    expect(drone.remainder_human).to.equal('9 438.89 CAPY');
    const radar = summary.debts.find((card) => card.debtId === 'debt-002-260901');
    expect(radar.original_human).to.equal('2 400 CAPY');
    expect(radar.settled_human).to.equal('0 CAPY');
    const text = formatHumanBlock(summary);
    expect(text).to.include('read-only');
    expect(text).to.include('confirmed: false');
    expect(text).to.include('debt_id | comment | original | settled | remainder');
    expect(text).to.include('11 838.89 CAPY');
    expect(text).to.include('debt-001-260901');
    expect(text).to.include('debt-002-260901');
    expect(text).to.include('drone-repair');
    expect(text).to.include('9 438.89 CAPY');
    expect(text).to.include('2 400 CAPY');

    const shown = await action({
      CAPYBARA_DEBT_OP: 'show',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-001-260901',
    }).execute();
    const showText = formatHumanBlock(shown);
    expect(showText).to.include('read-only');
    expect(showText).to.include('confirmed: false');
    expect(showText).to.include('debt-001-260901');
    expect(showText).to.include(shown.card.remainder_human);
    expect(showText).to.not.include('debt-002-260901');
  });

  it('formats settled, fines, and forgiven from later journal rows', async () => {
    await writeLines([
      row('debt-001-260901', 'create', DRONE_RAW, 'drone-repair'),
      row('debt-001-260901', 'fine', '100000000', 'late'),
      row('debt-001-260901', 'forgive', '200000000', 'waive'),
      row('debt-001-260901', 'repay-settled', '300000000', 'paid'),
    ]);
    const shown = await action({
      CAPYBARA_DEBT_OP: 'show',
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_DEBT_ID: 'debt-001-260901',
    }).execute();
    expect(shown.card.settled).to.equal('300000000');
    expect(shown.card.settled_human).to.equal('3 CAPY');
    expect(shown.card.fines_human).to.equal('1 CAPY');
    expect(shown.card.forgiven_human).to.equal('2 CAPY');
    expect(shown.card.original_human).to.equal('9 438.89 CAPY');
  });

  it('prints JSON on stdout and the human block on stderr', async () => {
    const originalRoute = CapybaraRouter.prototype.route;
    const previousAction = process.env.CAPYBARA_ACTION;
    const previousWallet = process.env.CAPYBARA_WALLET;
    const previousOp = process.env.CAPYBARA_DEBT_OP;
    /** @type {string[]} */
    const outChunks = [];
    /** @type {string[]} */
    const errChunks = [];
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    process.stdout.write = function write(chunk, encoding, cb) {
      outChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
      return true;
    };
    process.stderr.write = function write(chunk, encoding, cb) {
      errChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      if (typeof encoding === 'function') encoding();
      else if (typeof cb === 'function') cb();
      return true;
    };
    const summary = {
      op: 'summary',
      child: 'tristan',
      confirmed: false,
      outstanding: OUTSTANDING_RAW,
      outstanding_human: '11 838.89 CAPY',
      unresolvedClosures: [],
      debts: [
        {
          debtId: 'debt-001-260901',
          comment: 'drone-repair',
          original_human: '9 438.89 CAPY',
          settled_human: '0 CAPY',
          remainder_human: '9 438.89 CAPY',
        },
        {
          debtId: 'debt-002-260901',
          comment: 'radar',
          original_human: '2 400 CAPY',
          settled_human: '0 CAPY',
          remainder_human: '2 400 CAPY',
        },
      ],
    };
    try {
      CapybaraRouter.prototype.route = async () => summary;
      process.env.CAPYBARA_ACTION = '6';
      process.env.CAPYBARA_WALLET = 'tristan';
      process.env.CAPYBARA_DEBT_OP = 'summary';
      await main();
      const parsed = JSON.parse(outChunks.join('').trim());
      expect(parsed.op).to.equal('summary');
      expect(parsed.outstanding_human).to.equal('11 838.89 CAPY');
      const human = errChunks.join('');
      expect(human).to.include('11 838.89 CAPY');
      expect(human).to.include('debt-001-260901');
      expect(human).to.include('debt-002-260901');
      expect(human).to.include('read-only');
      expect(outChunks.join('')).to.not.include('read-only');

      outChunks.length = 0;
      errChunks.length = 0;
      CapybaraRouter.prototype.route = async () => ({
        op: 'show',
        child: 'tristan',
        confirmed: false,
        card: summary.debts[0],
      });
      process.env.CAPYBARA_DEBT_OP = 'show';
      await main();
      expect(JSON.parse(outChunks.join('').trim()).op).to.equal('show');
      expect(errChunks.join('')).to.include('debt-001-260901');
      expect(errChunks.join('')).to.not.include('debt-002-260901');

      outChunks.length = 0;
      errChunks.length = 0;
      CapybaraRouter.prototype.route = async () => ({ op: 'create', ok: true });
      process.env.CAPYBARA_DEBT_OP = 'create';
      await main();
      expect(outChunks.join('')).to.equal('');
      expect(errChunks.join('')).to.equal('');
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
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
