'use strict';

const crypto = require('crypto');
const { ethers } = require('ethers');
const RateLimitHelpers = require('../lib/infrastructure/RateLimitHelpers');
const { confirmPayment } = require('../daily-payments/confirmPayment');
const { appendTypedLedgerEntry } = require('../daily-payments/ndjsonLogWriter');
const { allocateShares, parseAmountHuman, parseSplitSpec } = require('../charge-pool/splitAllocation');
const { resolveLaunchedBy } = require('../runtimeContext');
const { formatAmountHuman } = require('./SweepToParentAction');

const SECTION_TITLE = '🦫 Capybara · Списание в пул';

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
 * @param {string|null|undefined} splitRaw
 * @param {string[]} children
 * @returns {object}
 */
function buildSplitMeta(splitRaw, children) {
  if (!splitRaw || String(splitRaw).trim() === '') {
    return { mode: 'equal', children: [...children] };
  }
  const spec = parseSplitSpec(splitRaw, children);
  return {
    mode: 'percent',
    children: spec.map((row) => ({ wallet: row.wallet, percent: row.percent })),
  };
}

/**
 * Action 3 — charge child wallet(s) into parent pool.
 */
class ChargeToPoolAction {
  /**
   * @param {import('../CapybaraRouter')} router
   * @param {{
   *   walletName: string,
   *   amountHuman: string,
   *   splitRaw?: string|null,
   *   confirmFn?: (question: string) => Promise<string>,
   *   isTty?: boolean,
   *   logDir?: string,
   * }} options
   */
  constructor(router, options) {
    this.router = router;
    this.walletName = options.walletName;
    this.amountHuman = options.amountHuman;
    this.splitRaw = options.splitRaw ?? null;
    this.confirmFn = options.confirmFn;
    this.isTty = options.isTty;
    this.logDir = options.logDir;
    this.logger = router.logger;
  }

  /**
   * @returns {Promise<object>}
   */
  async execute() {
    this.logger.section(SECTION_TITLE);

    const walletKey = String(this.walletName ?? '').toLowerCase().trim();
    if (!walletKey) {
      throw new Error('🚫 CAPYBARA_WALLET не задан — укажите tristan, bastian или all');
    }
    if (walletKey === 'all') {
      return this._executeAll();
    }
    if (walletKey !== 'tristan' && walletKey !== 'bastian') {
      throw new Error(
        `🚫 Неизвестный кошелёк «${this.walletName}» — ожидается tristan, bastian или all`
      );
    }
    return this._executeSingle(walletKey);
  }

  /**
   * @param {string} walletKey
   * @returns {Promise<object>}
   */
  async _executeSingle(walletKey) {
    const { config, walletRegistry, capyToken, provider, rpcManager } = this.router;
    const capyMode = config.mode === 'gfl_reality' ? 'gfl_reality' : 'mock';
    const isMockMode = capyMode !== 'gfl_reality';

    const decimals = await capyToken.getDecimals();
    const symbol = await capyToken.getSymbol();
    const requestedRaw = parseAmountHuman(this.amountHuman, decimals);

    const childInfo = walletRegistry.resolve(walletKey);
    const parentAddress = config.parent.address;
    const balance = await capyToken.getBalance(childInfo.address);
    const chargeRaw = balance < requestedRaw ? balance : requestedRaw;
    const shortfallRaw = requestedRaw > chargeRaw ? requestedRaw - chargeRaw : 0n;

    const chargeDisplay = formatAmountHuman(chargeRaw, decimals, symbol);
    const requestedDisplay = formatAmountHuman(requestedRaw, decimals, symbol);

    this.logger.info(
      `👛 ${displayWalletName(walletKey)} (${shortenAddress(childInfo.address)}) → 🏦 пул (${shortenAddress(parentAddress)})`
    );
    this.logger.info(
      `💰 Запрошено: ${requestedDisplay} · доступно: ${formatAmountHuman(balance, decimals, symbol)}`
    );

    if (chargeRaw === 0n) {
      const message = `🫙 Баланс 0 ${symbol} — списание не выполнено`;
      this.logger.info(message);
      return {
        ok: true,
        action: 3,
        wallet: walletKey,
        skipped: true,
        reason: 'zero_balance',
        message,
      };
    }

    if (shortfallRaw > 0n) {
      this.logger.warn(
        `⚠️ Нехватка баланса — спишу доступное ${chargeDisplay} (недобор ${formatAmountHuman(shortfallRaw, decimals, symbol)})`
      );
    }

    const confirmQuestion =
      shortfallRaw > 0n
        ? `❓ Подтвердить списание ${chargeDisplay} в пул (запрошено ${requestedDisplay}, частично)? (да/нет) `
        : `❓ Подтвердить списание ${chargeDisplay} в пул? (да/нет) `;

    const confirmed = await confirmPayment({
      owedTotalDisplay: chargeDisplay,
      walletName: displayWalletName(walletKey),
      confirmFn: this.confirmFn,
      isTty: this.isTty,
      question: confirmQuestion,
    });

    if (!confirmed) {
      this.logger.info('🛑 Отменено — ничего не отправлено');
      return { ok: true, action: 3, wallet: walletKey, cancelled: true };
    }

    const transferResult = await this._transferChildToParent({
      walletKey,
      parentAddress,
      amountRaw: chargeRaw,
      capyToken,
      provider,
      rpcManager,
      isMockMode,
    });

    await this._writeChargeJournal({
      walletKey,
      entry: {
        type: 'charge',
        amount: chargeRaw.toString(),
        requested: requestedRaw.toString(),
        ...(shortfallRaw > 0n ? { shortfall: shortfallRaw.toString() } : {}),
        from: childInfo.address,
        to: parentAddress,
        txHash: transferResult.txHash,
        block: transferResult.block ?? null,
        timestamp: new Date().toISOString(),
        launched_by: resolveLaunchedBy(),
        mode: capyMode,
        mock: isMockMode,
      },
      mode: capyMode,
    });

    this.logger.info(`✅ Списано ${chargeDisplay} · tx ${shortenAddress(transferResult.txHash)}`);

    return {
      ok: true,
      action: 3,
      wallet: walletKey,
      amountRaw: chargeRaw.toString(),
      requestedRaw: requestedRaw.toString(),
      shortfallRaw: shortfallRaw.toString(),
      txHash: transferResult.txHash,
      mock: isMockMode,
    };
  }

