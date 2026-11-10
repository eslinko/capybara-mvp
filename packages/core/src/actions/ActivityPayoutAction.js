'use strict';

const RateLimitHelpers = require('../lib/infrastructure/RateLimitHelpers');
const { confirmPayment } = require('../daily-payments/confirmPayment');
const { stageAndCommitActivityJournal } = require('../daily-payments/activityJournal');
const {
  loadFamilyCatalog,
  resolveMetricRule,
  resolvePayoutRule,
  computeAutoPayoutAmount,
} = require('../family-catalog');
const { parseAmountHuman } = require('../charge-pool/splitAllocation');
const { formatAmountHuman } = require('./SweepToParentAction');
const { resolveLaunchedBy } = require('../runtimeContext');
const { AdvanceLedgerAction } = require('./AdvanceLedgerAction');

const SECTION_TITLE = '🦫 Capybara · Выплаты (activity payout)';

const CHILD_WALLETS = new Set(['tristan', 'bastian']);

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
 * Resolve env/options into a normalized activity payout request.
 * @param {Record<string, string|undefined>|NodeJS.ProcessEnv} [env]
 * @returns {object}
 */
function parseActivityPayoutEnv(env = process.env) {
  const skipRaw = env.CAPYBARA_SKIP_PAYOUT;
  const skipPayout =
    skipRaw !== undefined &&
    skipRaw !== null &&
    ['1', 'true', 'yes', 'да'].includes(String(skipRaw).trim().toLowerCase());

  return {
    walletName: env.CAPYBARA_WALLET,
    system: env.CAPYBARA_SYSTEM,
    level: env.CAPYBARA_LEVEL,
    period: env.CAPYBARA_PERIOD || null,
    subject: env.CAPYBARA_SUBJECT,
    activityType: env.CAPYBARA_ACTIVITY_TYPE,
    subtype: env.CAPYBARA_SUBTYPE || null,
    templateId: env.CAPYBARA_TEMPLATE_ID || null,
    metricValue: env.CAPYBARA_METRIC_VALUE,
    amountRaw: env.CAPYBARA_AMOUNT,
    skipPayout,
  };
}

/**
 * Compute payout human amount (or null to skip payout-only validation).
 * @param {{
 *   catalog: object,
 *   system: string,
 *   activityType?: string|null,
 *   subtype?: string|null,
 *   templateId?: string|null,
 *   metricValue: string|number,
 *   amountRaw?: string|null,
 *   skipPayout?: boolean,
 * }} params
 * @returns {{ amountHuman: string|null, payoutRule: object|null, metricRule: object|null, source: string|null }}
 */
function resolveActivityPayoutAmount(params) {
  const {
    catalog,
    system,
    activityType = null,
    subtype = null,
    templateId = null,
    metricValue,
    amountRaw = null,
    skipPayout = false,
  } = params;

  if (!system) {
    throw new Error('🚫 CAPYBARA_SYSTEM не задан');
  }
  if (metricValue === undefined || metricValue === null || String(metricValue).trim() === '') {
    throw new Error('🚫 CAPYBARA_METRIC_VALUE не задан');
  }

  const ctx = {
    systemId: system,
    activityTypeId: activityType || null,
    subtypeId: subtype || null,
    templateId: templateId || null,
  };
  const metricResolved = resolveMetricRule(catalog, ctx);
  const payoutResolved = resolvePayoutRule(catalog, ctx);
  const payoutRule = payoutResolved.rule;
  const metricRule = metricResolved.rule;

  if (skipPayout) {
    return { amountHuman: null, payoutRule, metricRule, source: 'skip' };
  }

  const amountTrim =
    amountRaw === undefined || amountRaw === null ? '' : String(amountRaw).trim();

  if (amountTrim === '0') {
    return { amountHuman: null, payoutRule, metricRule, source: 'zero' };
  }

  const wantsAuto = amountTrim === '' || amountTrim.toLowerCase() === 'auto';

  if (!wantsAuto) {
    return { amountHuman: amountTrim, payoutRule, metricRule, source: 'custom' };
  }

  // Auto / omit
  if (payoutRule && payoutRule.mode === 'custom_only') {
    throw new Error(
      '🚫 Система требует custom amount (custom_only) — задайте CAPYBARA_AMOUNT или CAPYBARA_SKIP_PAYOUT=1 / CAPYBARA_AMOUNT=0 для только метрик'
    );
  }

  const autoAmount = computeAutoPayoutAmount(payoutRule, String(metricValue).trim());
  if (autoAmount === null) {
    return { amountHuman: null, payoutRule, metricRule, source: 'auto_zero' };
  }
  return {
    amountHuman: String(autoAmount),
    payoutRule,
    metricRule,
    source: 'auto',
  };
}

