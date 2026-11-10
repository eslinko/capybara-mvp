'use strict';

const crypto = require('crypto');
const { confirmPayment } = require('../daily-payments/confirmPayment');
const { getChildAdvancePath } = require('../advance/advancePath');
const { readAdvanceEvents, projectAdvanceRemainder } = require('../advance/advanceProjection');
const { appendAdvanceEvent } = require('../advance/advanceWriter');
const { checkNewAdvance } = require('../advance/advanceAvailability');
const { loadAdvanceLimitsFile, resolveChildAdvanceLimits, scaleAdvanceOutstandingToRaw } = require('../advance/advanceLimits');
const { parseHumanToRaw, formatRawAmount, AMOUNT_UNIT_RAW } = require('../debt/debtAmount');

const LEDGER_OPS = Object.freeze(['issue', 'forgive', 'summary', 'show']);

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
 * Action 7 advance ledger. settle is not an operation here.
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
