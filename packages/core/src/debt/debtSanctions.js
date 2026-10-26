'use strict';

const SANCTION_TYPES = new Set(['gadget', 'block-new-debts']);

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {string} [debtId]
 * @returns {Array<Record<string, unknown>>}
 */
function activeSanctions(events, debtId) {
  /** @type {Map<string, Record<string, unknown>>} */
  const open = new Map();
  for (const event of events) {
    if (debtId && event?.debt_id !== debtId) {
      continue;
    }
    const sanctionId = typeof event?.sanction_id === 'string' ? event.sanction_id : '';
    if (!sanctionId) {
      continue;
    }
    if (event.type === 'sanction-add') {
      open.set(sanctionId, event);
    } else if (event.type === 'sanction-cancel') {
      open.delete(sanctionId);
    }
  }
  return [...open.values()];
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @returns {boolean}
 */
function unresolvedSanctions(events, debtId) {
  const decided = new Set();
  for (const event of events) {
    if (event?.debt_id !== debtId || event.type !== 'closure-resolve' || !Array.isArray(event.decisions)) {
      continue;
    }
    for (const item of event.decisions) {
      if (typeof item?.sanction_id === 'string') {
        decided.add(item.sanction_id);
      }
    }
  }
  return activeSanctions(events, debtId).filter((event) => !decided.has(event.sanction_id));
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @returns {boolean}
 */
function hasManualBlock(events) {
  return activeSanctions(events).some((event) => event.sanction_type === 'block-new-debts');
}

/**
 * One row per date. The same hour is not listed twice; reasons are kept.
 * @param {Array<Record<string, unknown>>} events
 * @param {string} today
 * @param {string} minutes
 * @returns {{ current: Array<Record<string, unknown>>, history: Array<Record<string, unknown>> }}
 */
function mergedGadgets(events, today, minutes) {
  /** @type {Map<string, { date: string, minutes: string, reasons: string[], sanctionIds: string[], future: boolean }>} */
  const byDate = new Map();
  for (const sanction of activeSanctions(events)) {
    if (sanction.sanction_type !== 'gadget' || !Array.isArray(sanction.dates)) {
      continue;
    }
    const reason = typeof sanction.comment === 'string' ? sanction.comment : '';
    for (const date of sanction.dates) {
      if (typeof date !== 'string') {
        continue;
      }
      const row = byDate.get(date) ?? {
        date,
        minutes,
        reasons: [],
        sanctionIds: [],
        future: date >= today,
      };
      if (reason && !row.reasons.includes(reason)) {
        row.reasons.push(reason);
      }
      if (!row.sanctionIds.includes(sanction.sanction_id)) {
        row.sanctionIds.push(sanction.sanction_id);
      }
      byDate.set(date, row);
    }
  }
  const rows = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  return {
    current: rows.filter((row) => row.future),
    history: rows.filter((row) => !row.future),
  };
}

/**
 * @param {string} raw
 * @returns {Array<{ sanction_id: string, decision: string }>|null}
 */
function parseDecisionList(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }
  return text.split(',').map((part) => {
    const [sanctionId, decision] = part.split(':').map((piece) => piece.trim());
    return { sanction_id: sanctionId, decision };
  });
}

module.exports = {
  SANCTION_TYPES,
  activeSanctions,
  unresolvedSanctions,
  hasManualBlock,
  mergedGadgets,
  parseDecisionList,
};
