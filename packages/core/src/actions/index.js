'use strict';

const SweepToParentAction = require('./SweepToParentAction');
const DailyPaymentsAction = require('./DailyPaymentsAction');
const ChargeToPoolAction = require('./ChargeToPoolAction');
const ActivityPayoutAction = require('./ActivityPayoutAction');
const DeployCapybaraTokenAction = require('./DeployCapybaraTokenAction');
const MintCapybaraTokenAction = require('./MintCapybaraTokenAction');
const { DebtLedgerAction } = require('./DebtLedgerAction');
const { AdvanceLedgerAction } = require('./AdvanceLedgerAction');
const {
  loadCapybaraTokenArtifact,
  getDeployerWallet,
  assertGflOrMockSimulate,
  confirmGflReality,
} = require('../contract-ops');
const { runWithRoleGate, CAPABILITIES } = require('../roleGate');

const GFL_REALITY_BANNER =
  '⚠️ БОЕВОЙ РЕЖИМ: CAPY_MODE=gfl_reality — реальные переводы $CAPY включены!';

/**
 * Capybara action registry.
 */
class CapybaraActionsManager {
  /**
   * @param {import('../CapybaraRouter')} router
   */
  constructor(router) {
    this.router = router;
    /** @type {Map<number, () => Promise<object>>} */
    this.actionMap = new Map([
      [0, () => this.action0HealthCheck()],
      [1, () => this.action1SweepToParent()],
      [2, () => this.action2DailyPayments()],
      [3, () => this.action3ChargeToPool()],
      [4, () => this.action4ActivityPayout()],
      [6, () => this.action6DebtLedger()],
      [7, () => this.action7AdvanceLedger()],
      [51, () => this.action51Deploy()],
      [52, () => this.action52Mint()],
    ]);
  }

  /** @returns {void} */
  _warnGflRealityBeforeWrite() {
    const mode = this.router.config?.mode;
    if (mode === 'gfl_reality') {
      this.router.logger.warn(GFL_REALITY_BANNER);
    }
  }

  /** @returns {Promise<object>} */
  async action0HealthCheck() {
    const { config, walletRegistry, capyToken } = this.router;
    return {
      ok: true,
      action: 0,
      mode: config.mode,
      chainId: config.chainId,
      tokenAddress: config.token.address,
      wallets: walletRegistry.listKnownWallets(),
      symbol: await capyToken.getSymbol(),
    };
  }

  /** @returns {Promise<object>} */
  async action1SweepToParent() {
    this._warnGflRealityBeforeWrite();
    const walletName = process.env.CAPYBARA_WALLET;
    const amountHuman = process.env.CAPYBARA_AMOUNT;
    const sweep = new SweepToParentAction(this.router, { walletName, amountHuman });
    return sweep.execute();
  }

  /** @returns {Promise<object>} */
  async action2DailyPayments() {
    this._warnGflRealityBeforeWrite();
    const walletName = process.env.CAPYBARA_WALLET;
    const from = process.env.CAPYBARA_FROM;
    const to = process.env.CAPYBARA_TO;
    const daily = new DailyPaymentsAction(this.router, { walletName, from, to });
    return daily.execute();
  }

  /** @returns {Promise<object>} */
  async action3ChargeToPool() {
    this._warnGflRealityBeforeWrite();
    const walletName = process.env.CAPYBARA_WALLET;
    const amountHuman = process.env.CAPYBARA_AMOUNT;
    const splitRaw = process.env.CAPYBARA_SPLIT ?? null;
    if (!amountHuman || String(amountHuman).trim() === '') {
      throw new Error('🚫 CAPYBARA_AMOUNT не задан — укажите сумму списания');
    }
    const charge = new ChargeToPoolAction(this.router, { walletName, amountHuman, splitRaw });
    return charge.execute();
  }

  /** @returns {Promise<object>} */
  async action4ActivityPayout() {
    this._warnGflRealityBeforeWrite();
    const payout = new ActivityPayoutAction(this.router);
    return payout.execute();
  }

  /**
   * Deploy CapybaraToken (action 51). Mock does not broadcast.
   * @returns {Promise<object>}
   */
  async action51Deploy() {
    this._warnGflRealityBeforeWrite();
    const action = new DeployCapybaraTokenAction(this.router);
    return action.execute();
  }

  /**
   * Additional mint (action 52). Mock does not broadcast.
   * @returns {Promise<object>}
   */
  async action52Mint() {
    this._warnGflRealityBeforeWrite();
    const action = new MintCapybaraTokenAction(this.router);
    return action.execute();
  }

  /**
   * Debt ledger (action 6). Does not transfer tokens.
   * @returns {Promise<object>}
   */
  async action6DebtLedger() {
    this._warnGflRealityBeforeWrite();
    const action = new DebtLedgerAction(this.router);
    return action.execute();
  }

  /**
   * Thin RoleGate harness (ROLE-02): run action 6 only after allow.
   * Default capability = REQ-03 §3 `debt`. Existing action6 path unchanged.
   *
   * @param {{
   *   actor: object,
   *   resourceScope?: object,
   *   familyMemberships?: object[],
   *   capabilityId?: string
   * }} gateInput
   * @returns {Promise<object>}
   */
  async action6DebtLedgerGated(gateInput) {
    const capabilityId =
      (gateInput && gateInput.capabilityId) || CAPABILITIES.DEBT;
    return runWithRoleGate(
      {
        actor: gateInput && gateInput.actor,
        capabilityId,
        resourceScope: gateInput && gateInput.resourceScope,
        familyMemberships: gateInput && gateInput.familyMemberships,
      },
      () => this.action6DebtLedger()
    );
  }

  /**
   * Advance ledger (action 7): issue / forgive / settle / summary / show.
   * Embedded ADVANCE_ID clawback after payout lives on action 4, not here.
   * @returns {Promise<object>}
   */
  async action7AdvanceLedger() {
    this._warnGflRealityBeforeWrite();
    const action = new AdvanceLedgerAction(this.router);
    return action.execute();
  }

  /**
   * @param {number} actionNumber
   * @returns {Promise<object>}
   */
  async executeAction(actionNumber) {
    if (Number(actionNumber) === 5) {
      throw new Error('Unknown Capybara action: 5. use 51 or 52');
    }
    const action = this.actionMap.get(actionNumber);
    if (!action) {
      const available = this.getAvailableActions();
      throw new Error(
        `Unknown Capybara action: ${actionNumber}. Available actions: ${available.join(', ')}`
      );
    }
    return action();
  }

  /** @returns {number[]} */
  getAvailableActions() {
    return Array.from(this.actionMap.keys()).sort((a, b) => a - b);
  }
}

module.exports = {
  CapybaraActionsManager,
  SweepToParentAction,
  DailyPaymentsAction,
  ChargeToPoolAction,
  ActivityPayoutAction,
  DeployCapybaraTokenAction,
  MintCapybaraTokenAction,
  DebtLedgerAction,
  AdvanceLedgerAction,
  GFL_REALITY_BANNER,
  loadCapybaraTokenArtifact,
  getDeployerWallet,
  assertGflOrMockSimulate,
  confirmGflReality,
};