/**
 * Action 4 — validate activity + optional parent→child $CAPY payout.
 */
class ActivityPayoutAction {
  /**
   * @param {import('../CapybaraRouter')} router
   * @param {{
   *   walletName?: string,
   *   system?: string,
   *   level?: string,
   *   period?: string|null,
   *   subject?: string,
   *   activityType?: string,
   *   subtype?: string|null,
   *   templateId?: string|null,
   *   metricValue?: string|number,
   *   amountRaw?: string|null,
   *   skipPayout?: boolean,
   *   confirmFn?: (question: string) => Promise<string>,
   *   isTty?: boolean,
   *   logDir?: string,
   *   catalogPath?: string,
   *   transferFn?: (() => Promise<{ txHash?: string|null, mock?: boolean }>)|null,
   *   advanceId?: string,
   *   advanceRoot?: string,
   *   balanceFn?: (child: string) => Promise<bigint>|bigint,
   * }} [options]
   */
  constructor(router, options = {}) {
    this.router = router;
    this.logger = router.logger;
    const fromEnv = parseActivityPayoutEnv();
    this.walletName = options.walletName ?? fromEnv.walletName;
    this.system = options.system ?? fromEnv.system;
    this.level = options.level ?? fromEnv.level;
    this.period = options.period !== undefined ? options.period : fromEnv.period;
    this.subject = options.subject ?? fromEnv.subject;
    this.activityType = options.activityType ?? fromEnv.activityType;
    this.subtype = options.subtype !== undefined ? options.subtype : fromEnv.subtype;
    this.templateId =
      options.templateId !== undefined ? options.templateId : fromEnv.templateId;
    this.metricValue = options.metricValue ?? fromEnv.metricValue;
    this.amountRaw = options.amountRaw !== undefined ? options.amountRaw : fromEnv.amountRaw;
    this.skipPayout =
      options.skipPayout !== undefined ? options.skipPayout : fromEnv.skipPayout;
    this.confirmFn = options.confirmFn;
    this.isTty = options.isTty;
    this.logDir = options.logDir;
    this.catalogPath = options.catalogPath;
    this.transferFn = options.transferFn ?? null;
    this.advanceId = options.advanceId !== undefined
      ? options.advanceId
      : process.env.CAPYBARA_ADVANCE_ID;
    this.advanceRoot = options.advanceRoot;
    this.balanceFn = options.balanceFn;
  }

  /**
   * @param {string} child
   * @param {string} advanceId
   * @returns {AdvanceLedgerAction}
   */
  advanceLedger(child, advanceId) {
    return new AdvanceLedgerAction(this.router, {
      advanceRoot: this.advanceRoot,
      decimals: this.payoutDecimals,
      env: {
        CAPYBARA_WALLET: child,
        CAPYBARA_ADVANCE_ID: advanceId,
      },
      balanceFn: this.balanceFn,
      confirmFn: this.confirmFn,
      isTty: this.isTty,
    });
  }

  /**
   * @param {string} child
   * @returns {Promise<bigint>}
   */
  async childBalanceRaw(child) {
    if (typeof this.balanceFn === 'function') {
      return BigInt(await this.balanceFn(child));
    }
    const token = this.router?.capyToken;
    const registry = this.router?.walletRegistry;
    if (typeof token?.getBalance === 'function' && typeof registry?.resolve === 'function') {
      const info = registry.resolve(child);
      return BigInt(await token.getBalance(info.address));
    }
    throw new Error('🚫 Баланс ребёнка нужен для аванса на action 4');
  }

