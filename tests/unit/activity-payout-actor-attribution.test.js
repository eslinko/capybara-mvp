'use strict';

process.env.CAPYBARA_LAZY_CONFIG = '1';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const sinon = require('sinon');
const { ethers } = require('ethers');

const { buildConfigFromEnv } = require('../../packages/core/src/config/build');
const WalletRegistry = require('../../packages/core/src/WalletRegistry');
const ActivityPayoutAction = require('../../packages/core/src/actions/ActivityPayoutAction');
const { CapybaraActionsManager } = require('../../packages/core/src/actions/index');
const {
  MembershipStore,
  buildActorContext,
  buildAttributionPayload,
  resolveValidatedBy,
} = require('../../packages/core/src/membership');
const {
  CAPABILITIES,
  ROLE_MUTATION_CAPABILITY,
  runWithRoleGate,
} = require('../../packages/core/src/roleGate');
const {
  getWalletLogPath,
  resolveLogDirForMode,
} = require('../../packages/core/src/daily-payments/ndjsonLogReader');
const logger = require('../../packages/core/src/lib/infrastructure/Logger');

describe('ActivityPayout actor attribution (ROLE-03 / AC-R05)', () => {
  const baseEnv = {
    CAPY_RPC_URL: 'http://127.0.0.1:8545',
    CAPY_CHAIN_ID: '31337',
    CAPY_MODE: 'mock',
    CAPY_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
    PARENT_ADDRESS: '0x2222222222222222222222222222222222222222',
    PARENT_PRIVATE_KEY: '0x' + 'c'.repeat(64),
    CAPY_DAILY_TRISTAN: '5',
    CAPY_DAILY_BASTIAN: '5',
    TRISTAN_ADDRESS: '0x3333333333333333333333333333333333333333',
    TRISTAN_PRIVATE_KEY: '0x' + 'a'.repeat(64),
    BASTIAN_ADDRESS: '0x4444444444444444444444444444444444444444',
    BASTIAN_PRIVATE_KEY: '0x' + 'b'.repeat(64),
  };

  /** @type {string} */
  let tempLogDir;

  beforeEach(async () => {
    tempLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-role03-'));
  });

  afterEach(async () => {
    sinon.restore();
    if (tempLogDir) {
      await fs.rm(tempLogDir, { recursive: true, force: true });
    }
  });

  function seedParents() {
    const store = new MembershipStore();
    store.createFamily({ id: 'fam-a' });
    const p1 = store.addMembership({
      id: 'm-p1',
      familyId: 'fam-a',
      role: 'parent',
      address: '0xParentOne000000000000000000000000000001',
      userId: 'user-p1',
    });
    const p2 = store.addMembership({
      id: 'm-p2',
      familyId: 'fam-a',
      role: 'parent',
      address: '0xParentTwo000000000000000000000000000002',
      userId: 'user-p2',
    });
    const c1 = store.addMembership({
      id: 'm-c1',
      familyId: 'fam-a',
      role: 'child',
      address: '0xChildOne0000000000000000000000000000001',
    });
    return {
      store,
      family: store.listMembershipsByFamily('fam-a'),
      parent1: buildActorContext(p1),
      parent2: buildActorContext(p2),
      child1: buildActorContext(c1),
    };
  }

  function buildRouterStub() {
    const config = buildConfigFromEnv(baseEnv);
    const decimals = 8;
    const walletRegistry = new WalletRegistry(config, logger);
    const capyToken = {
      provider: { id: 'mock-provider' },
      setProvider: sinon.stub(),
      getDecimals: sinon.stub().resolves(decimals),
      getSymbol: sinon.stub().resolves('CAPY'),
      getBalance: sinon.stub().resolves(ethers.parseUnits('1000000', decimals)),
      transfer: sinon.stub().callsFake(async () => ({
        hash: '0xattr',
        wait: async () => ({ blockNumber: 1 }),
      })),
    };
    return { config, walletRegistry, capyToken, provider: { id: 'mock' }, rpcManager: null, logger };
  }

  async function readMockRows(wallet) {
    const filePath = getWalletLogPath(wallet, resolveLogDirForMode(tempLogDir, 'mock'));
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  const baseOpts = {
    walletName: 'tristan',
    system: 'cidead',
    level: 'primaria-3',
    period: 'T1',
    subject: 'matematicas',
    activityType: 'control',
    subtype: 'controlnaya',
    metricValue: '8.5',
    skipPayout: true,
  };

  describe('attribution payload shape (t01)', () => {
    it('builds membershipId + role + address from ActorContext', () => {
      const { parent1 } = seedParents();
      const payload = buildAttributionPayload(parent1);
      expect(payload).to.deep.equal({
        membershipId: 'm-p1',
        role: 'parent',
        address: parent1.address,
      });
      expect(resolveValidatedBy(null)).to.equal('parent');
      expect(resolveValidatedBy(parent1)).to.deep.equal(payload);
    });
  });

  describe('ActivityPayout journal attribution (t03/t04)', () => {
    it('writes distinct actor membership ids for two parents on equal ops', async () => {
      const { parent1, parent2 } = seedParents();
      const router = buildRouterStub();

      const a1 = new ActivityPayoutAction(router, {
        ...baseOpts,
        actor: parent1,
        logDir: tempLogDir,
      });
      const r1 = await a1.execute();
      expect(r1.ok).to.equal(true);

      const rows1 = await readMockRows('tristan');
      expect(rows1[0].type).to.equal('activity_validated');
      expect(rows1[0].validatedBy).to.deep.equal({
        membershipId: 'm-p1',
        role: 'parent',
        address: parent1.address,
      });

      // second equal op with other parent — wipe log for clean assert
      await fs.rm(tempLogDir, { recursive: true, force: true });
      tempLogDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capy-role03b-'));

      const a2 = new ActivityPayoutAction(router, {
        ...baseOpts,
        actor: parent2,
        logDir: tempLogDir,
      });
      const r2 = await a2.execute();
      expect(r2.ok).to.equal(true);
      const rows2 = await readMockRows('tristan');
      expect(rows2[0].validatedBy.membershipId).to.equal('m-p2');
      expect(rows2[0].validatedBy.membershipId).to.not.equal(
        rows1[0].validatedBy.membershipId
      );
    });

    it('legacy path without actor keeps validatedBy string parent', async () => {
      const router = buildRouterStub();
      const action = new ActivityPayoutAction(router, {
        ...baseOpts,
        logDir: tempLogDir,
      });
      await action.execute();
      const rows = await readMockRows('tristan');
      expect(rows[0].validatedBy).to.equal('parent');
    });
  });

  describe('gated path + no role escalation (t02/t05)', () => {
    it('action4ActivityPayoutGated threads actor only after RoleGate allow', async () => {
      const { parent1, family } = seedParents();
      expect(CapybaraActionsManager.prototype.action4ActivityPayoutGated).to.be.a(
        'function'
      );

      const manager = Object.create(CapybaraActionsManager.prototype);
      let ran = false;
      manager._warnGflRealityBeforeWrite = () => {};
      manager.router = buildRouterStub();

      // Deny path: role-mutation capability
      await manager
        .action4ActivityPayoutGated({
          actor: parent1,
          capabilityId: ROLE_MUTATION_CAPABILITY,
          familyMemberships: family,
          payoutOptions: { ...baseOpts, logDir: tempLogDir },
        })
        .then(
          () => {
            throw new Error('expected deny');
          },
          (err) => {
            expect(err.code).to.equal('EROLEGATE_DENY');
          }
        );

      // Allow path with real execute
      const result = await manager.action4ActivityPayoutGated({
        actor: parent1,
        capabilityId: CAPABILITIES.PAYOUT_FIXED_EDU_DAILY,
        resourceScope: { membershipId: 'm-c1' },
        familyMemberships: family,
        payoutOptions: { ...baseOpts, logDir: tempLogDir },
      });
      expect(result.ok).to.equal(true);
      const rows = await readMockRows('tristan');
      expect(rows[0].validatedBy.membershipId).to.equal('m-p1');
      ran = true;
      expect(ran).to.equal(true);
    });

    it('attribution helper does not escalate role (AC-R08)', () => {
      const { parent1, store } = seedParents();
      const payload = buildAttributionPayload(parent1);
      expect(payload.role).to.equal('parent');
      expect(() => store.changeRole()).to.throw(/Role change is not supported/);
      expect(() =>
        runWithRoleGate(
          { actor: parent1, capabilityId: ROLE_MUTATION_CAPABILITY },
          () => 'nope'
        )
      )
        .to.throw(/RoleGate deny/)
        .with.property('code', 'EROLEGATE_DENY');
    });
  });
});