  /**
   * @returns {Promise<object>}
   */
  async _executeAll() {
    const { config, walletRegistry, capyToken, provider, rpcManager } = this.router;
    const capyMode = config.mode === 'gfl_reality' ? 'gfl_reality' : 'mock';
    const isMockMode = capyMode !== 'gfl_reality';

    const decimals = await capyToken.getDecimals();
    const symbol = await capyToken.getSymbol();
    const parentAddress = config.parent.address;
    const children = walletRegistry.listChildren();
    const totalRaw = parseAmountHuman(this.amountHuman, decimals);
    const shares = allocateShares(totalRaw, children, this.splitRaw);
    const splitMeta = buildSplitMeta(this.splitRaw, children);
    const totalDisplay = formatAmountHuman(totalRaw, decimals, symbol);

    this.logger.info(`👥 Режим all — общая сумма ${totalDisplay} делится между детьми`);
    for (const share of shares) {
      const shareDisplay = formatAmountHuman(share.amountRaw, decimals, symbol);
      const pctSuffix = share.percent !== undefined ? ` (${share.percent}%)` : '';
      this.logger.info(`  · ${displayWalletName(share.wallet)}: ${shareDisplay}${pctSuffix}`);
    }

    /** @type {Array<{ wallet: string, shareRaw: bigint, balance: bigint, shortBy: bigint }>} */
    const preflight = [];
    for (const share of shares) {
      const childInfo = walletRegistry.resolve(share.wallet);
      const balance = await capyToken.getBalance(childInfo.address);
      const shortBy = share.amountRaw > balance ? share.amountRaw - balance : 0n;
      preflight.push({
        wallet: share.wallet,
        shareRaw: share.amountRaw,
        balance,
        shortBy,
      });
    }

    const shortChildren = preflight.filter((row) => row.shortBy > 0n);
    if (shortChildren.length > 0) {
      const lines = shortChildren.map((row) => {
        const need = formatAmountHuman(row.shareRaw, decimals, symbol);
        const have = formatAmountHuman(row.balance, decimals, symbol);
        const miss = formatAmountHuman(row.shortBy, decimals, symbol);
        return `${displayWalletName(row.wallet)}: нужно ${need}, есть ${have} (не хватает ${miss})`;
      });
      throw new Error(`🚫 Предпроверка не пройдена — недостаточно средств:\n${lines.join('\n')}`);
    }

    const childLines = shares
      .map((share) => {
        const shareDisplay = formatAmountHuman(share.amountRaw, decimals, symbol);
        return `  · ${displayWalletName(share.wallet)}: ${shareDisplay}`;
      })
      .join('\n');
    const confirmQuestion = `❓ Подтвердить списание в пул (всего ${totalDisplay})?\n${childLines}\n(да/нет) `;

    const confirmed = await confirmPayment({
      owedTotalDisplay: totalDisplay,
      walletName: 'all',
      confirmFn: this.confirmFn,
      isTty: this.isTty,
      question: confirmQuestion,
    });

    if (!confirmed) {
      this.logger.info('🛑 Отменено — ничего не отправлено');
      return { ok: true, action: 3, wallet: 'all', cancelled: true };
    }

    const batchId = crypto.randomUUID();
    /** @type {Array<object>} */
    const results = [];

    for (const share of shares) {
      const childInfo = walletRegistry.resolve(share.wallet);
      const shareDisplay = formatAmountHuman(share.amountRaw, decimals, symbol);

      try {
        const transferResult = await this._transferChildToParent({
          walletKey: share.wallet,
          parentAddress,
          amountRaw: share.amountRaw,
          capyToken,
          provider,
          rpcManager,
          isMockMode,
        });

        await this._writeChargeJournal({
          walletKey: share.wallet,
          entry: {
            type: 'charge',
            amount: share.amountRaw.toString(),
            requested: share.amountRaw.toString(),
            from: childInfo.address,
            to: parentAddress,
            txHash: transferResult.txHash,
            block: transferResult.block ?? null,
            timestamp: new Date().toISOString(),
            launched_by: resolveLaunchedBy(),
            mode: capyMode,
            mock: isMockMode,
            split: splitMeta,
            batch_id: batchId,
          },
          mode: capyMode,
        });

        this.logger.info(
          `✅ ${displayWalletName(share.wallet)}: списано ${shareDisplay} · tx ${shortenAddress(transferResult.txHash)}`
        );
        results.push({
          wallet: share.wallet,
          ok: true,
          amountRaw: share.amountRaw.toString(),
          txHash: transferResult.txHash,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ ${displayWalletName(share.wallet)}: ${message}`);
        results.push({
          wallet: share.wallet,
          ok: false,
          error: message,
        });
      }
    }

    const passed = results.filter((row) => row.ok);
    const failed = results.filter((row) => !row.ok);
    this.logger.info(
      `📊 Итог all: успешно ${passed.length}/${results.length}` +
        (failed.length > 0 ? ` · ошибки: ${failed.map((r) => r.wallet).join(', ')}` : '')
    );

    return {
      ok: failed.length === 0,
      action: 3,
      wallet: 'all',
      batchId,
      split: splitMeta,
      totalRaw: totalRaw.toString(),
      results,
      passed: passed.length,
      failed: failed.length,
      mock: isMockMode,
    };
  }

  /**
   * @param {{
   *   walletKey: string,
   *   parentAddress: string,
   *   amountRaw: bigint,
   *   capyToken: object,
   *   provider: object,
   *   rpcManager: object|null,
   *   isMockMode: boolean,
   * }} params
   * @returns {Promise<{ txHash: string, block: number|null }>}
   */
  async _transferChildToParent(params) {
    const { walletKey, parentAddress, amountRaw, capyToken, provider, rpcManager, isMockMode } =
      params;

    const tx = await capyToken.transfer(walletKey, parentAddress, amountRaw);
    const txHash = tx.hash;

    if (isMockMode) {
      this.logger.info('[MOCK] Пропускаю ожидание on-chain receipt — dry-run', { txHash });
      const receipt = await tx.wait();
      return { txHash, block: receipt.blockNumber ?? null };
    }

    this.logger.info('⏳ Жду подтверждения сети…', { txHash });
    const providerHolder = { provider: capyToken.provider };
    const receipt = await RateLimitHelpers.waitForTransactionReceipt(tx, txHash, provider, {
      maxRetries: 3,
      initialDelayMs: 1000,
      rpcManager: rpcManager || null,
      ethersUtils: providerHolder,
      contractName: 'CAPY charge transfer',
    });

    if (providerHolder.provider !== capyToken.provider) {
      capyToken.setProvider(providerHolder.provider);
    }

    return { txHash, block: receipt.blockNumber ?? null };
  }

  /**
   * @param {{ walletKey: string, entry: object, mode: 'mock'|'gfl_reality' }} params
   * @returns {Promise<void>}
   */
  async _writeChargeJournal(params) {
    const { walletKey, entry, mode } = params;
    await appendTypedLedgerEntry({
      wallet: walletKey,
      entry,
      logDir: this.logDir,
      mode,
    });
  }
}

module.exports = ChargeToPoolAction;
module.exports.SECTION_TITLE = SECTION_TITLE;
module.exports.buildSplitMeta = buildSplitMeta;
