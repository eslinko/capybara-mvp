'use strict';

/**
 * Human block for action 6 summary/show. Amount cells stay formatRawAmount strings.
 * @param {Record<string, unknown>} card
 * @returns {string}
 */
function cardLine(card) {
  const cells = [
    card?.debtId ?? '',
    card?.comment ?? '',
    card?.original_human ?? '',
    card?.settled_human ?? '',
    card?.remainder_human ?? '',
  ];
  return cells.map((cell) => String(cell)).join(' | ');
}

/**
 * @param {Record<string, unknown>} card
 * @returns {string[]}
 */
function cardFlags(card) {
  const bits = [];
  if (card?.overdue) bits.push('overdue');
  if (card?.pending) bits.push('pending');
  if (Array.isArray(card?.sanctions) && card.sanctions.length > 0) bits.push('sanctions');
  if (bits.length === 0) return [];
  return [`${String(card.debtId ?? '')}: ${bits.join(', ')}`];
}

/**
 * @param {Record<string, unknown>} result
 * @returns {string}
 */
function formatSummary(result) {
  const debts = Array.isArray(result.debts) ? result.debts : [];
  const lines = [
    'read-only · confirmed: false',
    String(result.child ?? ''),
    String(result.outstanding_human ?? ''),
    'debt_id | comment | original | settled | remainder',
    ...debts.map((card) => cardLine(card)),
  ];
  if (Array.isArray(result.unresolvedClosures) && result.unresolvedClosures.length > 0) {
    lines.push(`unresolvedClosures: ${result.unresolvedClosures.join(', ')}`);
  }
  for (const card of debts) {
    lines.push(...cardFlags(card));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {Record<string, unknown>} result
 * @returns {string}
 */
function formatShow(result) {
  const card = result.card && typeof result.card === 'object' ? result.card : {};
  const lines = [
    'read-only · confirmed: false',
    String(result.child ?? ''),
    String(card.remainder_human ?? ''),
    'debt_id | comment | original | settled | remainder',
    cardLine(card),
    ...cardFlags(card),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * @param {Record<string, unknown>|null|undefined} result
 * @returns {string}
 */
function formatHumanBlock(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.op === 'summary') return formatSummary(result);
  if (result.op === 'show') return formatShow(result);
  return '';
}

module.exports = {
  formatHumanBlock,
  formatSummary,
  formatShow,
};
