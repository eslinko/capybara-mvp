'use strict';

/**
 * CIDEAD payout algorithm `score_digit_scale` (concept §5).
 * @param {string|number} score
 * @returns {number|null} payout amount, or null when score === 0 (no payout)
 */
function scoreDigitScale(score) {
  if (score === null || score === undefined) {
    throw new Error('score_digit_scale: score required');
  }
  const asString = String(score).trim();
  if (asString === '') {
    throw new Error('score_digit_scale: empty score');
  }
  const numeric = Number(asString);
  if (!Number.isFinite(numeric)) {
    throw new Error(`score_digit_scale: not a number: ${asString}`);
  }
  if (numeric === 0) {
    return null;
  }

  let canonical = asString;
  if (!canonical.includes('.')) {
    canonical = `${canonical}.00`;
  }
  const digits = canonical.replace('.', '');
  const amount = Number(digits);
  if (!Number.isFinite(amount)) {
    throw new Error(`score_digit_scale: cannot parse digits from ${canonical}`);
  }
  return amount;
}

/**
 * Auto payout amount from resolved payout rule.
 * `custom_only` → null (no auto amount).
 * @param {object|null} payoutRule
 * @param {string|number} score
 * @returns {number|null}
 */
function computeAutoPayoutAmount(payoutRule, score) {
  if (!payoutRule) {
    return null;
  }
  if (payoutRule.mode === 'custom_only') {
    return null;
  }
  if (payoutRule.mode === 'auto' && payoutRule.algorithm === 'score_digit_scale') {
    return scoreDigitScale(score);
  }
  throw new Error(
    `family-catalog: unsupported payout rule mode/algorithm: ${JSON.stringify(payoutRule)}`
  );
}

/**
 * Strict auto: throws when rule is custom_only.
 * @param {object|null} payoutRule
 * @param {string|number} score
 * @returns {number|null}
 */
function requireAutoPayoutAmount(payoutRule, score) {
  if (payoutRule && payoutRule.mode === 'custom_only') {
    throw new Error('family-catalog: payout mode custom_only — auto amount not allowed');
  }
  return computeAutoPayoutAmount(payoutRule, score);
}

module.exports = {
  scoreDigitScale,
  computeAutoPayoutAmount,
  requireAutoPayoutAmount,
};
