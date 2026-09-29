'use strict';

const { utcToday, isValidDateStr, addUtcDays, enumerateUtcDays } = require('./dateUtils');

/**
 * @param {{ from?: string|null, to?: string|null, lastLogDate?: string|null, today?: string }} input
 * @returns {{ from: string, to: string, days: string[] }}
 */
function resolvePeriod(input = {}) {
  const today = input.today ?? utcToday();
  const toDate = input.to?.trim() || today;

  if (!isValidDateStr(toDate)) {
    throw new Error(`Invalid period end date: ${toDate}`);
  }

  let fromDate;
  if (input.from !== undefined && input.from !== null && String(input.from).trim() !== '') {
    fromDate = String(input.from).trim();
    if (!isValidDateStr(fromDate)) {
      throw new Error(`Invalid period start date: ${fromDate}`);
    }
  } else if (input.lastLogDate) {
    fromDate = addUtcDays(input.lastLogDate, 1);
  } else {
    fromDate = toDate;
  }

  if (fromDate > toDate) {
    return {
      from: fromDate,
      to: toDate,
      days: [],
      empty: true,
    };
  }

  return {
    from: fromDate,
    to: toDate,
    days: enumerateUtcDays(fromDate, toDate),
  };
}

module.exports = { resolvePeriod };
