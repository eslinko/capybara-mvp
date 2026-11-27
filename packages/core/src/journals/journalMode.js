'use strict';

const JOURNAL_MODES = Object.freeze(['mock', 'gfl_reality']);

/**
 * @param {unknown} mode
 * @returns {'mock'|'gfl_reality'}
 */
function assertJournalMode(mode) {
  const normalized = String(mode ?? '')
    .trim()
    .toLowerCase();
  if (!JOURNAL_MODES.includes(normalized)) {
    const err = new Error(
      `journal mode must be mock|gfl_reality, got: ${mode == null ? '(empty)' : String(mode)}`,
    );
    err.code = 'EJOURNAL_BAD_MODE';
    throw err;
  }
  return /** @type {'mock'|'gfl_reality'} */ (normalized);
}

module.exports = {
  JOURNAL_MODES,
  assertJournalMode,
};
