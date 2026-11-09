'use strict';

const crypto = require('crypto');
const { confirmPayment } = require('../daily-payments/confirmPayment');
const { getChildDebtPath } = require('../debt/debtPath');
const { readDebtEvents, projectDebtRemainder } = require('../debt/debtProjection');
const { appendDebtEvent } = require('../debt/debtWriter');
const { checkNewDebt } = require('../debt/debtAvailability');
const { appendDueChange, projectDue, isDebtOverdue, tallinnCalendarDate } = require('../debt/debtOverdue');
const { loadDebtLimitsFile, resolveChildLimits, scaleOutstandingToRaw } = require('../debt/debtLimits');
const { resolveDebtPortion } = require('../debt/debtPortion');
const { parseHumanToRaw, formatRawAmount, AMOUNT_UNIT_RAW } = require('../debt/debtAmount');
const { migrateHumanWholeJournal } = require('../debt/debtMigrate');
const { openRepayOperations, findRepayEvent } = require('../debt/debtRepay');
const { activeSanctions, unresolvedSanctions, hasManualBlock, mergedGadgets, parseDecisionList, SANCTION_TYPES } = require('../debt/debtSanctions');

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
  'sanction-add',
  'sanction-cancel',
  'resolve-closure',
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
 * CLI action 6 ledger ops. Sanction rows do not control a device and do not change the remainder.
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
    this.decimals = options.decimals ?? null;
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
   * @returns {Promise<number>}
   */
  async tokenDecimals() {
    if (this.decimals != null) {
      return this.decimals;
    }
    const token = this.router?.capyToken;
    if (typeof token?.getDecimals === 'function') {
      this.decimals = Number(await token.getDecimals());
      return this.decimals;
    }
    throw validationError('token decimals are required for a debt amount');
  }

  /**
   * @param {string} child
   * @returns {Promise<void>}
   */
  async prepareJournal(child) {
    const filePath = getChildDebtPath({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
    });
    await migrateHumanWholeJournal(filePath, await this.tokenDecimals());
  }

  /**
   * @returns {Promise<bigint|undefined>}
   */
  async optionalHumanRaw() {
    const text = String(this.env.CAPYBARA_DEBT_AMOUNT ?? '').trim();
    if (!text) {
      return undefined;
    }
    return parseHumanToRaw(text, await this.tokenDecimals());
  }

  /**
   * @param {bigint} remainder
   * @returns {Promise<bigint>}
   */
  async portionFrom(remainder) {
    return resolveDebtPortion({
      remainder,
      amount: await this.optionalHumanRaw(),
      percent: this.env.CAPYBARA_DEBT_PERCENT,
      all: String(this.env.CAPYBARA_DEBT_ALL ?? '').trim() === 'true',
    });
  }

  /**
   * @param {string} child
   * @returns {Promise<object>}
   */
  async scaledLimits(child) {
    const loaded = await loadDebtLimitsFile(this.limitsPath);
    return scaleOutstandingToRaw(
      resolveChildLimits(loaded, child, this.env),
      await this.tokenDecimals()
    );
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
   * @param {string} child
   * @returns {string}
   */
  journalFile(child) {
    return getChildDebtPath({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
    });
  }

  /**
   * @param {Array<Record<string, unknown>>} events
   * @param {string} debtId
   * @param {number} decimals
   * @returns {Record<string, unknown>}
   */
  cardFor(events, debtId, decimals) {
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
    const create = events.find((event) => event?.debt_id === debtId && event.type === 'create');
    const comment = typeof create?.comment === 'string' ? create.comment : '';
    return {
      debtId,
      amount_unit: AMOUNT_UNIT_RAW,
      original: original.toString(),
      fines: fines.toString(),
      settled: settled.toString(),
      forgiven: forgiven.toString(),
      remainder: remainder.toString(),
      remainder_human: formatRawAmount(remainder, decimals),
      comment,
      due: due.due,
      dueHistory: due.history,
      overdue: isDebtOverdue({ due: due.due, now: this.now, remainder }),
      pending: openRepayOperations(events, debtId).length > 0,
      closureHandoff: remainder === 0n,
      pendingResolve: remainder === 0n && unresolvedSanctions(events, debtId).length > 0,
      sanctions: activeSanctions(events, debtId).map((event) => ({
        sanctionId: event.sanction_id,
        type: event.sanction_type,
        reason: event.comment ?? '',
        dates: event.dates ?? [],
      })),
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
    await this.prepareJournal(this.childName());
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
    if (op === 'sanction-add') {
      return this.sanctionAdd();
    }
    if (op === 'sanction-cancel') {
      return this.sanctionCancel();
    }
    if (op === 'resolve-closure') {
      return this.resolveClosure();
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
    const decimals = await this.tokenDecimals();
    const debts = ids.map((debtId) => this.cardFor(events, debtId, decimals));
    const outstanding = debts.reduce((sum, card) => sum + BigInt(card.remainder), 0n);
    const loaded = await loadDebtLimitsFile(this.limitsPath);
    const limits = resolveChildLimits(loaded, child, this.env);
    const gadgets = mergedGadgets(events, tallinnCalendarDate(this.now), limits.gadgetMinutes.toString());
    return {
      ok: true,
      action: 6,
      op: 'summary',
      confirmed: false,
      child,
      amount_unit: AMOUNT_UNIT_RAW,
      outstanding: outstanding.toString(),
      outstanding_human: formatRawAmount(outstanding, decimals),
      journalPath: this.journalFile(child),
      scope: this.scope(),
      mode: this.scope().mode,
      debts,
      gadgets: gadgets.current,
      gadgetHistory: gadgets.history,
      unresolvedClosures: debts.filter((card) => card.pendingResolve).map((card) => card.debtId),
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
    const decimals = await this.tokenDecimals();
    return {
      ok: true,
      action: 6,
      op: 'show',
      confirmed: false,
      child,
      amount_unit: AMOUNT_UNIT_RAW,
      journalPath: this.journalFile(child),
      scope: this.scope(),
      mode: this.scope().mode,
      card: this.cardFor(events, debtId, decimals),
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
    const raw = await this.optionalHumanRaw();
    if (raw == null) {
      throw validationError('CAPYBARA_DEBT_AMOUNT must be a positive decimal string');
    }
    const amountText = raw.toString();
    const shown = formatRawAmount(raw, await this.tokenDecimals());
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
    const limits = await this.scaledLimits(child);
    const manualBlock = hasManualBlock(await this.eventsFor(child));
    const preview = await checkNewDebt({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      limits,
      newDebtId: debtId,
      newAmount: amountText,
      now: this.now,
      manualBlock,
    });
    const overrideReason = String(this.env.CAPYBARA_DEBT_OVERRIDE_REASON ?? '').trim();
    if (!preview.allowed && !overrideReason) {
      const listed = preview.reasons.map((item) => item.code).join(', ');
      throw validationError(`create denied: ${listed}`);
    }
    const violated = preview.reasons.map((item) => item.code);
    const previewText = preview.allowed
      ? `Создать долг ${debtId} на ${shown} (${reason})`
      : `Создать долг ${debtId} на ${shown} в обход [${violated.join(', ')}] (${overrideReason})`;
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
      manualBlock: hasManualBlock(await this.eventsFor(child)),
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
    const portion = await this.portionFrom(remainder);
    const closing = portion === remainder;
    if (closing) {
      await this.confirmClose(`Простить ${portion} по ${debtId} (${reason})`, events, debtId);
    } else {
      await this.confirmMutation(`Простить ${portion} по ${debtId} (${reason})`);
    }
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
    const resolution = closing
      ? await this.finishSanctionDialog(child, debtId)
      : { pendingResolve: false };
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
      pendingResolve: resolution.pendingResolve,
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
    const raw = await this.optionalHumanRaw();
    if (raw == null) {
      throw validationError('CAPYBARA_DEBT_AMOUNT must be a positive decimal string');
    }
    const amountText = raw.toString();
    const shown = formatRawAmount(raw, await this.tokenDecimals());
    const events = await this.eventsFor(child);
    this.assertNoOpenRepay(events, debtId);
    if (projectDebtRemainder(events, debtId) <= 0n) {
      throw validationError('closed debt cannot be fined');
    }
    await this.confirmMutation(`Штраф ${shown} по ${debtId} (${reason})`);
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
    const portion = await this.portionFrom(remainder);
    const available = await this.balanceOf(child);
    if (available < portion) {
      throw this.insufficientBalance(portion, available);
    }
    const closing = portion === remainder;
    if (closing) {
      await this.confirmClose(`Погасить ${portion} по ${debtId} в пул`, events, debtId);
    } else {
      await this.confirmMutation(`Погасить ${portion} по ${debtId} в пул`);
    }
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
    const resolution = settled.remainder_after === '0'
      ? await this.finishSanctionDialog(child, debtId)
      : { pendingResolve: false };
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
      pendingResolve: resolution.pendingResolve,
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
    const closing = BigInt(amount || '0') === projectDebtRemainder(events, debtId);
    if (closing) {
      await this.confirmClose(`Сверить ${operationId} (${txHash}) без нового перевода`, events, debtId);
    } else {
      await this.confirmMutation(`Сверить ${operationId} (${txHash}) без нового перевода`);
    }
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
    const resolution = written.remainder_after === '0'
      ? await this.finishSanctionDialog(child, debtId)
      : { pendingResolve: false };
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
      pendingResolve: resolution.pendingResolve,
    };
  }

  /**
   * @param {string} preview
   * @param {Array<Record<string, unknown>>} events
   * @param {string} debtId
   * @returns {Promise<void>}
   */
  async confirmClose(preview, events, debtId) {
    const active = unresolvedSanctions(events, debtId);
    if (active.length > 0) {
      this.assertDecisionList(active);
    }
    if (this.isTty === false && active.length > 0) {
      return;
    }
    await this.confirmMutation(preview);
  }

  /**
   * @returns {Array<{ sanction_id: string, decision: string }>|null}
   */
  explicitDecisions() {
    return parseDecisionList(this.env.CAPYBARA_DEBT_DECISIONS);
  }

  /**
   * @param {Array<Record<string, unknown>>} active
   * @returns {Array<{ sanction_id: string, decision: string }>|null}
   */
  assertDecisionList(active) {
    const decisions = this.explicitDecisions();
    if (this.isTty === false && !decisions) {
      throw validationError('explicit sanction decisions are required before close');
    }
    if (!decisions) {
      return null;
    }
    const expected = new Set(active.map((event) => event.sanction_id));
    const seen = new Set();
    for (const item of decisions) {
      if (!item.sanction_id || (item.decision !== 'leave' && item.decision !== 'cancel')) {
        throw validationError('sanction decision must be sanction_id:leave or sanction_id:cancel');
      }
      if (!expected.has(item.sanction_id)) {
        throw validationError(`sanction ${item.sanction_id} is not an active sanction of this debt`);
      }
      if (seen.has(item.sanction_id)) {
        throw validationError(`duplicate decision for ${item.sanction_id}`);
      }
      seen.add(item.sanction_id);
    }
    if (seen.size !== expected.size) {
      throw validationError('every active sanction needs a leave or cancel decision');
    }
    if (decisions.some((item) => item.decision === 'cancel') && !this.cancelReason()) {
      throw validationError('a cancel reason is required');
    }
    return decisions;
  }

  /**
   * @returns {string}
   */
  cancelReason() {
    return String(this.env.CAPYBARA_DEBT_CANCEL_REASON ?? this.env.CAPYBARA_DEBT_REASON ?? '').trim();
  }

  /**
   * @param {string} child
   * @param {string} debtId
   * @returns {Promise<{ pendingResolve: boolean }>}
   */
  async finishSanctionDialog(child, debtId) {
    const events = await this.eventsFor(child);
    const active = unresolvedSanctions(events, debtId);
    if (active.length === 0) {
      return { pendingResolve: false };
    }
    const prepared = this.assertDecisionList(active);
    if (prepared) {
      await this.writeClosure(child, debtId, prepared);
      return { pendingResolve: false };
    }
    try {
      await this.confirmMutation(`Решить санкции по ${debtId} сейчас`);
    } catch (error) {
      if (error?.code === 'ECANCEL') {
        return { pendingResolve: true };
      }
      throw error;
    }
    /** @type {Array<{ sanction_id: string, decision: string }>} */
    const chosen = [];
    for (const sanction of active) {
      let decision = 'leave';
      try {
        await this.confirmMutation(
          `Отменить санкцию ${sanction.sanction_id}? да отменяет, нет оставляет`
        );
        decision = 'cancel';
      } catch (error) {
        if (error?.code !== 'ECANCEL') {
          throw error;
        }
      }
      chosen.push({ sanction_id: sanction.sanction_id, decision });
    }
    if (chosen.some((item) => item.decision === 'cancel') && !this.cancelReason()) {
      return { pendingResolve: true };
    }
    await this.writeClosure(child, debtId, chosen);
    return { pendingResolve: false };
  }

  /**
   * @param {string} child
   * @param {string} debtId
   * @param {Array<{ sanction_id: string, decision: string }>} decisions
   * @returns {Promise<void>}
   */
  async writeClosure(child, debtId, decisions) {
    const reason = this.cancelReason();
    await appendDebtEvent({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      debtId,
      type: 'closure-resolve',
      comment: reason || undefined,
      decisions,
    });
    for (const item of decisions) {
      if (item.decision !== 'cancel') {
        continue;
      }
      await appendDebtEvent({
        child,
        scope: this.scope(),
        debtRoot: this.debtRoot,
        mode: this.scope().mode,
        debtId,
        type: 'sanction-cancel',
        sanctionId: item.sanction_id,
        comment: reason,
      });
    }
  }

  /**
   * @param {string} raw
   * @returns {string[]}
   */
  parseDates(raw) {
    const dates = String(raw ?? '').split(',').map((part) => part.trim()).filter(Boolean);
    const unique = [];
    for (const date of dates) {
      if (!DUE_PATTERN.test(date)) {
        throw validationError('CAPYBARA_DEBT_DATES must be YYYY-MM-DD');
      }
      if (!unique.includes(date)) {
        unique.push(date);
      }
    }
    return unique;
  }

  /**
   * @returns {Promise<object>}
   */
  async sanctionAdd() {
    const child = this.childName();
    const debtId = this.requireDebtId();
    const reason = this.requireReason();
    const sanctionType = String(this.env.CAPYBARA_DEBT_SANCTION_TYPE ?? '').trim();
    if (!SANCTION_TYPES.has(sanctionType)) {
      throw validationError('CAPYBARA_DEBT_SANCTION_TYPE must be gadget or block-new-debts');
    }
    const dates = sanctionType === 'gadget'
      ? this.parseDates(this.env.CAPYBARA_DEBT_DATES)
      : [];
    if (sanctionType === 'gadget' && dates.length === 0) {
      throw validationError('a gadget sanction needs at least one date');
    }
    const events = await this.eventsFor(child);
    if (!events.some((event) => event.debt_id === debtId)) {
      throw validationError(`debt_id not found: ${debtId}`);
    }
    const loaded = await loadDebtLimitsFile(this.limitsPath);
    const limits = resolveChildLimits(loaded, child, this.env);
    const sanctionId = String(this.env.CAPYBARA_DEBT_SANCTION_ID ?? '').trim() || crypto.randomUUID();
    await this.confirmMutation(`Назначить ${sanctionType} ${sanctionId} по ${debtId} (${reason})`);
    const written = await appendDebtEvent({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      debtId,
      type: 'sanction-add',
      comment: reason,
      sanctionId,
      sanctionType,
      dates: sanctionType === 'gadget' ? dates : undefined,
      gadgetMinutes: sanctionType === 'gadget' ? limits.gadgetMinutes.toString() : undefined,
    });
    return {
      ok: true,
      action: 6,
      op: 'sanction-add',
      confirmed: true,
      child,
      debtId,
      sanctionId,
      remainder: written.event.remainder_after,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async sanctionCancel() {
    const child = this.childName();
    const reason = this.requireReason();
    const sanctionId = String(this.env.CAPYBARA_DEBT_SANCTION_ID ?? '').trim();
    if (!sanctionId) {
      throw validationError('CAPYBARA_DEBT_SANCTION_ID is required');
    }
    const events = await this.eventsFor(child);
    const sanction = activeSanctions(events).find((event) => event.sanction_id === sanctionId);
    if (!sanction) {
      throw validationError(`active sanction not found: ${sanctionId}`);
    }
    await this.confirmMutation(`Снять санкцию ${sanctionId} (${reason})`);
    const written = await appendDebtEvent({
      child,
      scope: this.scope(),
      debtRoot: this.debtRoot,
      mode: this.scope().mode,
      debtId: String(sanction.debt_id),
      type: 'sanction-cancel',
      sanctionId,
      comment: reason,
    });
    return {
      ok: true,
      action: 6,
      op: 'sanction-cancel',
      confirmed: true,
      child,
      debtId: sanction.debt_id,
      sanctionId,
      remainder: written.event.remainder_after,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async resolveClosure() {
    const child = this.childName();
    const debtId = this.requireDebtId();
    const events = await this.eventsFor(child);
    const active = unresolvedSanctions(events, debtId);
    if (active.length === 0) {
      return {
        ok: true,
        action: 6,
        op: 'resolve-closure',
        confirmed: false,
        idempotent: true,
        child,
        debtId,
        pendingResolve: false,
      };
    }
    const decisions = this.assertDecisionList(active);
    if (!decisions) {
      throw validationError('CAPYBARA_DEBT_DECISIONS is required');
    }
    if (this.isTty !== false) {
      await this.confirmMutation(`Записать решения по санкциям ${debtId}`);
    }
    await this.writeClosure(child, debtId, decisions);
    return {
      ok: true,
      action: 6,
      op: 'resolve-closure',
      confirmed: true,
      child,
      debtId,
      pendingResolve: false,
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