  /**
   * @returns {Promise<object>}
   */
  async execute() {
    this.logger.section(SECTION_TITLE);

    const walletKey = String(this.walletName ?? '')
      .toLowerCase()
      .trim();
    if (!walletKey) {
      throw new Error('🚫 CAPYBARA_WALLET не задан — укажите tristan или bastian');
    }
    if (!CHILD_WALLETS.has(walletKey)) {
      throw new Error(
        `🚫 Неизвестный кошелёк «${this.walletName}» — для action 4 только tristan или bastian`
      );
    }
    if (!this.level || String(this.level).trim() === '') {
      throw new Error('🚫 CAPYBARA_LEVEL не задан');
    }
    if (!this.subject || String(this.subject).trim() === '') {
      throw new Error('🚫 CAPYBARA_SUBJECT не задан');
    }
    if (!this.activityType || String(this.activityType).trim() === '') {
      throw new Error('🚫 CAPYBARA_ACTIVITY_TYPE не задан');
    }

    const { config, walletRegistry, capyToken, provider, rpcManager } = this.router;
    const capyMode = config.mode === 'gfl_reality' ? 'gfl_reality' : 'mock';
    const isMockMode = capyMode !== 'gfl_reality';

    const catalog = loadFamilyCatalog(this.catalogPath);
    const amountInfo = resolveActivityPayoutAmount({
      catalog,
      system: this.system,
      activityType: this.activityType,
      subtype: this.subtype,
      templateId: this.templateId,
      metricValue: this.metricValue,
      amountRaw: this.amountRaw,
      skipPayout: this.skipPayout,
    });

    const metricDef = amountInfo.metricRule || { id: 'unknown' };
    const direction = metricDef.direction || 'higher_better';
    const wantsPayout = amountInfo.amountHuman != null;

    this.logger.info(
      `👛 ${displayWalletName(walletKey)} · system=${this.system} · ${this.activityType}` +
        (this.subtype ? `/${this.subtype}` : '') +
        ` · metric=${this.metricValue}`
    );
    if (wantsPayout) {
      this.logger.info(`💰 Payout amount: ${amountInfo.amountHuman} (source=${amountInfo.source})`);
    } else {
      this.logger.info('📝 Только метрики — payout пропущен');
    }

    let decimals = 18;
    let symbol = 'CAPY';
    let amountTokenRaw = 0n;
    if (wantsPayout) {
      decimals = await capyToken.getDecimals();
      symbol = await capyToken.getSymbol();
      amountTokenRaw = parseAmountHuman(amountInfo.amountHuman, decimals);
      if (amountTokenRaw <= 0n) {
        throw new Error('🚫 Сумма выплаты должна быть > 0');
      }
    }
    this.payoutDecimals = decimals;

    const advanceId = String(this.advanceId ?? '').trim();
    const hookAdvance = Boolean(advanceId) && wantsPayout;
    let clawbackDisplay = '';
    if (hookAdvance) {
      const balanceRaw = await this.childBalanceRaw(walletKey);
      const remainder = await this.advanceLedger(walletKey, advanceId).preflightEmbedded(
        walletKey,
        advanceId,
        amountTokenRaw,
        balanceRaw,
      );
      clawbackDisplay = formatAmountHuman(remainder, decimals, symbol);
    }

    if (wantsPayout && !isMockMode) {
      const amountDisplay = formatAmountHuman(amountTokenRaw, decimals, symbol);
      const question = hookAdvance
        ? `❓ Подтвердить выплату ${amountDisplay} → ${displayWalletName(walletKey)} и возврат ${clawbackDisplay} в пул? (да/нет) `
        : `❓ Подтвердить выплату ${amountDisplay} → ${displayWalletName(walletKey)}? (да/нет) `;
      const confirmed = await confirmPayment({
        owedTotalDisplay: amountDisplay,
        walletName: displayWalletName(walletKey),
        confirmFn: this.confirmFn,
        isTty: this.isTty,
        question,
      });
      if (!confirmed) {
        this.logger.info('🛑 Отменено — журнал не записан, перевод не отправлен');
        return { ok: true, action: 4, wallet: walletKey, cancelled: true };
      }
    }

    const childInfo = walletRegistry.resolve(walletKey);
    const parentAddress = config.parent.address;

    /** @type {(() => Promise<{ txHash?: string|null, mock?: boolean }>)|null} */
    let transferFn = null;
    if (wantsPayout) {
      if (typeof this.transferFn === 'function') {
        transferFn = this.transferFn;
      } else {
        transferFn = async () =>
          this._transferParentToChild({
            childAddress: childInfo.address,
            amountRaw: amountTokenRaw,
            capyToken,
            provider,
            rpcManager,
            isMockMode,
          });
      }
    }

    const journalResult = await stageAndCommitActivityJournal({
      wallet: walletKey,
      activity: {
        wallet: walletKey,
        system: this.system,
        level: String(this.level).trim(),
        period: this.period,
        subject: String(this.subject).trim(),
        activityType: String(this.activityType).trim(),
        subtype: this.subtype,
        templateId: this.templateId,
        metricDef,
        value: String(this.metricValue).trim(),
        direction,
        validatedBy: 'parent',
        mode: capyMode,
      },
      payout: wantsPayout
        ? {
            amount: amountInfo.amountHuman,
            from: parentAddress,
            to: childInfo.address,
            mock: isMockMode,
          }
        : null,
      transferFn,
      logDir: this.logDir,
      mode: capyMode,
    });

    if (journalResult.rolledBack) {
      const errMsg =
        journalResult.error instanceof Error
          ? journalResult.error.message
          : String(journalResult.error || 'transfer/journal failed');
      this.logger.error(`❌ Rollback — журнал не записан: ${errMsg}`);
      return {
        ok: false,
        action: 4,
        wallet: walletKey,
        rolledBack: true,
        submission_id: journalResult.submission_id,
        error: errMsg,
      };
    }

    this.logger.info(
      `✅ Зачтено · submission_id=${journalResult.submission_id} · committed=${journalResult.committed}` +
        (wantsPayout ? ` · payout=${amountInfo.amountHuman}` : '')
    );

    let settleResult = null;
    if (hookAdvance) {
      settleResult = await this.advanceLedger(walletKey, advanceId).settleEmbedded(walletKey, advanceId);
    }

    return {
      ok: true,
      action: 4,
      wallet: walletKey,
      submission_id: journalResult.submission_id,
      committed: journalResult.committed,
      amountHuman: amountInfo.amountHuman,
      amountSource: amountInfo.source,
      mock: isMockMode,
      mode: capyMode,
      entries: journalResult.entries,
      launched_by: resolveLaunchedBy(),
      advanceId: hookAdvance ? advanceId : null,
      advanceSettled: Boolean(settleResult),
    };
  }

