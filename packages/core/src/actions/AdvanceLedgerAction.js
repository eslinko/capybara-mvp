'use strict';

const crypto = require('crypto');
const { confirmPayment } = require('../daily-payments/confirmPayment');
const { getChildAdvancePath } = require('../advance/advancePath');
const { readAdvanceEvents, projectAdvanceRemainder } = require('../advance/advanceProjection');
const { appendAdvanceEvent } = require('../advance/advanceWriter');
const { findOpenSettleOperation, requireOpenAdvance } = require('../advance/advanceSettle');
const { checkNewAdvance } = require('../advance/advanceAvailability');
const { loadAdvanceLimitsFile, resolveChildAdvanceLimits, scaleAdvanceOutstandingToRaw } = require('../advance/advanceLimits');
const { parseHumanToRaw, formatRawAmount, AMOUNT_UNIT_RAW } = require('../debt/debtAmount');

const LEDGER_OPS = Object.freeze(['issue', 'forgive', 'settle', 'summary', 'show']);

const EXIT_VALIDATION = 1;
const EXIT_CANCEL = 2;
const EXIT_PENDING = 3;

/**
 * @param {string} message
 * @returns {Error}
 */
function validationError(message) {
  const error = new Error(message);
  error.code = 'EADVANCE_VALIDATION';
  return error;
}

/**
 * @param {string} [message]
 * @returns {Error}
 */
function cancelError(message) {
  const error = new Error(message || 'advance operation cancelled');
  error.code = 'ECANCEL';
  return error;
}

/**
 * @param {string} message
 * @returns {Error}
 */
function pendingError(message) {
  const error = new Error(message);
  error.code = 'EADVANCE_PENDING';
  return error;
}

/**
 * @param {unknown} error
 * @returns {number}
 */
