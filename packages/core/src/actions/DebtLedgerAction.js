'use strict';

const crypto = require('crypto');
const { confirmPayment } = require('../daily-payments/confirmPayment');
const { getChildDebtPath } = require('../debt/debtPath');
const { readDebtEvents, projectDebtRemainder } = require('../debt/debtProjection');
const { appendDebtEvent } = require('../debt/debtWriter');
const { checkNewDebt } = require('../debt/debtAvailability');
const { appendDueChange, projectDue, isDebtOverdue } = require('../debt/debtOverdue');
const { loadDebtLimitsFile, resolveChildLimits } = require('../debt/debtLimits');
const { resolveDebtPortion } = require('../debt/debtPortion');
const { openRepayOperations, findRepayEvent } = require('../debt/debtRepay');

const LEDGER_OPS = Object.freeze([
  'create',
  'forgive',
  'set-due',
  'fine',
  'cancel-fine',
  'summary',
  'show',
  'repay',
  'reconcile',
]);

const EXIT_SUCCESS = 0;
const EXIT_VALIDATION = 1;
const EXIT_CANCEL = 2;
const EXIT_PENDING = 3;
const DUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} message
 * @returns {Error}
 */
function validationError(message) {
  const error = new Error(message);
  error.code = 'EDEBT_VALIDATION';
  return error;
}

/**
 * @returns {Error}
 */
function cancelError() {
  const error = new Error('debt operation cancelled');
  error.code = 'ECANCEL';
  return error;
}

/**
 * @param {string} message
 * @returns {Error}
 */
function pendingError(message) {
  const error = new Error(message);
  error.code = 'EDEBT_PENDING';
  return error;
}

/**
 * Success is 0. Confirmed failure is 1. Cancel is 2. Pending reconcile is 3.
 * @param {unknown} error
 * @returns {number}
 */
