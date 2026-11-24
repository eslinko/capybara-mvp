'use strict';

/**
 * Checked-in golden vector for personal_sign params[0] (arch-01 C6).
 * Fixture message includes Cyrillic + newline — must stay byte-identical.
 *
 * Expected hex is a constant (do not derive only via the helper under test).
 */

const GOLDEN_FIXTURE_MESSAGE = 'Capybara:\nПривет wallet\nnonce=1';

/** @type {string} checked-in constant — ethers.hexlify(toUtf8Bytes(GOLDEN_FIXTURE_MESSAGE)) */
const GOLDEN_PERSONAL_SIGN_PARAMS0_HEX =
  '0x43617079626172613a0ad09fd180d0b8d0b2d0b5d1822077616c6c65740a6e6f6e63653d31';

module.exports = {
  GOLDEN_FIXTURE_MESSAGE,
  GOLDEN_PERSONAL_SIGN_PARAMS0_HEX,
};
