'use strict';

const { ethers } = require('ethers');
const RateLimitHelpers = require('../lib/infrastructure/RateLimitHelpers');
const { appendTypedLedgerEntry } = require('../daily-payments/ndjsonLogWriter');
const { resolveLaunchedBy } = require('../runtimeContext');

const SECTION_TITLE = '🦫 Capybara · Вывод $CAPY на родителя';

/**
 * @param {bigint|string} units
 * @param {number} decimals
 * @param {string} symbol
 * @returns {string}
 */
function formatAmountHuman(units, decimals, symbol) {
  const raw = ethers.formatUnits(units, decimals);
  const [intPart, fracPart] = raw.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  let human = formattedInt;
  if (fracPart !== undefined) {
    const trimmedFrac = fracPart.replace(/0+$/, '');
    if (trimmedFrac.length > 0) {
      human = `${formattedInt}.${trimmedFrac}`;
    }
  }
  return `${human} ${symbol}`;
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
 * @param {string} symbol
 * @returns {string}
 */
function buildZeroBalanceMessage(symbol) {
  return `🫙 Нечего переводить — баланс 0 ${symbol}`;
}

/**
 * @param {string} symbol
 * @param {bigint} balanceBefore
 * @param {number} decimals
 * @returns {string}
 */
function buildRequestedZeroAmountMessage(symbol, balanceBefore, decimals) {
  const balanceDisplay = formatAmountHuman(balanceBefore, decimals, symbol);
  return `🫙 Указана сумма 0 ${symbol} — перевод не выполнен (баланс: ${balanceDisplay})`;
}

/**
 * Action 1 — sweep $CAPY from child wallet to parent.
 */
class SweepToParentAction {
  /**
   * @param {import('../CapybaraRouter')} router
   * @param {{ walletName: string, amountHuman?: string|null|undefined, logDir?: string }} options
   */
  constructor(router, options) {
    this.router = router;
    this.walletName = options.walletName;
    this.amountHuman = options.amountHuman;
    this.logDir = options.logDir;
    this.logger = router.logger;
  }

  /**
   * @returns {Promise<object>}
   */
  async execute() {
    this.logger.section(SECTION_TITLE);

    const { config, walletRegistry, capyToken, provider, rpcManager } = this.router;

    const walletInfo = walletRegistry.resolve(this.walletName);
    const childAddress = walletInfo.address;
    const parentAddress = config.parent.address;

    const decimals = await capyToken.getDecimals();
    const symbol = await capyToken.getSymbol();
    const balanceBefore = await capyToken.getBalance(childAddress);

    this.logger.info(
      `👛 Кошелёк: ${this.walletName} (${shortenAddress(childAddress)}) → 🏦 Родитель (${shortenAddress(parentAddress)})`
    );
    this.logger.info(`💰 Баланс до: ${formatAmountHuman(balanceBefore, decimals, symbol)}`);

    if (balanceBefore === 0n) {
      const message = buildZeroBalanceMessage(symbol);
      this.logger.info(message, {
        wallet: this.walletName,
        childAddress,
        parentAddress,
        balanceRaw: '0',
        balanceHuman: formatAmountHuman(0n, decimals, symbol),
      });
      return {
        ok: true,
        action: 1,
        skipped: true,
        reason: 'zero_balance',
        message,
        wallet: this.walletName,
        childAddress,
        parentAddress,
      };
    }

    const { amountRaw, isFullBalance } = this._resolveAmountRaw(balanceBefore, decimals);
    if (amountRaw > balanceBefore) {
      const requestedDisplay = formatAmountHuman(amountRaw, decimals, symbol);
      const availableDisplay = formatAmountHuman(balanceBefore, decimals, symbol);
      throw new Error(`🚫 Сумма ${requestedDisplay} больше баланса ${availableDisplay}`);
    }

    if (amountRaw === 0n) {
      const message = buildRequestedZeroAmountMessage(symbol, balanceBefore, decimals);
      this.logger.info(message, {
        wallet: this.walletName,
        childAddress,
        parentAddress,
        balanceRaw: balanceBefore.toString(),
        balanceHuman: formatAmountHuman(balanceBefore, decimals, symbol),
        requestedAmountRaw: '0',
      });
      return {
        ok: true,
        action: 1,
        skipped: true,
        reason: 'requested_zero_amount',
        message,
        wallet: this.walletName,
        childAddress,
        parentAddress,
      };
    }

    const amountDisplay = formatAmountHuman(amountRaw, decimals, symbol);
    const fullBalanceSuffix = isFullBalance ? ' (вся сумма)' : '';
    this.logger.info(`📤 Перевожу: ${amountDisplay}${fullBalanceSuffix}`, {
      wallet: this.walletName,
      childAddress,
      parentAddress,
      amountHuman: amountDisplay,
      amountRaw: amountRaw.toString(),
      balanceBeforeRaw: balanceBefore.toString(),
      balanceBeforeHuman: formatAmountHuman(balanceBefore, decimals, symbol),
    });

    const tx = await capyToken.transfer(this.walletName, parentAddress, amountRaw);
    const txHash = tx.hash;

    const isMockMode = config.mode !== 'gfl_reality';

    if (isMockMode) {
      this.logger.info('[MOCK] Пропускаю ожидание on-chain receipt — dry-run', { txHash });
      const receipt = await tx.wait();
      const balanceAfter = balanceBefore;
      const balanceAfterDisplay = formatAmountHuman(balanceAfter, decimals, symbol);
      const successMessage = `✅ [MOCK] Готово! Переведено ${amountDisplay} (dry-run) · 🧾 tx ${shortenAddress(txHash)} · баланс после: ${balanceAfterDisplay}`;

      this.logger.info(successMessage, {
        wallet: this.walletName,
        childAddress,
        parentAddress,
        amountHuman: amountDisplay,
        amountRaw: amountRaw.toString(),
        txHash,
        balanceBeforeRaw: balanceBefore.toString(),
        balanceAfterRaw: balanceAfter.toString(),
        balanceBeforeHuman: formatAmountHuman(balanceBefore, decimals, symbol),
        balanceAfterHuman: balanceAfterDisplay,
        mock: true,
      });

      await this._writeSweepJournal({
        walletKey: this.walletName,
        childAddress,
        parentAddress,
        amountRaw,
        txHash,
        block: receipt.blockNumber ?? null,
        capyMode: config.mode === 'gfl_reality' ? 'gfl_reality' : 'mock',
        isMockMode: true,
      });

      return {
        ok: true,
        action: 1,
        wallet: this.walletName,
        childAddress,
        parentAddress,
        amountRaw: amountRaw.toString(),
        amountHuman: ethers.formatUnits(amountRaw, decimals),
        symbol,
        txHash,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        receiptStatus: receipt.status,
        mock: true,
      };
    }

    this.logger.info('⏳ Жду подтверждения сети…', { txHash });

    const providerHolder = { provider: capyToken.provider };
    const receipt = await RateLimitHelpers.waitForTransactionReceipt(tx, txHash, provider, {
      maxRetries: 3,
      initialDelayMs: 1000,
      rpcManager: rpcManager || null,
      ethersUtils: providerHolder,
      contractName: 'CAPY sweep transfer',
    });

    if (providerHolder.provider !== capyToken.provider) {
      capyToken.setProvider(providerHolder.provider);
    }

    const balanceAfter = await capyToken.getBalance(childAddress);
    const balanceAfterDisplay = formatAmountHuman(balanceAfter, decimals, symbol);
    const successMessage = `✅ Готово! Переведено ${amountDisplay} · 🧾 tx ${shortenAddress(txHash)} · баланс после: ${balanceAfterDisplay}`;

    this.logger.info(successMessage, {
      wallet: this.walletName,
      childAddress,
      parentAddress,
      amountHuman: amountDisplay,
      amountRaw: amountRaw.toString(),
      txHash,
      balanceBeforeRaw: balanceBefore.toString(),
      balanceAfterRaw: balanceAfter.toString(),
      balanceBeforeHuman: formatAmountHuman(balanceBefore, decimals, symbol),
      balanceAfterHuman: balanceAfterDisplay,
    });

    await this._writeSweepJournal({
      walletKey: this.walletName,
      childAddress,
      parentAddress,
      amountRaw,
      txHash,
      block: receipt.blockNumber ?? null,
      capyMode: config.mode === 'gfl_reality' ? 'gfl_reality' : 'mock',
      isMockMode: false,
    });

    return {
      ok: true,
      action: 1,
      wallet: this.walletName,
      childAddress,
      parentAddress,
      amountRaw: amountRaw.toString(),
      amountHuman: ethers.formatUnits(amountRaw, decimals),
      symbol,
      txHash,
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      receiptStatus: receipt.status,
    };
  }

  /**
   * @param {bigint} balanceBefore
   * @param {number} decimals
   * @returns {{ amountRaw: bigint, isFullBalance: boolean }}
   */
  _resolveAmountRaw(balanceBefore, decimals) {
    const rawAmount = this.amountHuman;
    if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === '') {
      return { amountRaw: balanceBefore, isFullBalance: true };
    }

    const trimmed = String(rawAmount).trim();

    if (trimmed.startsWith('-')) {
      throw new Error('🚫 Сумма перевода не может быть отрицательной');
    }

    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(
        `🚫 Некорректная сумма «${trimmed}». Укажите положительное число, например 10 или 10.5`
      );
    }

    return { amountRaw: ethers.parseUnits(trimmed, decimals), isFullBalance: false };
  }

  /**
   * @param {{
   *   walletKey: string,
   *   childAddress: string,
   *   parentAddress: string,
   *   amountRaw: bigint,
   *   txHash: string,
   *   block: number|null,
   *   capyMode: 'mock'|'gfl_reality',
   *   isMockMode: boolean,
   * }} params
   * @returns {Promise<void>}
   */
  async _writeSweepJournal(params) {
    const { walletKey, childAddress, parentAddress, amountRaw, txHash, block, capyMode, isMockMode } =
      params;
    await appendTypedLedgerEntry({
      wallet: walletKey,
      entry: {
        type: 'sweep',
        amount: amountRaw.toString(),
        from: childAddress,
        to: parentAddress,
        txHash,
        block,
        timestamp: new Date().toISOString(),
        launched_by: resolveLaunchedBy(),
        mode: capyMode,
        mock: isMockMode,
      },
      logDir: this.logDir,
      mode: capyMode,
    });
  }
}

module.exports = SweepToParentAction;
module.exports.SECTION_TITLE = SECTION_TITLE;
module.exports.formatAmountHuman = formatAmountHuman;
module.exports.buildZeroBalanceMessage = buildZeroBalanceMessage;
module.exports.buildRequestedZeroAmountMessage = buildRequestedZeroAmountMessage;
/** @deprecated use buildZeroBalanceMessage(symbol) */
module.exports.ZERO_BALANCE_MESSAGE = buildZeroBalanceMessage('CAPY');
