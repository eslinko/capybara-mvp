'use strict';

const { expect } = require('chai');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { AdvanceLedgerAction } = require('../../packages/core/src/actions/AdvanceLedgerAction');
const { getChildAdvancePath } = require('../../packages/core/src/advance/advancePath');
const { projectAdvanceRemainder, readAdvanceEvents } = require('../../packages/core/src/advance/advanceProjection');

const SCOPE = {
  mode: 'mock',
  chainId: '31337',
  token: '0x1111111111111111111111111111111111111111',
  pool: '0x2222222222222222222222222222222222222222',
};

const DECIMALS = 8;
const RAW_400 = 400n * (10n ** BigInt(DECIMALS));

describe('advance manual settle', () => {
  /** @type {string} */
  let tempRoot;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-adv-settle-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  function advanceRoot() {
    return path.join(tempRoot, 'advance');
  }

  async function limitsPath() {
    const filePath = path.join(tempRoot, 'advance-limits.json');
    await fs.writeFile(filePath, `${JSON.stringify({
      max_open_advances: { disabled: true },
      max_advance_outstanding: { disabled: true },
      children: {},
    })}\n`);
    return filePath;
  }

  /**
   * @param {Record<string, string>} env
   * @param {{ mode?: string, transferFn?: Function, balanceFn?: Function, readReceiptFn?: Function, confirmFn?: Function, isTty?: boolean, limitsPath?: string }} [extra]
   */
  function action(env, extra = {}) {
    return new AdvanceLedgerAction({
      config: {
        mode: extra.mode ?? SCOPE.mode,
        chainId: SCOPE.chainId,
        token: { address: SCOPE.token },
        parent: { address: SCOPE.pool },
      },
      capyToken: extra.provider ? { provider: extra.provider } : undefined,
    }, {
      advanceRoot: advanceRoot(),
      limitsPath: extra.limitsPath,
      decimals: DECIMALS,
      env,
      confirmFn: extra.confirmFn,
      isTty: extra.isTty,
      transferFn: extra.transferFn,
      balanceFn: extra.balanceFn ?? (() => RAW_400),
      readReceiptFn: extra.readReceiptFn,
    });
  }

  async function issueOpen(extra = {}) {
    const limits = extra.limitsPath ?? await limitsPath();
    return action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'issue',
      CAPYBARA_ADVANCE_AMOUNT: '400',
      CAPYBARA_ADVANCE_REASON: 'payout already sent',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }, { ...extra, limitsPath: limits }).execute();
  }

  function journal(mode = SCOPE.mode) {
    return getChildAdvancePath({
      child: 'tristan',
      scope: { ...SCOPE, mode },
      advanceRoot: advanceRoot(),
      mode,
    });
  }

  it('settles the open remainder in mock without a transfer, charge, or debt write', async () => {
    const debtFile = path.join(tempRoot, 'debt.ndjson');
    const paymentFile = path.join(tempRoot, 'payment.ndjson');
    await fs.writeFile(debtFile, '{"debt":"untouched"}\n');
    await fs.writeFile(paymentFile, '{"charge":"untouched"}\n');
    const debtBefore = await fs.readFile(debtFile);
    const paymentBefore = await fs.readFile(paymentFile);
    let transfers = 0;
    await issueOpen({
      transferFn: async () => {
        transfers += 1;
        return { hash: '0xno' };
      },
    });
    const settled = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'settle',
      CAPYBARA_ADVANCE_ID: 'adv-400',
      CAPYBARA_ADVANCE_REASON: 'manual clawback',
    }, {
      transferFn: async () => {
        transfers += 1;
        return { hash: '0xno' };
      },
    }).execute();
    expect(transfers).to.equal(0);
    expect(settled.txHash).to.equal('mock:adv-400');
    expect(settled.remainder).to.equal('0');
    expect(settled.transferred).to.equal(false);
    const events = await readAdvanceEvents(journal());
    expect(events.map((event) => event.type)).to.deep.equal(['issue', 'settle-intent', 'settle-settled']);
    expect(events[1].operation_id).to.be.a('string').and.not.empty;
    expect(events[2].operation_id).to.equal(events[1].operation_id);
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(0n);
    expect(await fs.readFile(debtFile)).to.deep.equal(debtBefore);
    expect(await fs.readFile(paymentFile)).to.deep.equal(paymentBefore);
    await expect(fs.access(journal('gfl_reality'))).to.be.rejected;
  });

  it('rejects a second settle and a forgive after the advance is closed', async () => {
    await issueOpen();
    await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'settle',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }).execute();
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_ADVANCE_OP: 'settle',
        CAPYBARA_ADVANCE_ID: 'adv-400',
      }).execute();
      expect.fail('second settle should throw');
    } catch (error) {
      expect(error.message).to.include('advance is already closed');
    }
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_ADVANCE_OP: 'forgive',
        CAPYBARA_ADVANCE_ID: 'adv-400',
        CAPYBARA_ADVANCE_REASON: 'too late',
      }).execute();
      expect.fail('forgive after settle should throw');
    } catch (error) {
      expect(error.message).to.include('advance is already closed');
    }
  });

  it('leaves the advance open when the child balance is short', async () => {
    await issueOpen();
    const before = await fs.readFile(journal());
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_ADVANCE_OP: 'settle',
        CAPYBARA_ADVANCE_ID: 'adv-400',
      }, {
        balanceFn: () => 1n,
      }).execute();
      expect.fail('short balance should throw');
    } catch (error) {
      expect(error.message).to.include('child balance is below the advance remainder');
    }
    expect(await fs.readFile(journal())).to.deep.equal(before);
    const events = await readAdvanceEvents(journal());
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
  });

  it('does not close the advance when the receipt status is not success', async () => {
    let transfers = 0;
    const gfl = {
      mode: 'gfl_reality',
      confirmFn: async () => 'да',
      isTty: true,
      transferFn: async () => {
        transfers += 1;
        if (transfers === 1) {
          return { hash: '0xissue', wait: async () => ({ status: 1 }) };
        }
        return { hash: '0xreverted', wait: async () => ({ status: 0 }) };
      },
    };
    await issueOpen(gfl);
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_ADVANCE_OP: 'settle',
        CAPYBARA_ADVANCE_ID: 'adv-400',
      }, gfl).execute();
      expect.fail('reverted receipt should throw');
    } catch (error) {
      expect(error.message).to.include('not successful');
    }
    const events = await readAdvanceEvents(journal('gfl_reality'));
    expect(events.map((event) => event.type)).to.include('settle-intent');
    expect(events.map((event) => event.type)).to.include('settle-failed');
    expect(events.map((event) => event.type)).to.not.include('settle-settled');
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
    expect(transfers).to.equal(2);
  });

  it('resumes a pending settle without a second transfer', async () => {
    let transfers = 0;
    const gfl = {
      mode: 'gfl_reality',
      confirmFn: async () => 'да',
      isTty: true,
      transferFn: async () => {
        transfers += 1;
        if (transfers === 1) {
          return { hash: '0xissue', wait: async () => ({ status: 1 }) };
        }
        return { hash: '0xpend', wait: async () => { throw new Error('rpc down'); } };
      },
    };
    await issueOpen(gfl);
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_ADVANCE_OP: 'settle',
        CAPYBARA_ADVANCE_ID: 'adv-400',
      }, gfl).execute();
      expect.fail('unread receipt should stay pending');
    } catch (error) {
      expect(error.code).to.equal('EADVANCE_PENDING');
    }
    const resumed = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'settle',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }, {
      ...gfl,
      readReceiptFn: async () => ({ status: 1 }),
    }).execute();
    expect(resumed.transferred).to.equal(false);
    expect(resumed.remainder).to.equal('0');
    expect(transfers).to.equal(2);
    const events = await readAdvanceEvents(journal('gfl_reality'));
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(0n);
    expect(events.map((event) => event.type)).to.include('settle-pending');
    expect(events.map((event) => event.type)).to.include('settle-settled');
  });

  it('reads the provider receipt when no readReceiptFn is passed', async () => {
    let transfers = 0;
    /** @type {unknown} */
    let receipt = null;
    const provider = {
      getTransactionReceipt: async () => receipt,
    };
    const gfl = {
      mode: 'gfl_reality',
      confirmFn: async () => 'да',
      isTty: true,
      provider,
      transferFn: async () => {
        transfers += 1;
        if (transfers === 1) {
          return { hash: '0xissue', wait: async () => ({ status: 1 }) };
        }
        return { hash: '0xpend', wait: async () => { throw new Error('rpc down'); } };
      },
    };
    await issueOpen(gfl);
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_ADVANCE_OP: 'settle',
        CAPYBARA_ADVANCE_ID: 'adv-400',
      }, gfl).execute();
      expect.fail('missing receipt should stay pending');
    } catch (error) {
      expect(error.code).to.equal('EADVANCE_PENDING');
    }
    try {
      await action({
        CAPYBARA_WALLET: 'tristan',
        CAPYBARA_ADVANCE_OP: 'settle',
        CAPYBARA_ADVANCE_ID: 'adv-400',
      }, gfl).execute();
      expect.fail('empty provider receipt should stay pending');
    } catch (error) {
      expect(error.code).to.equal('EADVANCE_PENDING');
    }
    let events = await readAdvanceEvents(journal('gfl_reality'));
    expect(events.map((event) => event.type)).to.not.include('settle-settled');
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(RAW_400);
    receipt = { status: 1 };
    const resumed = await action({
      CAPYBARA_WALLET: 'tristan',
      CAPYBARA_ADVANCE_OP: 'settle',
      CAPYBARA_ADVANCE_ID: 'adv-400',
    }, gfl).execute();
    expect(resumed.transferred).to.equal(false);
    expect(resumed.remainder).to.equal('0');
    expect(transfers).to.equal(2);
    events = await readAdvanceEvents(journal('gfl_reality'));
    expect(events.filter((event) => event.type === 'settle-settled')).to.have.length(1);
    expect(projectAdvanceRemainder(events, 'adv-400')).to.equal(0n);
  });
});
