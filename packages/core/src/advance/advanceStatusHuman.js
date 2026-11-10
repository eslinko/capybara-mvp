'use strict';

/**
 * Human block for action 7 summary/show. Amount cells stay formatRawAmount strings.
 * @param {Record<string, unknown>} card
 * @returns {string}
 */
function cardLine(card) {
  return [card?.advanceId ?? '', card?.comment ?? '', card?.remainder_human ?? '']
    .map((cell) => String(cell))
    .join(' | ');
}

/**
 * @param {Record<string, unknown>} result
 * @returns {string}
 */
function formatSummary(result) {
  const advances = Array.isArray(result.advances) ? result.advances : [];
  const lines = [
    'read-only · confirmed: false',
    String(result.child ?? ''),
    String(result.outstanding_human ?? ''),
    'advance_id | comment | remainder',
    ...advances.map((card) => cardLine(card)),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * @param {Record<string, unknown>} result
 * @returns {string}
 */
function formatShow(result) {
  const card = result.card && typeof result.card === 'object' ? result.card : {};
  const history = Array.isArray(result.history) ? result.history : [];
  const lines = [
    'read-only · confirmed: false',
    String(result.child ?? ''),
    String(card.remainder_human ?? ''),
    'advance_id | comment | remainder',
    cardLine(card),
    ...history.map((event) => {
      const type = String(event?.type ?? '');
      const amount = event?.amounts?.amount != null ? String(event.amounts.amount) : '';
      const comment = event?.comment != null ? String(event.comment) : '';
      return `${type} | ${amount} | ${comment}`;
    }),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * @param {Record<string, unknown>|null|undefined} result
 * @returns {string}
 */
function formatAdvanceHumanBlock(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.op === 'summary') return formatSummary(result);
  if (result.op === 'show') return formatShow(result);
  return '';
}

module.exports = {
  formatAdvanceHumanBlock,
};
