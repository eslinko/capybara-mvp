'use strict';

const { normalizeAddress } = require('../membership/normalize');
const { inviteError } = require('./errors');

/**
 * Lookup open Invite by `to` address (+ optional familyId). No opaque token.
 * Async-aware for Postgres invite adapters (PGDUR-02).
 *
 * @param {import('./InviteStore')} inviteStore
 * @param {string} toAddress
 * @param {string} [familyId]
 * @returns {Promise<object | null>}
 */
async function findOpenInviteByTo(inviteStore, toAddress, familyId) {
  if (!inviteStore || typeof inviteStore.listByTo !== 'function') {
    throw inviteError('EINVITE_BAD_PAYLOAD', 'inviteStore is required');
  }
  if (typeof toAddress !== 'string' || !toAddress.trim()) {
    throw inviteError('EINVITE_EMPTY_TO', 'to address is required for lookup');
  }

  const to = normalizeAddress(toAddress);
  let open = (await Promise.resolve(inviteStore.listByTo(to))).filter(
    (r) => r.status === 'open',
  );

  if (typeof familyId === 'string' && familyId.trim()) {
    const fid = familyId.trim();
    open = open.filter((r) => r.familyId === fid);
  }

  if (open.length === 0) {
    return null;
  }
  if (open.length > 1) {
    throw inviteError(
      'EINVITE_AMBIGUOUS',
      `Multiple open invites for ${to}; pass familyId to disambiguate`,
    );
  }
  return open[0];
}

module.exports = {
  findOpenInviteByTo,
};
