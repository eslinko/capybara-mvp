'use strict';

/**
 * Build a deterministic SIWE-class message string for `personal_sign`.
 *
 * **Invariant (REQ §2):** this login proof is NOT an on-chain money signature
 * and must never be treated as custody / transfer / money-sign authorization.
 * Money-sign / custody flows are out of AUTH-01 scope.
 *
 * @param {{
 *   address: string,
 *   nonce: string,
 *   issuedAt: string,
 *   expiresAt: string,
 *   domain?: string,
 *   uri?: string,
 *   statement?: string
 * }} input
 * @returns {string}
 */
function buildSiweClassMessage(input) {
  const address = String(input?.address ?? '');
  const nonce = String(input?.nonce ?? '');
  const issuedAt = String(input?.issuedAt ?? '');
  const expiresAt = String(input?.expiresAt ?? '');
  const domain = String(input?.domain ?? 'capybara.local');
  const uri = String(input?.uri ?? 'capybara://auth/challenge');
  const statement = String(
    input?.statement
      ?? 'Sign in to Capybara. This login proof is NOT an on-chain money signature or custody authorization.',
  );

  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    statement,
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
  ].join('\n');
}

module.exports = {
  buildSiweClassMessage,
};
