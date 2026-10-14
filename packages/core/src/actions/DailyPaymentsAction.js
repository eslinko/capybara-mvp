'use strict';

const { ethers } = require('ethers');
const RateLimitHelpers = require('../lib/infrastructure/RateLimitHelpers');
const { formatAmountHuman } = require('./SweepToParentAction');
const { resolvePeriod } = require('../daily-payments/periodResolver');
const { readLastLogDate } = require('../daily-payments/ndjsonLogReader');
const { reconcileDailyPayments } = require('../daily-payments/reconcileEngine');
const { confirmPayment } = require('../daily-payments/confirmPayment');
const { appendDailyPaymentsLog } = require('../daily-payments/ndjsonLogWriter');
const { utcToday } = require('../daily-payments/dateUtils');

const SECTION_TITLE = '🦫 Capybara · Дневные выплаты';

/**
 * @param {string} dateStr YYYY-MM-DD
 * @returns {string}
 */
function formatDayRu(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${day}.${month}`;
}

/**
 * @param {string} address
 * @returns {string}
 */
function shortenAddress(address) {
  if (!address || address.length < 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * @param {string} walletName
 * @returns {string}
 */
function displayWalletName(walletName) {
  const key = String(walletName).toLowerCase();
  if (key === 'tristan') return 'Tristan';
  if (key === 'bastian') return 'Bastian';
  return walletName;
}

/**
 * @returns {string}
 */
const { resolveLaunchedBy } = require('../runtimeContext');

/**
 * @param {'polygonscan'|'blockscan'} source
 * @param {'no_api_key'|'indexer_error'|null} [fallbackReason]
 * @returns {string}
 */
function formatReconcileSourceLine(source, fallbackReason = null) {
  if (source === 'polygonscan') {
    return '🔎 Источник сверки: Etherscan indexer (V2)';
  }
  if (fallbackReason === 'indexer_error') {
    return '⚠️ Индексатор не ответил (ключ задан) — сверка через полный скан сети (медленно)';
  }
  return '⚠️ POLYGONSCAN_API_KEY не задан — сверка через полный скан сети (медленно)';
}

/**
 * Action 2 — daily payments reconcile + optional parent→child transfer.
 */
class DailyPaymentsAction {
  /**
   * @param {import('../CapybaraRouter')} router
   * @param {{
   *   walletName: string,
   *   from?: string|null,
   *   to?: string|null,
   *   confirmFn?: (question: string) => Promise<string>,
   *   isTty?: boolean,
   *   todayFn?: () => string,
   *   logDir?: string,
   * }} options
   */
  constructor(router, options) {
    this.router = router;
    this.walletName = options.walletName;
    this.from = options.from ?? null;
    this.to = options.to ?? null;
    this.confirmFn = options.confirmFn;
    this.isTty = options.isTty;
    this.todayFn = options.todayFn ?? utcToday;
    this.logDir = options.logDir;
    this.logger = router.logger;
  }

  /**
   * @param {{
   *   paidTotal: bigint,
   *   txHash: string,
   *   confirmed: boolean,
   *   mock: boolean,
   *   period: { from: string, to: string, days: string[] },
   *   parentAddress: string,
   *   childAddress: string,
   *   mode: 'mock'|'gfl_reality',
   *   block?: number|null,
   * }} params
   * @returns {object}
   */
  _buildPaymentMetadata(params) {
    return {
      paidTotal: params.paidTotal,
      txHash: params.txHash,
      confirmed: params.confirmed,
      mock: params.mock,
      date: params.period.to,
      period: { from: params.period.from, to: params.period.to },
      days: params.period.days,
      from: params.parentAddress,
      to: params.childAddress,
      block: params.block ?? null,
      timestamp: new Date().toISOString(),
      launched_by: resolveLaunchedBy(),
      mode: params.mode,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async execute() {
    this.logger.section(SECTION_TITLE);

    const { config, walletRegistry, capyToken, provider, rpcManager } = this.router;
    const walletKey = String(this.walletName).toLowerCase().trim();
    const capyMode = config.mode === 'gfl_reality' ? 'gfl_reality' : 'mock';

    if (walletKey !== 'tristan' && walletKey !== 'bastian') {
      throw new Error(`CAPYBARA_WALLET must be tristan or bastian for action 2 (got "${this.walletName}")`);
    }

    const dailyRateHuman = config.dailyRates?.[walletKey];
    if (!dailyRateHuman) {
      throw new Error(`Daily rate not configured for wallet "${walletKey}" (CAPY_DAILY_${walletKey.toUpperCase()})`);
    }

    const childWallet = walletRegistry.resolve(walletKey);
    const parentAddress = config.parent.address;
    const childAddress = childWallet.address;

    // L3 (intentional): period anchor reads prod journal only — mock dry-runs reconcile
    // against real payment history while writing to logs/capybara/mock/ (see ndjsonLogReader.readLastLogDate).
    const lastLogDate = await readLastLogDate(walletKey, this.logDir);
    const period = resolvePeriod({
      from: this.from,
      to: this.to,
      lastLogDate,
      today: this.todayFn(),
    });

    if (period.empty) {
      this.logger.info('🎉 Всё выплачено за период — доплачивать нечего');
      return {
        ok: true,
        action: 2,
        wallet: walletKey,
        period,
        owedTotal: '0',
        skipped: true,
        reason: 'empty_period',
      };
    }

    const dayCount = period.days.length;
    this.logger.info(`📅 Период: ${period.from} → ${period.to} (${dayCount} дн.)`);

    const decimals = await capyToken.getDecimals();
    const symbol = await capyToken.getSymbol();

    const { breakdown, owedTotal, reconcileSource, reconcileFallbackReason } =
      await reconcileDailyPayments({
      capyToken,
      provider,
      parentAddress,
      childAddress,
      dailyRateHuman,
      decimals,
      periodDays: period.days,
      logger: this.logger,
      tokenAddress: config.token.address,
      polygonscanApiKey: config.polygonscanApiKey ?? null,
      polygonscanApiBase: config.polygonscanApiBase,
      polygonscanChainId: config.chainId,
    });

    this.logger.info(formatReconcileSourceLine(reconcileSource, reconcileFallbackReason));

    for (const day of breakdown) {
      const expectedDisplay = formatAmountHuman(day.expected, decimals, symbol);
      const actualDisplay = formatAmountHuman(day.actual, decimals, symbol);
      if (day.match) {
        this.logger.info(
          `· ${formatDayRu(day.date)}: ожидалось ${expectedDisplay.replace(` ${symbol}`, '')} · выплачено ${actualDisplay.replace(` ${symbol}`, '')} ✅`
        );
      } else {
        const owedDisplay = formatAmountHuman(day.owed, decimals, symbol);
        this.logger.info(
          `· ${formatDayRu(day.date)}: ожидалось ${expectedDisplay.replace(` ${symbol}`, '')} · выплачено ${actualDisplay.replace(` ${symbol}`, '')} ❗ долг ${owedDisplay.replace(` ${symbol}`, '')}`
        );
      }
    }

    const owedTotalDisplay = formatAmountHuman(owedTotal, decimals, symbol);

    if (owedTotal === 0n) {
      this.logger.info('🎉 Всё выплачено за период — доплачивать нечего');
      await appendDailyPaymentsLog({
        wallet: walletKey,
        breakdown,
        payment: null,
        logDir: this.logDir,
        mode: capyMode,
      });
      return {
        ok: true,
        action: 2,
        wallet: walletKey,
        period,
        owedTotal: '0',
        skipped: true,
        reason: 'zero_owed',
        reconcileSource,
      };
    }

    this.logger.info(
      `🧮 К доплате: ${owedTotalDisplay} · 🏦 Родитель → 👛 ${displayWalletName(walletKey)} (${shortenAddress(childAddress)})`
    );

    const parentBalance = await capyToken.getBalance(parentAddress);
    if (parentBalance < owedTotal) {
      const availableDisplay = formatAmountHuman(parentBalance, decimals, symbol);
      throw new Error(`🚫 Сумма ${owedTotalDisplay} больше баланса родителя ${availableDisplay}`);
    }

    const confirmed = await confirmPayment({
      owedTotalDisplay,
      walletName: displayWalletName(walletKey),
      confirmFn: this.confirmFn,
      isTty: this.isTty,
    });

    if (!confirmed) {
      this.logger.info('🛑 Отменено — ничего не отправлено');
      return {
        ok: true,
        action: 2,
        wallet: walletKey,
        period,
        owedTotal: owedTotal.toString(),
        cancelled: true,
        reconcileSource,
      };
    }

    const isMockMode = capyMode !== 'gfl_reality';
    this.logger.info(`📤 Отправляю ${owedTotalDisplay}…`);

    const tx = await capyToken.transfer('parent', childAddress, owedTotal);
    const txHash = tx.hash;

    if (isMockMode) {
      this.logger.info('[MOCK] Пропускаю ожидание on-chain receipt — dry-run', { txHash });
      await tx.wait();
      this.logger.info(
        `✅ [MOCK] Выплачено ${owedTotalDisplay} · tx ${shortenAddress(txHash)} · 📝 записано в лог`
      );
      await appendDailyPaymentsLog({
        wallet: walletKey,
        breakdown,
        payment: this._buildPaymentMetadata({
          paidTotal: owedTotal,
          txHash,
          confirmed: true,
          mock: true,
          period,
          parentAddress,
          childAddress,
          mode: 'mock',
          block: null,
        }),
        logDir: this.logDir,
        mode: 'mock',
      });
      return {
        ok: true,
        action: 2,
        wallet: walletKey,
        period,
        owedTotal: owedTotal.toString(),
        txHash,
        mock: true,
        reconcileSource,
      };
    }

    this.logger.info('⏳ Жду подтверждения сети…', { txHash });
    const providerHolder = { provider: capyToken.provider };
    const receipt = await RateLimitHelpers.waitForTransactionReceipt(tx, txHash, provider, {
      maxRetries: 3,
      initialDelayMs: 1000,
      rpcManager: rpcManager || null,
      ethersUtils: providerHolder,
      contractName: 'CAPY daily payment transfer',
    });

    if (providerHolder.provider !== capyToken.provider) {
      capyToken.setProvider(providerHolder.provider);
    }

    this.logger.info(
      `✅ Выплачено ${owedTotalDisplay} · tx ${shortenAddress(txHash)} · 📝 записано в лог`
    );

    await appendDailyPaymentsLog({
      wallet: walletKey,
      breakdown,
      payment: this._buildPaymentMetadata({
        paidTotal: owedTotal,
        txHash,
        confirmed: true,
        mock: false,
        period,
        parentAddress,
        childAddress,
        mode: 'gfl_reality',
        block: receipt?.blockNumber ?? null,
      }),
      logDir: this.logDir,
      mode: 'gfl_reality',
    });

    return {
      ok: true,
      action: 2,
      wallet: walletKey,
      period,
      owedTotal: owedTotal.toString(),
      txHash,
      mock: false,
      reconcileSource,
    };
  }
}

module.exports = DailyPaymentsAction;
module.exports.SECTION_TITLE = SECTION_TITLE;
module.exports.formatDayRu = formatDayRu;
module.exports.displayWalletName = displayWalletName;
module.exports.formatReconcileSourceLine = formatReconcileSourceLine;
module.exports.resolveLaunchedBy = resolveLaunchedBy;