function exitCodeForAdvanceError(error) {
  if (error?.code === 'ECANCEL' || error?.code === 'TTY_REQUIRED') {
    return EXIT_CANCEL;
  }
  if (error?.code === 'EADVANCE_PENDING') {
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
 * A mined receipt is successful only when its status is 1.
 * @param {unknown} receipt
 * @returns {boolean}
 */
function receiptSucceeded(receipt) {
  const status = receipt && typeof receipt === 'object' ? receipt.status : undefined;
  return status === 1 || status === 1n;
}

/**
 * Action 7 advance ledger. Manual settle claws the full open remainder back to the pool.
 */
class AdvanceLedgerAction {
  /**
   * @param {{ config?: { mode?: string, chainId?: number|string, token?: { address?: string }, parent?: { address?: string } }, capyToken?: object, walletRegistry?: object, provider?: object, rpcManager?: object|null, logger?: { info?: Function, warn?: Function, error?: Function } }} router
   * @param {{
   *   advanceRoot?: string,
   *   limitsPath?: string,
   *   confirmFn?: (question: string) => Promise<string>,
   *   isTty?: boolean,
   *   env?: NodeJS.ProcessEnv,
   *   decimals?: number,
   *   transferFn?: (child: string, amountRaw: bigint) => Promise<{ hash?: string, txHash?: string, wait?: () => Promise<unknown> }>,
   *   balanceFn?: (child: string) => Promise<bigint>|bigint,
   *   readReceiptFn?: (txHash: string) => Promise<unknown>,
   * }} [options]
   */
  constructor(router, options = {}) {
    this.router = router;
    this.advanceRoot = options.advanceRoot;
    this.limitsPath = options.limitsPath;
    this.confirmFn = options.confirmFn;
    this.isTty = options.isTty;
    this.env = options.env ?? process.env;
    this.decimals = options.decimals ?? null;
    this.transferFn = options.transferFn;
    this.balanceFn = options.balanceFn;
    this.readReceiptFn = options.readReceiptFn;
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
   * @returns {boolean}
   */
  isMock() {
    return this.scope().mode !== 'gfl_reality';
  }

  /**
   * @returns {string}
   */
  childName() {
    const wallet = String(this.env.CAPYBARA_WALLET ?? '').trim().toLowerCase();
    if (wallet !== 'tristan' && wallet !== 'bastian') {
      throw validationError('CAPYBARA_WALLET must be tristan or bastian for action 7');
    }
    return wallet;
  }

  /**
   * @param {string} child
   * @returns {string}
   */
  journalFile(child) {
    return getChildAdvancePath({
      child,
      scope: this.scope(),
      advanceRoot: this.advanceRoot,
      mode: this.scope().mode,
    });
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
    throw validationError('token decimals are required for an advance amount');
  }

  /**
   * @param {string} child
   * @returns {Promise<Array<Record<string, unknown>>>}
   */
  async eventsFor(child) {
    return readAdvanceEvents(this.journalFile(child));
  }

  /**
   * @returns {Promise<object>}
   */
  async execute() {
    const op = String(this.env.CAPYBARA_ADVANCE_OP ?? '').trim();
    if (!LEDGER_OPS.includes(op)) {
      throw validationError(
        `unknown CAPYBARA_ADVANCE_OP: ${op || '(empty)'}. Available: ${LEDGER_OPS.join(', ')}`
      );
    }
    if (op === 'summary') return this.summary();
    if (op === 'show') return this.show();
    if (op === 'issue') return this.issue();
    if (op === 'settle') return this.settle();
    return this.forgive();
  }

  /**
   * @param {Array<Record<string, unknown>>} events
   * @returns {string[]}
   */
  advanceIds(events) {
    const ids = [];
    const seen = new Set();
    for (const event of events) {
      if (typeof event.advance_id === 'string' && !seen.has(event.advance_id)) {
        seen.add(event.advance_id);
        ids.push(event.advance_id);
      }
    }
    return ids;
  }

  /**
   * @param {Array<Record<string, unknown>>} events
   * @param {string} advanceId
   * @param {number} decimals
   * @returns {Record<string, unknown>}
   */
  cardFor(events, advanceId, decimals) {
    const mine = events.filter((event) => event.advance_id === advanceId);
    const issue = mine.find((event) => event.type === 'issue');
    const remainder = projectAdvanceRemainder(events, advanceId);
    const original = issue?.amounts?.amount != null ? BigInt(String(issue.amounts.amount)) : 0n;
    return {
      advanceId,
      comment: issue?.comment ?? '',
      original: original.toString(),
      original_human: formatRawAmount(original, decimals),
      remainder: remainder.toString(),
      remainder_human: formatRawAmount(remainder, decimals),
      txHash: issue?.tx_hash ?? '',
      recordedAt: issue?.timestamps?.recorded_at ?? '',
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async summary() {
    const child = this.childName();
    const events = await this.eventsFor(child);
    const decimals = await this.tokenDecimals();
    const advances = this.advanceIds(events)
      .map((advanceId) => this.cardFor(events, advanceId, decimals))
      .filter((card) => BigInt(String(card.remainder)) > 0n);
    const outstanding = advances.reduce((sum, card) => sum + BigInt(String(card.remainder)), 0n);
    return {
      ok: true,
      action: 7,
      op: 'summary',
      confirmed: false,
      child,
      amount_unit: AMOUNT_UNIT_RAW,
      outstanding: outstanding.toString(),
      outstanding_human: formatRawAmount(outstanding, decimals),
      journalPath: this.journalFile(child),
      scope: this.scope(),
      mode: this.scope().mode,
      advances,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async show() {
    const child = this.childName();
    const advanceId = String(this.env.CAPYBARA_ADVANCE_ID ?? '').trim();
    if (!advanceId) {
      throw validationError('CAPYBARA_ADVANCE_ID is required');
    }
    const events = await this.eventsFor(child);
    const history = events.filter((event) => event.advance_id === advanceId);
    if (history.length === 0) {
      throw validationError(`advance_id not found: ${advanceId}`);
    }
    const decimals = await this.tokenDecimals();
    return {
      ok: true,
      action: 7,
      op: 'show',
      confirmed: false,
      child,
      amount_unit: AMOUNT_UNIT_RAW,
      journalPath: this.journalFile(child),
      scope: this.scope(),
      mode: this.scope().mode,
      card: this.cardFor(events, advanceId, decimals),
      history,
    };
  }

  /**
   * @param {string} child
   * @param {string} display
   * @returns {Promise<void>}
   */
  async confirmMutation(child, display) {
    if (this.isMock()) return;
    const confirmed = await confirmPayment({
      owedTotalDisplay: display,
      walletName: child,
      confirmFn: this.confirmFn,
      isTty: this.isTty,
      question: `❓ Подтвердить аванс ${display} → ${child}? (да/нет) `,
    });
    if (!confirmed) {
      throw cancelError('advance operation cancelled');
    }
  }

  /**
   * @param {string} child
   * @param {bigint} amountRaw
   * @returns {Promise<string>}
   */
  async transferPoolToChild(child, amountRaw) {
    if (this.isMock()) {
      throw validationError('mock issue does not send a transfer');
    }
    if (typeof this.transferFn === 'function') {
      const tx = await this.transferFn(child, amountRaw);
      const hash = tx?.hash ?? tx?.txHash;
      if (!hash) {
        throw validationError('advance transfer did not return a hash');
      }
      if (typeof tx.wait === 'function') {
        const receipt = await tx.wait();
        if (!receiptSucceeded(receipt)) {
          throw validationError('advance receipt was not successful');
        }
      }
      return String(hash);
    }
    const { capyToken, provider, rpcManager, config, walletRegistry } = this.router;
    const childInfo = walletRegistry.resolve(child);
    const parentBalance = await capyToken.getBalance(config.parent.address);
    if (parentBalance < amountRaw) {
      throw validationError('pool balance is below the advance amount');
    }
    const tx = await capyToken.transfer('parent', childInfo.address, amountRaw);
    const txHash = tx.hash;
    const { waitForTransactionReceipt } = require('../lib/infrastructure/RateLimitHelpers');
    const providerHolder = { provider: capyToken.provider };
    const receipt = await waitForTransactionReceipt(tx, txHash, provider, {
      maxRetries: 3,
      initialDelayMs: 1000,
      rpcManager: rpcManager || null,
      ethersUtils: providerHolder,
      contractName: 'CAPY advance issue transfer',
    });
    if (!receiptSucceeded(receipt)) {
      throw validationError('advance receipt was not successful');
    }
    if (providerHolder.provider !== capyToken.provider) {
      capyToken.setProvider(providerHolder.provider);
    }
    return String(txHash);
  }

  /**
   * @returns {Promise<object>}
   */
  async issue() {
    const child = this.childName();
    const reason = String(this.env.CAPYBARA_ADVANCE_REASON ?? '').trim();
    if (!reason) {
      throw validationError('CAPYBARA_ADVANCE_REASON is required');
    }
    const amountText = String(this.env.CAPYBARA_ADVANCE_AMOUNT ?? '').trim();
    const decimals = await this.tokenDecimals();
    let amountRaw;
    try {
      amountRaw = parseHumanToRaw(amountText, decimals);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'advance amount is invalid';
      throw validationError(message.replaceAll('CAPYBARA_DEBT_AMOUNT', 'CAPYBARA_ADVANCE_AMOUNT'));
    }
    const advanceId = String(this.env.CAPYBARA_ADVANCE_ID ?? '').trim() || crypto.randomUUID();
    const loaded = await loadAdvanceLimitsFile(this.limitsPath);
    const limits = scaleAdvanceOutstandingToRaw(
      resolveChildAdvanceLimits(loaded, child, this.env),
      decimals,
    );
    const overrideReason = String(this.env.CAPYBARA_ADVANCE_OVERRIDE_REASON ?? '').trim();
    const gate = await checkNewAdvance({
      child,
      scope: this.scope(),
      advanceRoot: this.advanceRoot,
      mode: this.scope().mode,
      newAdvanceId: advanceId,
      newAmount: amountRaw,
      limits,
      override: hasText(this.env.CAPYBARA_ADVANCE_OVERRIDE_REASON) ? { reason: overrideReason } : undefined,
    });
    if (!gate.allowed) {
      const detail = gate.reasons.map((reasonRow) => reasonRow.message).join('; ');
      throw validationError(`advance issue denied: ${detail}`);
    }
    const display = formatRawAmount(amountRaw, decimals);
    await this.confirmMutation(child, display);
    const txHash = this.isMock()
      ? `mock:${advanceId}`
      : await this.transferPoolToChild(child, amountRaw);
    const system = String(this.env.CAPYBARA_SYSTEM ?? '').trim();
    const subject = String(this.env.CAPYBARA_SUBJECT ?? '').trim();
    const written = await appendAdvanceEvent({
      child,
      scope: this.scope(),
      advanceRoot: this.advanceRoot,
      mode: this.scope().mode,
      advanceId,
      type: 'issue',
      amount: amountRaw,
      comment: reason,
      txHash,
      system: system || undefined,
      subject: subject || undefined,
      violations: gate.violations,
    });
    return {
      ok: true,
      action: 7,
      op: 'issue',
      child,
      advanceId,
      amount: amountRaw.toString(),
      amount_human: display,
      txHash,
      mock: this.isMock(),
      overrideApplied: gate.overrideApplied,
      violations: gate.violations,
      journalPath: written.filePath,
    };
  }

  /**
   * @param {string} child
   * @param {string} display
   * @returns {Promise<void>}
   */
  async confirmSettle(child, display) {
    if (this.isMock()) return;
    const confirmed = await confirmPayment({
      owedTotalDisplay: display,
      walletName: child,
      confirmFn: this.confirmFn,
      isTty: this.isTty,
      question: `❓ Подтвердить возврат ${display} в пул? (да/нет) `,
    });
    if (!confirmed) {
      throw cancelError('advance operation cancelled');
    }
  }

  /**
   * @param {string} child
   * @returns {Promise<bigint>}
   */
  async balanceOf(child) {
    if (typeof this.balanceFn === 'function') {
      return BigInt(await this.balanceFn(child));
    }
    const token = this.router?.capyToken;
    const registry = this.router?.walletRegistry;
    if (typeof token?.getBalance === 'function' && typeof registry?.resolve === 'function') {
      const info = registry.resolve(child);
      return BigInt(await token.getBalance(info.address));
    }
    throw validationError('child balance is required for advance settle');
  }

  /**
   * @param {string} child
   * @param {string} advanceId
   * @param {string} type
   * @param {bigint|string} amount
   * @param {string} operationId
   * @param {string} [txHash]
   * @param {string} [comment]
   * @returns {Promise<{ filePath: string, event: Record<string, unknown> }>}
   */
  appendSettle(child, advanceId, type, amount, operationId, txHash, comment) {
    return appendAdvanceEvent({
      child,
      scope: this.scope(),
      advanceRoot: this.advanceRoot,
      mode: this.scope().mode,
      advanceId,
      type,
      amount,
      operationId,
      txHash,
      comment,
    });
  }

  /**
   * Child → pool. Does not write a journal line.
   * @param {string} child
   * @param {bigint} amountRaw
   * @returns {Promise<{ hash: string, receipt: unknown }>}
   */
  async transferChildToPool(child, amountRaw) {
    if (this.isMock()) {
      throw validationError('mock settle does not send a transfer');
    }
    if (typeof this.transferFn === 'function') {
      const tx = await this.transferFn(child, amountRaw);
      const hash = tx?.hash ?? tx?.txHash;
      if (!hash) {
        throw new Error('advance transfer did not return a hash');
      }
      if (typeof tx.wait !== 'function') {
        return { hash: String(hash), receipt: null };
      }
      try {
        const receipt = await tx.wait();
        return { hash: String(hash), receipt };
      } catch (error) {
        if (error && typeof error === 'object') {
          error.txHash = String(hash);
        }
        throw error;
      }
    }
    const { capyToken, provider, rpcManager, config, walletRegistry } = this.router;
    const childInfo = walletRegistry.resolve(child);
    const tx = await capyToken.transfer(child, config.parent.address, amountRaw);
    const txHash = String(tx.hash);
    const { waitForTransactionReceipt } = require('../lib/infrastructure/RateLimitHelpers');
    const providerHolder = { provider: capyToken.provider };
    try {
      const receipt = await waitForTransactionReceipt(tx, txHash, provider, {
        maxRetries: 3,
        initialDelayMs: 1000,
        rpcManager: rpcManager || null,
        ethersUtils: providerHolder,
        contractName: 'CAPY advance settle transfer',
      });
      if (providerHolder.provider !== capyToken.provider) {
        capyToken.setProvider(providerHolder.provider);
      }
      return { hash: txHash, receipt };
    } catch (error) {
      if (error && typeof error === 'object') {
        error.txHash = txHash;
      }
      throw error;
    }
  }

  /**
   * @param {string} txHash
   * @returns {Promise<unknown>}
   */
  async readSettleReceipt(txHash) {
    if (typeof this.readReceiptFn === 'function') {
      return this.readReceiptFn(txHash);
    }
    if (String(txHash).startsWith('mock:')) {
      return { status: 1 };
    }
    const provider = this.router?.capyToken?.provider;
    if (typeof provider?.getTransactionReceipt !== 'function') {
      throw validationError('cannot read transfer receipt');
    }
    return provider.getTransactionReceipt(txHash);
  }

  /**
   * Finish an open intent or pending. Does not send another transfer.
   * @param {string} child
   * @param {string} advanceId
   * @param {Record<string, unknown>} openEvent
   * @param {string|undefined} comment
   * @returns {Promise<object>}
   */
  async finishOpenSettle(child, advanceId, openEvent, comment) {
    const operationId = String(openEvent.operation_id);
    const events = await this.eventsFor(child);
    const settled = events.find((event) => (
      event.advance_id === advanceId
      && event.operation_id === operationId
      && event.type === 'settle-settled'
    ));
    if (settled) {
      return {
        ok: true,
        action: 7,
        op: 'settle',
        confirmed: false,
        idempotent: true,
        transferred: false,
        child,
        advanceId,
        operationId,
        txHash: settled.tx_hash ?? null,
        remainder: '0',
        mock: this.isMock(),
        journalPath: this.journalFile(child),
      };
    }
    if (events.some((event) => (
      event.advance_id === advanceId
      && event.operation_id === operationId
      && event.type === 'settle-failed'
    ))) {
      throw validationError(`advance settle ${operationId} already failed`);
    }
    const txHash = typeof openEvent.tx_hash === 'string' ? openEvent.tx_hash : '';
    const amount = openEvent.amounts?.amount ?? projectAdvanceRemainder(events, advanceId).toString();
    if (!txHash) {
      const decimals = await this.tokenDecimals();
      await this.confirmSettle(child, formatRawAmount(BigInt(amount), decimals));
      await this.appendSettle(child, advanceId, 'settle-failed', amount, operationId, undefined, comment);
      throw validationError(`advance settle ${operationId} closed as failed without a tx hash`);
    }
    if (this.isMock() || txHash.startsWith('mock:')) {
      const written = await this.appendSettle(
        child,
        advanceId,
        'settle-settled',
        amount,
        operationId,
        txHash,
        comment,
      );
      return {
        ok: true,
        action: 7,
        op: 'settle',
        confirmed: false,
        idempotent: false,
        transferred: false,
        child,
        advanceId,
        operationId,
        txHash,
        remainder: written.event.remainder_after,
        mock: true,
        journalPath: written.filePath,
      };
    }
    const receipt = await this.readSettleReceipt(txHash);
    if (!receipt) {
      throw pendingError(`transfer ${txHash} is waiting for reconcile`);
    }
    if (!receiptSucceeded(receipt)) {
      await this.appendSettle(child, advanceId, 'settle-failed', amount, operationId, txHash, comment);
      throw validationError('advance receipt was not successful');
    }
    const fresh = await this.eventsFor(child);
    const already = fresh.find((event) => (
      event.advance_id === advanceId
      && event.operation_id === operationId
      && event.type === 'settle-settled'
    ));
    if (already) {
      return {
        ok: true,
        action: 7,
        op: 'settle',
        confirmed: true,
        idempotent: true,
        transferred: false,
        child,
        advanceId,
        operationId,
        txHash,
        remainder: '0',
        mock: false,
        journalPath: this.journalFile(child),
      };
    }
    const written = await this.appendSettle(
      child,
      advanceId,
      'settle-settled',
      amount,
      operationId,
      txHash,
      comment,
    );
    return {
      ok: true,
      action: 7,
      op: 'settle',
      confirmed: true,
      idempotent: false,
      transferred: false,
      child,
      advanceId,
      operationId,
      txHash,
      remainder: written.event.remainder_after,
      mock: false,
      journalPath: written.filePath,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async settle() {
    const child = this.childName();
    const advanceId = String(this.env.CAPYBARA_ADVANCE_ID ?? '').trim();
    if (!advanceId) {
      throw validationError('CAPYBARA_ADVANCE_ID is required');
    }
    const comment = String(this.env.CAPYBARA_ADVANCE_REASON ?? '').trim() || undefined;
    let events = await this.eventsFor(child);
    let remainder = requireOpenAdvance(events, advanceId);
    const open = findOpenSettleOperation(events, advanceId);
    if (open) {
      return this.finishOpenSettle(child, advanceId, open, comment);
    }
    const available = await this.balanceOf(child);
    if (available < remainder) {
      throw validationError('child balance is below the advance remainder');
    }
    const decimals = await this.tokenDecimals();
    await this.confirmSettle(child, formatRawAmount(remainder, decimals));
    events = await this.eventsFor(child);
    remainder = requireOpenAdvance(events, advanceId);
    const openAgain = findOpenSettleOperation(events, advanceId);
    if (openAgain) {
      return this.finishOpenSettle(child, advanceId, openAgain, comment);
    }
    const availableAgain = await this.balanceOf(child);
    if (availableAgain < remainder) {
      throw validationError('child balance is below the advance remainder');
    }
    const operationId = crypto.randomUUID();
    await this.appendSettle(child, advanceId, 'settle-intent', remainder, operationId, undefined, comment);
    if (this.isMock()) {
      const txHash = `mock:${advanceId}`;
      const written = await this.appendSettle(
        child,
        advanceId,
        'settle-settled',
        remainder,
        operationId,
        txHash,
        comment,
      );
      return {
        ok: true,
        action: 7,
        op: 'settle',
        confirmed: false,
        transferred: false,
        child,
        advanceId,
        operationId,
        txHash,
        remainder: written.event.remainder_after,
        mock: true,
        journalPath: written.filePath,
      };
    }
    /** @type {string|undefined} */
    let txHash;
    try {
      const sent = await this.transferChildToPool(child, remainder);
      txHash = sent.hash;
      if (!sent.receipt) {
        await this.appendSettle(child, advanceId, 'settle-pending', remainder, operationId, txHash, comment);
        throw pendingError(`transfer ${txHash} is waiting for reconcile`);
      }
      if (!receiptSucceeded(sent.receipt)) {
        await this.appendSettle(child, advanceId, 'settle-failed', remainder, operationId, txHash, comment);
        throw validationError('advance receipt was not successful');
      }
    } catch (error) {
      if (error?.code === 'EADVANCE_VALIDATION' || error?.code === 'EADVANCE_PENDING' || error?.code === 'ECANCEL') {
        throw error;
      }
      if (!txHash && !error?.txHash) {
        await this.appendSettle(child, advanceId, 'settle-failed', remainder, operationId, undefined, comment);
        throw validationError('advance transfer did not return a hash');
      }
      const pendingHash = txHash || String(error.txHash);
      await this.appendSettle(child, advanceId, 'settle-pending', remainder, operationId, pendingHash, comment);
      throw pendingError(`transfer ${pendingHash} is waiting for reconcile`);
    }
    await this.appendSettle(child, advanceId, 'settle-pending', remainder, operationId, txHash, comment);
    const written = await this.appendSettle(
      child,
      advanceId,
      'settle-settled',
      remainder,
      operationId,
      txHash,
      comment,
    );
    return {
      ok: true,
      action: 7,
      op: 'settle',
      confirmed: true,
      transferred: true,
      child,
      advanceId,
      operationId,
      txHash,
      remainder: written.event.remainder_after,
      mock: false,
      journalPath: written.filePath,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async forgive() {
    const child = this.childName();
    const reason = String(this.env.CAPYBARA_ADVANCE_REASON ?? '').trim();
    if (!reason) {
      throw validationError('CAPYBARA_ADVANCE_REASON is required');
    }
    const advanceId = String(this.env.CAPYBARA_ADVANCE_ID ?? '').trim();
    if (!advanceId) {
      throw validationError('CAPYBARA_ADVANCE_ID is required');
    }
    const events = await this.eventsFor(child);
    if (!events.some((event) => event.advance_id === advanceId)) {
      throw validationError(`advance_id not found: ${advanceId}`);
    }
    if (projectAdvanceRemainder(events, advanceId) === 0n) {
      throw validationError(`advance is already closed: ${advanceId}`);
    }
    const display = formatRawAmount(projectAdvanceRemainder(events, advanceId), await this.tokenDecimals());
    await this.confirmMutation(child, display);
    const written = await appendAdvanceEvent({
      child,
      scope: this.scope(),
      advanceRoot: this.advanceRoot,
      mode: this.scope().mode,
      advanceId,
      type: 'forgive',
      comment: reason,
    });
    return {
      ok: true,
      action: 7,
      op: 'forgive',
      child,
      advanceId,
      remainder: '0',
      reason,
      mock: this.isMock(),
      journalPath: written.filePath,
    };
  }
}

module.exports = {
  AdvanceLedgerAction,
  LEDGER_OPS,
  exitCodeForAdvanceError,
  EXIT_VALIDATION,
  EXIT_CANCEL,
  EXIT_PENDING,
};
