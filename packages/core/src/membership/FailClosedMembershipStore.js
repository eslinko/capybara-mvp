'use strict';

const { ROLES } = require('./roles');

/**
 * Fail-closed Membership double when durable mode expected but env/client missing.
 * AC-P06: no silent empty RAM SoT success.
 */
class FailClosedMembershipStore {
  /**
   * @param {string} [reason]
   */
  constructor(reason) {
    this._reason =
      reason ||
      'Durable membership store unavailable (auth env missing/invalid)';
    /** @type {'fail-closed-membership'} */
    this.kind = 'fail-closed-membership';
  }

  _deny() {
    const err = new Error(this._reason);
    err.code = 'EMEMBERSHIP_DURABLE_UNAVAILABLE';
    throw err;
  }

  createFamily() {
    return this._deny();
  }
  getFamily() {
    return this._deny();
  }
  listFamilies() {
    return this._deny();
  }
  setPoolIdentity() {
    return this._deny();
  }
  isBootstrapped() {
    return this._deny();
  }
  markBootstrapped() {
    return this._deny();
  }
  addMembership() {
    return this._deny();
  }
  getMembership() {
    return this._deny();
  }
  listMembershipsByFamily() {
    return this._deny();
  }
  listMembershipsByUserId() {
    return this._deny();
  }
  listMembershipsByAddress() {
    return this._deny();
  }
  bindUserId() {
    return this._deny();
  }
  getRoleForAddress() {
    return this._deny();
  }
  changeRole() {
    return this._deny();
  }
  setRole() {
    return this._deny();
  }

  static get ROLES() {
    return ROLES;
  }
}

module.exports = FailClosedMembershipStore;
