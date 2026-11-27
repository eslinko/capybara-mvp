'use strict';

const { normalizeAddress } = require('../membership/normalize');
const { authError } = require('./errors');

/**
 * Resolve membership for an authenticated session (userId + address).
 * Prefers userId matches; falls back to address; optional familyId filter.
 * May bind membership.userId when linking Supabase Auth user (empty slot).
 * Async-aware: store methods may return Promises (Postgres adapters).
 *
 * @param {{
 *   membershipStore: import('../membership/MembershipStore'),
 *   userId: string,
 *   address: string,
 *   familyId?: string,
 *   membershipId?: string,
 *   bindUserIdIfMissing?: boolean
 * }} input
 * @returns {Promise<object>} membership copy
 */
async function resolveMembershipForSession(input) {
  const store = input?.membershipStore;
  if (!store || typeof store.listMembershipsByUserId !== 'function') {
    throw authError('EAUTH_BAD_PAYLOAD', 'MembershipStore required');
  }
  if (typeof input.userId !== 'string' || !input.userId.trim()) {
    throw authError('EAUTH_BAD_PAYLOAD', 'userId required');
  }
  const userId = input.userId.trim();
  const address = normalizeAddress(input.address);
  const familyId =
    typeof input.familyId === 'string' && input.familyId.trim()
      ? input.familyId.trim()
      : null;
  const preferId =
    typeof input.membershipId === 'string' && input.membershipId.trim()
      ? input.membershipId.trim()
      : null;
  const bindIfMissing = input.bindUserIdIfMissing !== false;

  /** @param {object[]} list */
  const filterFamily = (list) =>
    familyId ? list.filter((m) => m.familyId === familyId) : list;

  if (preferId) {
    const preferred = await Promise.resolve(store.getMembership(preferId));
    if (!preferred) {
      throw authError('EAUTH_MEMBERSHIP_UNRESOLVED', `Unknown membershipId: ${preferId}`);
    }
    if (familyId && preferred.familyId !== familyId) {
      throw authError('EAUTH_MEMBERSHIP_UNRESOLVED', 'membershipId outside familyId');
    }
    if (preferred.address !== address && preferred.userId !== userId) {
      throw authError(
        'EAUTH_MEMBERSHIP_UNRESOLVED',
        'membershipId does not match session address/userId',
      );
    }
    if (!preferred.userId && bindIfMissing && typeof store.bindUserId === 'function') {
      return Promise.resolve(store.bindUserId(preferred.id, userId));
    }
    if (preferred.userId && preferred.userId !== userId) {
      throw authError('EAUTH_USERID_CONFLICT', 'membership.userId mismatches session');
    }
    return preferred;
  }

  let candidates = filterFamily(
    await Promise.resolve(store.listMembershipsByUserId(userId)),
  );
  if (candidates.length === 0) {
    candidates = filterFamily(
      await Promise.resolve(store.listMembershipsByAddress(address)),
    );
  }
  if (candidates.length === 0) {
    throw authError(
      'EAUTH_MEMBERSHIP_UNRESOLVED',
      `No membership for userId/address ${userId}/${address}`,
    );
  }
  // Prefer exact address match among userId hits
  const byAddress = candidates.filter((m) => m.address === address);
  const chosen = (byAddress.length > 0 ? byAddress : candidates)[0];

  if (!chosen.userId && bindIfMissing && typeof store.bindUserId === 'function') {
    return Promise.resolve(store.bindUserId(chosen.id, userId));
  }
  if (chosen.userId && chosen.userId !== userId) {
    throw authError('EAUTH_USERID_CONFLICT', 'membership.userId mismatches session');
  }
  return { ...chosen };
}

module.exports = {
  resolveMembershipForSession,
};