function exitCodeForDebtError(error) {
  if (error?.code === 'ECANCEL') {
    return EXIT_CANCEL;
  }
  if (error?.code === 'EDEBT_PENDING') {
    return EXIT_PENDING;
  }
  return EXIT_VALIDATION;
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
function hasText(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

/**
 * CLI action 6 ledger ops. Does not transfer tokens and does not assign sanctions.
 */
class DebtLedgerAction {
  /**
   * @param {{ config: { mode: string, chainId: number|string, token: { address: string }, parent: { address: string } } }} router
   * @param {{
   *   debtRoot?: string,
   *   limitsPath?: string,
   *   confirmFn?: (question: string) => Promise<string>,
   *   isTty?: boolean,
   *   now?: Date,
   *   env?: NodeJS.ProcessEnv,
   *   balanceFn?: (child: string) => Promise<bigint>,
   *   transferFn?: (child: string, pool: string, amount: bigint) => Promise<{ hash: string, wait: () => Promise<{ status?: number, transactionHash?: string }> }>,
   *   receiptFn?: (txHash: string) => Promise<{ status?: number }|null>,
   *   afterPending?: () => Promise<void>,
   * }} [options]
   */
  constructor(router, options = {}) {
    this.router = router;
    this.debtRoot = options.debtRoot;
    this.limitsPath = options.limitsPath;
    this.confirmFn = options.confirmFn;
    this.isTty = options.isTty;
    this.now = options.now ?? new Date();
    this.env = options.env ?? process.env;
    this.balanceFn = options.balanceFn;
    this.transferFn = options.transferFn;
    this.receiptFn = options.receiptFn;
    this.afterPending = options.afterPending;
  }

  /**
   * @returns {{ mode: string, chainId: string, token: string, pool: string }}
   */
  scope() {
    const config = this.router?.config;
    return {
      mode: config?.mode,
      chainId: String(config?.chainId ?? ''),
      token: config?.token?.address,
      pool: config?.parent?.address,
    };
  }

  /**
   * @returns {string}
   */
  childName() {
    const wallet = String(this.env.CAPYBARA_WALLET ?? '').trim().toLowerCase();
    if (wallet !== 'tristan' && wallet !== 'bastian') {
      throw validationError('CAPYBARA_WALLET must be tristan or bastian for action 6');
    }
    return wallet;
  }

  /**
   * @returns {string}
   */
  requireReason() {
    const reason = String(this.env.CAPYBARA_DEBT_REASON ?? '').trim();
    if (!reason) {
      throw validationError('CAPYBARA_DEBT_REASON is required');
    }
    return reason;
  }

  /**
   * @returns {string}
   */
  requireDebtId() {
    const debtId = String(this.env.CAPYBARA_DEBT_ID ?? '').trim();
    if (!debtId) {
      throw validationError('CAPYBARA_DEBT_ID is required');
    }
    return debtId;
  }

  /**
   * @param {string} child
   * @returns {Promise<Array<Record<string, unknown>>>}
   */
  async eventsFor(child) {
    const filePath = getChildDebtPath({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
    });
    return readDebtEvents(filePath);
  }

  /**
   * @param {string} preview
   * @returns {Promise<void>}
   */
  async confirmMutation(preview) {
    const params = {
      owedTotalDisplay: preview,
      walletName: this.childName(),
      question: `${preview} (да/нет) `,
    };
    if (this.confirmFn) {
      params.confirmFn = this.confirmFn;
    }
    if (this.isTty !== undefined) {
      params.isTty = this.isTty;
    }
    const accepted = await confirmPayment(params);
    if (!accepted) {
      throw cancelError();
    }
  }

  /**
   * @param {Array<Record<string, unknown>>} events
   * @param {string} debtId
   * @returns {Record<string, unknown>}
   */
  cardFor(events, debtId) {
    let original = 0n;
    let fines = 0n;
    let settled = 0n;
    let forgiven = 0n;
    for (const event of events) {
      if (event?.debt_id !== debtId) {
        continue;
      }
      const raw = event.amounts?.amount;
      const amount = typeof raw === 'string' ? BigInt(raw) : 0n;
      if (event.type === 'create') {
        original += amount;
      } else if (event.type === 'fine') {
        fines += amount;
      } else if (event.type === 'cancel-fine') {
        fines -= amount;
      } else if (event.type === 'repay-settled') {
        settled += amount;
      } else if (event.type === 'forgive') {
        forgiven += amount;
      }
    }
    const remainder = projectDebtRemainder(events, debtId);
    const due = projectDue(events, debtId);
    return {
      debtId,
      original: original.toString(),
      fines: fines.toString(),
      settled: settled.toString(),
      forgiven: forgiven.toString(),
      remainder: remainder.toString(),
      due: due.due,
      dueHistory: due.history,
      overdue: isDebtOverdue({ due: due.due, now: this.now, remainder }),
      pending: openRepayOperations(events, debtId).length > 0,
      closureHandoff: remainder === 0n,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async execute() {
    const op = String(this.env.CAPYBARA_DEBT_OP ?? '').trim();
    if (!LEDGER_OPS.includes(op)) {
      throw validationError(
        `unknown CAPYBARA_DEBT_OP: ${op || '(empty)'}. Available: ${LEDGER_OPS.join(', ')}`
      );
    }
    if (op === 'summary') {
      return this.summary();
    }
    if (op === 'show') {
      return this.show();
    }
    if (op === 'create') {
      return this.create();
    }
    if (op === 'forgive') {
      return this.forgive();
    }
    if (op === 'set-due') {
      return this.setDue();
    }
    if (op === 'fine') {
      return this.fine();
    }
    if (op === 'repay') {
      return this.repay();
    }
    if (op === 'reconcile') {
      return this.reconcile();
    }
    return this.cancelFine();
  }

  /**
   * @returns {Promise<object>}
   */
  async summary() {
    const child = this.childName();
    const events = await this.eventsFor(child);
    const ids = [];
    const seen = new Set();
    for (const event of events) {
      if (typeof event.debt_id === 'string' && !seen.has(event.debt_id)) {
        seen.add(event.debt_id);
        ids.push(event.debt_id);
      }
    }
    const debts = ids.map((debtId) => this.cardFor(events, debtId));
    const outstanding = debts.reduce((sum, card) => sum + BigInt(card.remainder), 0n);
    return {
      ok: true,
      action: 6,
      op: 'summary',
      confirmed: false,
      child,
      outstanding: outstanding.toString(),
      debts,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async show() {
    const child = this.childName();
    const debtId = this.requireDebtId();
    const events = await this.eventsFor(child);
    if (!events.some((event) => event.debt_id === debtId)) {
      throw validationError(`debt_id not found: ${debtId}`);
    }
    return {
      ok: true,
      action: 6,
      op: 'show',
      confirmed: false,
      child,
      card: this.cardFor(events, debtId),
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async create() {
    const child = this.childName();
    const reason = this.requireReason();
    if (hasText(this.env.CAPYBARA_DEBT_PERCENT) || String(this.env.CAPYBARA_DEBT_ALL ?? '').trim() === 'true') {
      throw validationError('create accepts an amount only');
    }
    const amountText = String(this.env.CAPYBARA_DEBT_AMOUNT ?? '').trim();
    if (!/^[0-9]+$/.test(amountText) || BigInt(amountText) <= 0n) {
      throw validationError('CAPYBARA_DEBT_AMOUNT must be a positive integer string');
    }
    const debtId = hasText(this.env.CAPYBARA_DEBT_ID)
      ? String(this.env.CAPYBARA_DEBT_ID).trim()
      : crypto.randomUUID();
    const clearDue = String(this.env.CAPYBARA_DEBT_DUE_CLEAR ?? '').trim() === 'true';
    const dueText = String(this.env.CAPYBARA_DEBT_DUE ?? '').trim();
    if (clearDue && dueText) {
      throw validationError('CAPYBARA_DEBT_DUE and CAPYBARA_DEBT_DUE_CLEAR conflict');
    }
    if (dueText && !DUE_PATTERN.test(dueText)) {
      throw validationError('CAPYBARA_DEBT_DUE must be YYYY-MM-DD');
    }
    const loaded = await loadDebtLimitsFile(this.limitsPath);
    const limits = resolveChildLimits(loaded, child, this.env);
    const preview = await checkNewDebt({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      limits,
      newDebtId: debtId,
      newAmount: amountText,
      now: this.now,
    });
    const overrideReason = String(this.env.CAPYBARA_DEBT_OVERRIDE_REASON ?? '').trim();
    if (!preview.allowed && !overrideReason) {
      const listed = preview.reasons.map((item) => item.code).join(', ');
      throw validationError(`create denied: ${listed}`);
    }
    const violated = preview.reasons.map((item) => item.code);
    const previewText = preview.allowed
      ? `Создать долг ${debtId} на ${amountText} (${reason})`
      : `Создать долг ${debtId} на ${amountText} в обход [${violated.join(', ')}] (${overrideReason})`;
    await this.confirmMutation(previewText);
    const again = await checkNewDebt({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      limits,
      newDebtId: debtId,
      newAmount: amountText,
      now: this.now,
    });
    const useOverride = !again.allowed;
    if (useOverride && !overrideReason) {
      throw validationError(`create denied: ${again.reasons.map((item) => item.code).join(', ')}`);
    }
    const written = await appendDebtEvent({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      debtId,
      type: 'create',
      amount: amountText,
      comment: reason,
      override: useOverride,
      overrideReason: useOverride ? overrideReason : undefined,
      violatedRules: useOverride ? again.reasons.map((item) => item.code) : undefined,
    });
    if (dueText) {
      await appendDueChange({
        child,
        scope: this.scope(),
        debtRoot: this.debtRoot,
        mode: this.scope().mode,
        debtId,
        due: dueText,
        reason,
        now: this.now,
      });
    }
    return {
      ok: true,
      action: 6,
      op: 'create',
      confirmed: true,
      child,
      debtId,
      remainder: written.event.remainder_after,
      onChainBalanceChanged: false,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async forgive() {
    const child = this.childName();
    const debtId = this.requireDebtId();
    const reason = this.requireReason();
    const events = await this.eventsFor(child);
    this.assertNoOpenRepay(events, debtId);
    const remainder = projectDebtRemainder(events, debtId);
    const portion = resolveDebtPortion({
      remainder,
      amount: this.env.CAPYBARA_DEBT_AMOUNT,
      percent: this.env.CAPYBARA_DEBT_PERCENT,
      all: String(this.env.CAPYBARA_DEBT_ALL ?? '').trim() === 'true',
    });
    await this.confirmMutation(`Простить ${portion} по ${debtId} (${reason})`);
    const written = await appendDebtEvent({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      debtId,
      type: 'forgive',
      amount: portion.toString(),
      comment: reason,
    });
    return {
      ok: true,
      action: 6,
      op: 'forgive',
      confirmed: true,
      child,
      debtId,
      forgiven: portion.toString(),
      remainder: written.event.remainder_after,
      onChainBalanceChanged: false,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async setDue() {
    const child = this.childName();
    const debtId = this.requireDebtId();
    const reason = this.requireReason();
    const clearDue = String(this.env.CAPYBARA_DEBT_DUE_CLEAR ?? '').trim() === 'true';
    const dueText = String(this.env.CAPYBARA_DEBT_DUE ?? '').trim();
    if (clearDue === (dueText !== '')) {
      throw validationError('set-due needs CAPYBARA_DEBT_DUE or CAPYBARA_DEBT_DUE_CLEAR');
    }
    if (dueText && !DUE_PATTERN.test(dueText)) {
      throw validationError('CAPYBARA_DEBT_DUE must be YYYY-MM-DD');
    }
    this.assertNoOpenRepay(await this.eventsFor(child), debtId);
    await this.confirmMutation(
      clearDue ? `Удалить срок ${debtId} (${reason})` : `Срок ${debtId} → ${dueText} (${reason})`
    );
    const written = await appendDueChange({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      debtId,
      due: clearDue ? null : dueText,
      reason,
      now: this.now,
    });
    return {
      ok: true,
      action: 6,
      op: 'set-due',
      confirmed: true,
      child,
      debtId,
      due: written.event.due,
      overdue: written.overdue,
      history: written.history,
      remainder: written.event.remainder_after,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async fine() {
    const child = this.childName();
    const debtId = this.requireDebtId();
    const reason = this.requireReason();
    if (hasText(this.env.CAPYBARA_DEBT_PERCENT) || String(this.env.CAPYBARA_DEBT_ALL ?? '').trim() === 'true') {
      throw validationError('fine accepts an amount only');
    }
    const amountText = String(this.env.CAPYBARA_DEBT_AMOUNT ?? '').trim();
    if (!/^[0-9]+$/.test(amountText) || BigInt(amountText) <= 0n) {
      throw validationError('CAPYBARA_DEBT_AMOUNT must be a positive integer string');
    }
    const events = await this.eventsFor(child);
    this.assertNoOpenRepay(events, debtId);
    if (projectDebtRemainder(events, debtId) <= 0n) {
      throw validationError('closed debt cannot be fined');
    }
    await this.confirmMutation(`Штраф ${amountText} по ${debtId} (${reason})`);
    const written = await appendDebtEvent({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      debtId,
      type: 'fine',
      amount: amountText,
      comment: reason,
    });
    return {
      ok: true,
      action: 6,
      op: 'fine',
      confirmed: true,
      child,
      debtId,
      remainder: written.event.remainder_after,
      onChainBalanceChanged: false,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async cancelFine() {
    const child = this.childName();
    const debtId = this.requireDebtId();
    const reason = this.requireReason();
    const fineId = String(this.env.CAPYBARA_DEBT_FINE_ID ?? '').trim();
    if (!fineId) {
      throw validationError('CAPYBARA_DEBT_FINE_ID is required');
    }
    const events = await this.eventsFor(child);
    this.assertNoOpenRepay(events, debtId);
    const fineIndex = events.findIndex(
      (event) => event.debt_id === debtId && event.type === 'fine' && event.event_id === fineId
    );
    if (fineIndex < 0) {
      throw validationError(`fine not found: ${fineId}`);
    }
    const later = events.slice(fineIndex + 1);
    const blocked = later.some((event) => {
      if (event.debt_id !== debtId || typeof event.type !== 'string') {
        return false;
      }
      return event.type === 'forgive' || event.type.startsWith('repay-');
    });
    if (blocked) {
      throw validationError('cancel-fine only before a later repay or forgive');
    }
    if (events.some((event) => event.type === 'cancel-fine' && event.operation_id === fineId)) {
      throw validationError('fine is already cancelled');
    }
    const amount = String(events[fineIndex].amounts.amount);
    await this.confirmMutation(`Отменить штраф ${fineId} на ${amount} (${reason})`);
    const written = await appendDebtEvent({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      debtId,
      type: 'cancel-fine',
      amount,
      comment: reason,
      operationId: fineId,
    });
    return {
      ok: true,
      action: 6,
      op: 'cancel-fine',
      confirmed: true,
      child,
      debtId,
      remainder: written.event.remainder_after,
    };
  }

  /**
   * @param {Array<Record<string, unknown>>} events
   * @param {string} debtId
   * @returns {void}
   */
  assertNoOpenRepay(events, debtId) {
    const open = openRepayOperations(events, debtId);
    if (open.length > 0) {
      throw validationError(
        `pending repay ${open[0].operation_id} blocks this operation until reconcile`
      );
    }
  }

  /**
   * @param {string} child
   * @returns {Promise<bigint>}
   */
  async balanceOf(child) {
    if (this.balanceFn) {
      return this.balanceFn(child);
    }
    const address = this.router?.config?.[child]?.address;
    return this.router.capyToken.getBalance(address);
  }

  /**
   * @param {string} child
   * @param {bigint} amount
   * @returns {Promise<{ hash: string, wait: () => Promise<{ status?: number }> }>}
   */
  async sendTransfer(child, amount) {
    const pool = this.scope().pool;
    if (this.transferFn) {
      return this.transferFn(child, pool, amount);
    }
    return this.router.capyToken.transfer(child, pool, amount);
  }

  /**
   * @param {string} txHash
   * @returns {Promise<{ status?: number }|null>}
   */
  async readReceipt(txHash) {
    if (this.receiptFn) {
      return this.receiptFn(txHash);
    }
    const provider = this.router?.capyToken?.provider;
    if (typeof provider?.getTransactionReceipt !== 'function') {
      throw validationError('cannot read transfer receipt');
    }
    return provider.getTransactionReceipt(txHash);
  }

  /**
   * @param {bigint} required
   * @param {bigint} available
   * @returns {Error}
   */
  insufficientBalance(required, available) {
    const shortfall = required - available;
    return validationError(
      `insufficient balance: required ${required}, available ${available}, shortfall ${shortfall}`
    );
  }

  /**
   * @param {string} child
   * @param {string} debtId
   * @param {string} amount
   * @param {string} operationId
   * @param {string} type
   * @param {string} [txHash]
   * @param {string} [comment]
   * @returns {Promise<Record<string, unknown>>}
   */
  async appendRepay(child, debtId, amount, operationId, type, txHash, comment) {
    const written = await appendDebtEvent({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      debtId,
      type,
      amount,
      operationId,
      txHash,
      comment,
    });
    return written.event;
  }

  /**
   * @returns {Promise<object>}
   */
  async repay() {
    const child = this.childName();
    const debtId = this.requireDebtId();
    const comment = String(this.env.CAPYBARA_DEBT_REASON ?? '').trim();
    const events = await this.eventsFor(child);
    this.assertNoOpenRepay(events, debtId);
    const remainder = projectDebtRemainder(events, debtId);
    const portion = resolveDebtPortion({
      remainder,
      amount: this.env.CAPYBARA_DEBT_AMOUNT,
      percent: this.env.CAPYBARA_DEBT_PERCENT,
      all: String(this.env.CAPYBARA_DEBT_ALL ?? '').trim() === 'true',
    });
    const available = await this.balanceOf(child);
    if (available < portion) {
      throw this.insufficientBalance(portion, available);
    }
    await this.confirmMutation(`Погасить ${portion} по ${debtId} в пул`);
    const again = await this.eventsFor(child);
    this.assertNoOpenRepay(again, debtId);
    const remainderAgain = projectDebtRemainder(again, debtId);
    if (portion > remainderAgain) {
      throw validationError(`amount ${portion} exceeds remainder ${remainderAgain}`);
    }
    const availableAgain = await this.balanceOf(child);
    if (availableAgain < portion) {
      throw this.insufficientBalance(portion, availableAgain);
    }
    const operationId = crypto.randomUUID();
    const amount = portion.toString();
    await this.appendRepay(child, debtId, amount, operationId, 'repay-intent', undefined, comment || undefined);
    let txHash;
    try {
      const tx = await this.sendTransfer(child, portion);
      txHash = tx.hash;
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        await this.appendRepay(child, debtId, amount, operationId, 'repay-failed', txHash, comment || undefined);
        throw validationError('transfer was not confirmed');
      }
    } catch (error) {
      if (error?.code === 'EDEBT_VALIDATION') {
        throw error;
      }
      if (!txHash) {
        await this.appendRepay(child, debtId, amount, operationId, 'repay-failed', undefined, comment || undefined);
        throw validationError('transfer did not return a tx hash');
      }
      let receipt = null;
      try {
        receipt = await this.readReceipt(txHash);
      } catch (readError) {
        if (readError?.code === 'EDEBT_VALIDATION') {
          throw readError;
        }
        receipt = null;
      }
      if (receipt && receipt.status !== 1) {
        await this.appendRepay(child, debtId, amount, operationId, 'repay-failed', txHash, comment || undefined);
        throw validationError('transfer was not confirmed');
      }
      await this.appendRepay(child, debtId, amount, operationId, 'repay-pending', txHash, comment || undefined);
      throw pendingError(`transfer ${txHash} is waiting for reconcile`);
    }
    await this.appendRepay(child, debtId, amount, operationId, 'repay-pending', txHash, comment || undefined);
    if (this.afterPending) {
      await this.afterPending();
    }
    const settled = await this.appendRepay(
      child,
      debtId,
      amount,
      operationId,
      'repay-settled',
      txHash,
      comment || undefined
    );
    return {
      ok: true,
      action: 6,
      op: 'repay',
      confirmed: true,
      child,
      debtId,
      operationId,
      txHash,
      repaid: amount,
      remainder: settled.remainder_after,
      closureHandoff: settled.remainder_after === '0',
    };
  }

  /**
   * Finish one original operation. Does not send another transfer.
   * @returns {Promise<object>}
   */
  async reconcile() {
    const child = this.childName();
    const debtId = this.requireDebtId();
    const operationId = String(this.env.CAPYBARA_DEBT_OPERATION_ID ?? '').trim();
    if (!operationId) {
      throw validationError('CAPYBARA_DEBT_OPERATION_ID is required');
    }
    const events = await this.eventsFor(child);
    const settled = findRepayEvent(events, operationId, 'repay-settled');
    if (settled) {
      return {
        ok: true,
        action: 6,
        op: 'reconcile',
        confirmed: false,
        idempotent: true,
        transferred: false,
        child,
        debtId,
        operationId,
        txHash: settled.tx_hash ?? null,
        remainder: settled.remainder_after,
      };
    }
    if (findRepayEvent(events, operationId, 'repay-failed')) {
      throw validationError(`repay ${operationId} already failed`);
    }
    const pending = findRepayEvent(events, operationId, 'repay-pending')
      ?? findRepayEvent(events, operationId, 'repay-intent');
    if (!pending) {
      throw validationError(`repay operation not found: ${operationId}`);
    }
    const txHash = typeof pending.tx_hash === 'string' ? pending.tx_hash : '';
    const amount = String(pending.amounts?.amount ?? '');
    const comment = typeof pending.comment === 'string' ? pending.comment : undefined;
    if (!txHash) {
      await this.confirmMutation(`Закрыть ${operationId} без hash как неуспешное погашение`);
      await this.appendRepay(child, debtId, amount, operationId, 'repay-failed', undefined, comment);
      throw validationError(`repay ${operationId} closed as failed without a tx hash`);
    }
    const receipt = await this.readReceipt(txHash);
    if (!receipt) {
      throw pendingError(`transfer ${txHash} is waiting for reconcile`);
    }
    if (receipt.status !== 1) {
      await this.appendRepay(child, debtId, amount, operationId, 'repay-failed', txHash, comment);
      throw validationError('transfer was not confirmed');
    }
    await this.confirmMutation(`Сверить ${operationId} (${txHash}) без нового перевода`);
    const fresh = await this.eventsFor(child);
    const already = findRepayEvent(fresh, operationId, 'repay-settled');
    if (already) {
      return {
        ok: true,
        action: 6,
        op: 'reconcile',
        confirmed: true,
        idempotent: true,
        transferred: false,
        child,
        debtId,
        operationId,
        txHash,
        remainder: already.remainder_after,
      };
    }
    const written = await this.appendRepay(
      child,
      debtId,
      amount,
      operationId,
      'repay-settled',
      txHash,
      comment
    );
    return {
      ok: true,
      action: 6,
      op: 'reconcile',
      confirmed: true,
      idempotent: false,
      transferred: false,
      child,
      debtId,
      operationId,
      txHash,
      remainder: written.remainder_after,
      closureHandoff: written.remainder_after === '0',
    };
  }
}

module.exports = {
  LEDGER_OPS,
  EXIT_SUCCESS,
  EXIT_VALIDATION,
  EXIT_CANCEL,
  EXIT_PENDING,
  DebtLedgerAction,
  exitCodeForDebtError,
  validationError,
  pendingError,
};