  /**
   * @param {{
   *   childAddress: string,
   *   amountRaw: bigint,
   *   capyToken: object,
   *   provider: object,
   *   rpcManager: object|null,
   *   isMockMode: boolean,
   * }} params
   * @returns {Promise<{ txHash: string, mock: boolean, block: number|null }>}
   */
  async _transferParentToChild(params) {
    const { childAddress, amountRaw, capyToken, provider, rpcManager, isMockMode } = params;

    const parentBalance = await capyToken.getBalance(this.router.config.parent.address);
    if (parentBalance < amountRaw) {
      throw new Error('🚫 Недостаточно $CAPY на балансе родителя для выплаты');
    }

    const tx = await capyToken.transfer('parent', childAddress, amountRaw);
    const txHash = tx.hash;

    if (isMockMode) {
      this.logger.info('[MOCK] Пропускаю ожидание on-chain receipt — dry-run', { txHash });
      const receipt = await tx.wait();
      return { txHash, mock: true, block: receipt?.blockNumber ?? null };
    }

    this.logger.info('⏳ Жду подтверждения сети…', { txHash });
    const providerHolder = { provider: capyToken.provider };
    const receipt = await RateLimitHelpers.waitForTransactionReceipt(tx, txHash, provider, {
      maxRetries: 3,
      initialDelayMs: 1000,
      rpcManager: rpcManager || null,
      ethersUtils: providerHolder,
      contractName: 'CAPY activity payout transfer',
    });

    if (providerHolder.provider !== capyToken.provider) {
      capyToken.setProvider(providerHolder.provider);
    }

    return { txHash, mock: false, block: receipt.blockNumber ?? null };
  }
}

module.exports = ActivityPayoutAction;
module.exports.SECTION_TITLE = SECTION_TITLE;
module.exports.parseActivityPayoutEnv = parseActivityPayoutEnv;
module.exports.resolveActivityPayoutAmount = resolveActivityPayoutAmount;
module.exports.CHILD_WALLETS = CHILD_WALLETS;
