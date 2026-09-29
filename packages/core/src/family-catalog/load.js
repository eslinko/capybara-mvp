'use strict';

const fs = require('fs');
const path = require('path');
const { CAPYBARA_ROOT } = require('../env-path');

const DEFAULT_CATALOG_PATH = path.join(CAPYBARA_ROOT, 'config', 'family-catalog', 'systems.json');

/**
 * @param {unknown} catalog
 */
function assertCatalogShape(catalog) {
  if (!catalog || typeof catalog !== 'object') {
    throw new Error('family-catalog: root must be an object');
  }
  const c = /** @type {Record<string, unknown>} */ (catalog);
  if (!Array.isArray(c.systems) || c.systems.length === 0) {
    throw new Error('family-catalog: systems[] required and non-empty');
  }
  if (!Array.isArray(c.activityTypes)) {
    throw new Error('family-catalog: activityTypes[] required');
  }
  if (!Array.isArray(c.templates)) {
    throw new Error('family-catalog: templates[] required (may be empty)');
  }
  for (const sys of c.systems) {
    if (!sys || typeof sys !== 'object' || !sys.id) {
      throw new Error('family-catalog: each system needs id');
    }
  }
}

/**
 * @param {string} [filePath]
 * @returns {object}
 */
function loadFamilyCatalog(filePath = DEFAULT_CATALOG_PATH) {
  const resolved = path.resolve(filePath);
  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    const e = /** @type {NodeJS.ErrnoException} */ (err);
    throw new Error(`family-catalog: cannot read ${resolved}: ${e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const e = /** @type {Error} */ (err);
    throw new Error(`family-catalog: invalid JSON at ${resolved}: ${e.message}`);
  }
  assertCatalogShape(parsed);
  return parsed;
}

module.exports = {
  DEFAULT_CATALOG_PATH,
  loadFamilyCatalog,
  assertCatalogShape,
};
