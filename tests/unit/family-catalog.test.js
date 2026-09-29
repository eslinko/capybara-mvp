'use strict';

const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  loadFamilyCatalog,
  DEFAULT_CATALOG_PATH,
  resolveMetricRule,
  resolvePayoutRule,
  scoreDigitScale,
  computeAutoPayoutAmount,
  requireAutoPayoutAmount,
} = require('../../packages/core/src/family-catalog');

describe('family-catalog', () => {
  describe('loadFamilyCatalog', () => {
    it('loads default systems.json without throwing', () => {
      expect(fs.existsSync(DEFAULT_CATALOG_PATH)).to.equal(true);
      const catalog = loadFamilyCatalog();
      expect(catalog.version).to.equal(1);
      expect(catalog.systems.map((s) => s.id)).to.deep.equal(['cidead', 'ru']);
      expect(catalog.activityTypes.find((t) => t.id === 'control').subtypes).to.deep.equal([
        'dictant',
        'samostoyatelnaya',
        'controlnaya',
        'entrega',
      ]);
      expect(catalog.activityTypes.find((t) => t.id === 'exam').subtypes).to.deep.equal([]);
      expect(catalog.templates.map((t) => t.id)).to.deep.equal([
        'entrega-1.1',
        'dictant-ru-1',
        'sr-1',
      ]);
    });

    it('fails fast on invalid JSON', () => {
      const tmp = path.join(os.tmpdir(), `family-catalog-bad-${Date.now()}.json`);
      fs.writeFileSync(tmp, '{not-json', 'utf8');
      try {
        expect(() => loadFamilyCatalog(tmp)).to.throw(/invalid JSON/);
      } finally {
        fs.unlinkSync(tmp);
      }
    });
  });

  describe('cascade resolve', () => {
    let catalog;
    before(() => {
      catalog = loadFamilyCatalog();
    });

    it('subtype metric overrides system (ru dictant → error_count over percent)', () => {
      const systemLevel = resolveMetricRule(catalog, {
        systemId: 'ru',
        activityTypeId: 'control',
      });
      expect(systemLevel.source).to.equal('system');
      expect(systemLevel.rule.id).to.equal('percent');
      expect(systemLevel.rule.direction).to.equal('higher_better');

      const subtypeLevel = resolveMetricRule(catalog, {
        systemId: 'ru',
        activityTypeId: 'control',
        subtypeId: 'dictant',
      });
      expect(subtypeLevel.source).to.equal('subtype');
      expect(subtypeLevel.rule.id).to.equal('error_count');
      expect(subtypeLevel.rule.direction).to.equal('lower_better');
    });

    it('cidead system payout is score_digit_scale auto', () => {
      const { rule, source } = resolvePayoutRule(catalog, { systemId: 'cidead' });
      expect(source).to.equal('system');
      expect(rule.mode).to.equal('auto');
      expect(rule.algorithm).to.equal('score_digit_scale');
    });

    it('seeded templates resolve metricRule with source=template', () => {
      const cases = [
        { templateId: 'entrega-1.1', systemId: 'cidead', metricId: 'score_0_10' },
        { templateId: 'dictant-ru-1', systemId: 'ru', metricId: 'error_count' },
        { templateId: 'sr-1', systemId: 'ru', metricId: 'percent' },
      ];
      for (const c of cases) {
        const { rule, source } = resolveMetricRule(catalog, {
          systemId: c.systemId,
          templateId: c.templateId,
        });
        expect(source).to.equal('template');
        expect(rule).to.not.equal(null);
        expect(rule.id).to.equal(c.metricId);
      }
    });
  });

  describe('score_digit_scale', () => {
    it('maps interview examples', () => {
      expect(scoreDigitScale(10)).to.equal(1000);
      expect(scoreDigitScale('10')).to.equal(1000);
      expect(scoreDigitScale('7.22')).to.equal(722);
      expect(scoreDigitScale('7.2226')).to.equal(72226);
    });

    it('returns null for score 0 (no payout amount)', () => {
      expect(scoreDigitScale(0)).to.equal(null);
      expect(scoreDigitScale('0')).to.equal(null);
      expect(scoreDigitScale('0.00')).to.equal(null);
    });
  });

  describe('ru custom_only', () => {
    let catalog;
    before(() => {
      catalog = loadFamilyCatalog();
    });

    it('computeAutoPayoutAmount returns null for ru', () => {
      const { rule } = resolvePayoutRule(catalog, { systemId: 'ru' });
      expect(rule.mode).to.equal('custom_only');
      expect(computeAutoPayoutAmount(rule, 5)).to.equal(null);
    });

    it('requireAutoPayoutAmount throws for ru custom_only', () => {
      const { rule } = resolvePayoutRule(catalog, { systemId: 'ru' });
      expect(() => requireAutoPayoutAmount(rule, 5)).to.throw(/custom_only/);
    });

    it('cidead auto uses score_digit_scale', () => {
      const { rule } = resolvePayoutRule(catalog, { systemId: 'cidead' });
      expect(computeAutoPayoutAmount(rule, '7.22')).to.equal(722);
    });
  });
});
