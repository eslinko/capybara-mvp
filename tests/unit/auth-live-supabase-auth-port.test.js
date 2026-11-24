'use strict';

const { expect } = require('chai');
const { ethers } = require('ethers');

const {
  ChallengeStore,
  issueChallenge,
  verifyAddressProof,
  createLiveSupabaseAuthPort,
  createLiveSupabaseAuthPortResidual,
  createMemorySupabaseAuthDouble,
  buildCapybaraAuthEmail,
  bindAddressToAuthUser,
} = require('../../packages/core/src/auth');
const {
  isDuplicateUserError,
} = require('../../packages/core/src/auth/supabaseAuthPort');

describe('auth / live SupabaseAuthPort (SBPORT-01)', () => {
  async function makeProof() {
    const wallet = ethers.Wallet.createRandom();
    const store = new ChallengeStore();
    const nowMs = 1_700_000_000_000;
    const issued = issueChallenge(store, wallet.address, { nowMs, ttlMs: 120_000 });
    const signature = await wallet.signMessage(issued.message);
    return verifyAddressProof(store, issued.challengeId, signature, { nowMs });
  }

  describe('synthetic email + metadata (t02)', () => {
    it('builds {normalizeAddress}@capybara.local', async () => {
      const proof = await makeProof();
      const email = buildCapybaraAuthEmail(proof.address);
      expect(email).to.match(/^0x[a-f0-9]{40}@capybara\.local$/);
      expect(email.startsWith(proof.address.toLowerCase())).to.equal(true);
    });

    it('passes email + app_metadata.address to admin.createUser', async () => {
      const proof = await makeProof();
      /** @type {object[]} */
      const createCalls = [];
      const admin = {
        async createUser(attrs) {
          createCalls.push(attrs);
          return { data: { user: { id: 'uid-new-1' } }, error: null };
        },
      };
      const port = createLiveSupabaseAuthPort({ admin });
      expect(port.residual).to.equal(false);
      expect(port.kind).to.equal('live-supabase-js');
      const result = await port.createOrLinkUser(proof);
      expect(result).to.deep.include({
        userId: 'uid-new-1',
        address: proof.address,
        created: true,
      });
      expect(createCalls).to.have.length(1);
      expect(createCalls[0].email).to.equal(buildCapybaraAuthEmail(proof.address));
      expect(createCalls[0].app_metadata).to.deep.equal({ address: proof.address });
      expect(createCalls[0].user_metadata).to.deep.equal({ address: proof.address });
      expect(createCalls[0].email_confirm).to.equal(true);
    });
  });

  describe('create then duplicate→link (t01/t03)', () => {
    it('idempotent: create then duplicate resolves by email → created:false', async () => {
      const proof = await makeProof();
      const email = buildCapybaraAuthEmail(proof.address);
      let createCount = 0;
      const admin = {
        async createUser() {
          createCount += 1;
          if (createCount === 1) {
            return { data: { user: { id: 'uid-first' } }, error: null };
          }
          return {
            data: { user: null },
            error: { message: 'User already registered', status: 422, code: 'email_exists' },
          };
        },
      };
      const port = createLiveSupabaseAuthPort({
        admin,
        resolveUserByEmail: async (e) => {
          expect(e).to.equal(email);
          return { id: 'uid-first' };
        },
      });
      const first = await port.createOrLinkUser(proof);
      expect(first).to.deep.include({ userId: 'uid-first', created: true });
      const second = await port.createOrLinkUser(proof);
      expect(second).to.deep.include({ userId: 'uid-first', created: false });
    });

    it('fails closed on empty userId after create', async () => {
      const proof = await makeProof();
      const port = createLiveSupabaseAuthPort({
        admin: {
          async createUser() {
            return { data: { user: {} }, error: null };
          },
        },
      });
      try {
        await port.createOrLinkUser(proof);
        expect.fail('expected throw');
      } catch (e) {
        expect(e.code).to.equal('EAUTH_BIND_FAILED');
      }
    });

    it('detects duplicate error shapes', () => {
      expect(isDuplicateUserError({ code: 'email_exists' })).to.equal(true);
      expect(isDuplicateUserError({ message: 'already been registered', status: 422 })).to.equal(
        true,
      );
      expect(isDuplicateUserError({ message: 'network down', status: 500 })).to.equal(false);
    });
  });

  describe('factory vs residual honesty (t01/t04)', () => {
    it('production factory is residual:false; legacy residual still throws', async () => {
      const proof = await makeProof();
      const live = createLiveSupabaseAuthPort({
        admin: {
          async createUser() {
            return { data: { user: { id: 'uid-ok' } }, error: null };
          },
        },
      });
      expect(live.residual).to.equal(false);
      await live.createOrLinkUser(proof);

      const residual = createLiveSupabaseAuthPortResidual();
      expect(residual.residual).to.equal(true);
      expect(() => residual.createOrLinkUser(proof))
        .to.throw(/residual/i)
        .and.satisfy((e) => e.code === 'EAUTH_BIND_FAILED');
    });

    it('memory double remains for unit tests', async () => {
      const proof = await makeProof();
      const mem = createMemorySupabaseAuthDouble({
        userIdForAddress: () => 'mem-1',
      });
      const a = await mem.createOrLinkUser(proof);
      const b = await mem.createOrLinkUser(proof);
      expect(a.created).to.equal(true);
      expect(b.created).to.equal(false);
      expect(b.userId).to.equal('mem-1');
    });

    it('bindAddressToAuthUser works with live port inject', async () => {
      const proof = await makeProof();
      const authPort = createLiveSupabaseAuthPort({
        admin: {
          async createUser() {
            return { data: { user: { id: 'bound-uid' } }, error: null };
          },
        },
      });
      const link = await bindAddressToAuthUser({
        proof,
        authPort,
        config: {
          supabaseUrl: 'https://example.supabase.co',
          supabaseKey: 'k',
          bearerSecret: 's'.repeat(16),
        },
      });
      expect(link.userId).to.equal('bound-uid');
      expect(link.address).to.equal(proof.address);
    });

    it('createClient inject builds admin when admin omitted', async () => {
      const proof = await makeProof();
      const port = createLiveSupabaseAuthPort({
        supabaseUrl: 'https://example.supabase.co',
        serviceRoleKey: 'service-role',
        createClient: () => ({
          auth: {
            admin: {
              async createUser() {
                return { data: { user: { id: 'from-client' } }, error: null };
              },
            },
          },
        }),
      });
      const result = await port.createOrLinkUser(proof);
      expect(result.userId).to.equal('from-client');
      expect(result.created).to.equal(true);
    });
  });
});
