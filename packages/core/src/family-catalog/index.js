'use strict';

const { loadFamilyCatalog, DEFAULT_CATALOG_PATH, assertCatalogShape } = require('./load');
const { resolveMetricRule, resolvePayoutRule, findSystem } = require('./resolve');
const {
  scoreDigitScale,
  computeAutoPayoutAmount,
  requireAutoPayoutAmount,
} = require('./scoreDigitScale');

module.exports = {
  DEFAULT_CATALOG_PATH,
  loadFamilyCatalog,
  assertCatalogShape,
  resolveMetricRule,
  resolvePayoutRule,
  findSystem,
  scoreDigitScale,
  computeAutoPayoutAmount,
  requireAutoPayoutAmount,
};
