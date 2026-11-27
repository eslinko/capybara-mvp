'use strict';

const { inviteError } = require('./errors');

/**
 * Fail-closed Invite double when durable mode expected but env/client missing.
 * AC-P06: no silent empty RAM SoT success.
 */
class FailClosedInviteStore {
  /**
   * @param {string} [reason]
   */
  constructor(reason) {
    this._reason =
      reason || 'Durable invite store unavailable (auth env missing/invalid)';
    /** @type {'fail-closed-invite'} */
    this.kind = 'fail-closed-invite';
  }

  _deny() {
    throw inviteError('EINVITE_DURABLE_UNAVAILABLE', this._reason);
  }

  addInvite() {
    return this._deny();
  }
  getInvite() {
    return this._deny();
  }
  listByTo() {
    return this._deny();
  }
  listByFamily() {
    return this._deny();
  }
  listOpenByToInFamily() {
    return this._deny();
  }
  markAccepted() {
    return this._deny();
  }
  changeRole() {
    return this._deny();
  }
  setRole() {
    return this._deny();
  }
}

module.exports = FailClosedInviteStore;
