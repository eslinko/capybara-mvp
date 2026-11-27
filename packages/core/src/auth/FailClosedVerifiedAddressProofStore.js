'use strict';

/**
 * Fail-closed verified AddressProof double when durable mode expected but
 * env/client missing (EDGE-13 Soft≠Live).
 * AC-E13-03: no unlabeled Memory proof SoT on FailClosed durable path.
 */
class FailClosedVerifiedAddressProofStore {
  /**
   * @param {string} [reason]
   */
  constructor(reason) {
    this._reason =
      reason ||
      'Durable verified AddressProof store unavailable (auth env missing/invalid)';
    /** @type {'fail-closed-verified-proof'} */
    this.kind = 'fail-closed-verified-proof';
  }

  _deny() {
    const err = new Error(this._reason);
    err.code = 'EPROOF_DURABLE_UNAVAILABLE';
    throw err;
  }

  addVerifiedProof() {
    return this._deny();
  }

  getById() {
    return this._deny();
  }

  listByChallengeId() {
    return this._deny();
  }

  listAll() {
    return this._deny();
  }
}

module.exports = {
  FailClosedVerifiedAddressProofStore,
};
