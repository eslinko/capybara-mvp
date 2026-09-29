'use strict';

/**
 * Cascade: template → subtype → activityType → system (first found wins).
 * @typedef {{ systemId: string, activityTypeId?: string|null, subtypeId?: string|null, templateId?: string|null }} ResolveCtx
 */

/**
 * @param {object} catalog
 * @param {string} templateId
 * @param {'metricRule'|'payoutRule'} field
 */
function ruleFromTemplate(catalog, templateId, field) {
  const templates = Array.isArray(catalog.templates) ? catalog.templates : [];
  const t = templates.find((x) => x && x.id === templateId);
  return t && t[field] ? t[field] : null;
}

/**
 * @param {object} system
 * @param {string|null|undefined} activityTypeId
 * @param {string|null|undefined} subtypeId
 * @param {'metricRule'|'payoutRule'} field
 */
function ruleFromSubtype(system, activityTypeId, subtypeId, field) {
  if (!activityTypeId || !subtypeId || !system.activityTypeOverrides) return null;
  const typeOv = system.activityTypeOverrides[activityTypeId];
  if (!typeOv || !typeOv.subtypeOverrides) return null;
  const sub = typeOv.subtypeOverrides[subtypeId];
  return sub && sub[field] ? sub[field] : null;
}

/**
 * @param {object} system
 * @param {string|null|undefined} activityTypeId
 * @param {'metricRule'|'payoutRule'} field
 */
function ruleFromActivityType(system, activityTypeId, field) {
  if (!activityTypeId || !system.activityTypeOverrides) return null;
  const typeOv = system.activityTypeOverrides[activityTypeId];
  if (!typeOv) return null;
  return typeOv[field] ? typeOv[field] : null;
}

/**
 * @param {object} catalog
 * @param {string} systemId
 */
function findSystem(catalog, systemId) {
  const systems = Array.isArray(catalog.systems) ? catalog.systems : [];
  const sys = systems.find((s) => s && s.id === systemId);
  if (!sys) {
    throw new Error(`family-catalog: unknown system id: ${systemId}`);
  }
  return sys;
}

/**
 * @param {object} catalog
 * @param {ResolveCtx} ctx
 * @param {'metricRule'|'payoutRule'} field
 */
function resolveRule(catalog, ctx, field) {
  if (!ctx || !ctx.systemId) {
    throw new Error('family-catalog: systemId required for resolve');
  }
  const system = findSystem(catalog, ctx.systemId);

  if (ctx.templateId) {
    const fromTpl = ruleFromTemplate(catalog, ctx.templateId, field);
    if (fromTpl) return { rule: fromTpl, source: 'template' };
  }

  const fromSub = ruleFromSubtype(system, ctx.activityTypeId, ctx.subtypeId, field);
  if (fromSub) return { rule: fromSub, source: 'subtype' };

  const fromType = ruleFromActivityType(system, ctx.activityTypeId, field);
  if (fromType) return { rule: fromType, source: 'activityType' };

  if (system[field]) return { rule: system[field], source: 'system' };

  return { rule: null, source: null };
}

/**
 * @param {object} catalog
 * @param {ResolveCtx} ctx
 */
function resolveMetricRule(catalog, ctx) {
  return resolveRule(catalog, ctx, 'metricRule');
}

/**
 * @param {object} catalog
 * @param {ResolveCtx} ctx
 */
function resolvePayoutRule(catalog, ctx) {
  return resolveRule(catalog, ctx, 'payoutRule');
}

module.exports = {
  resolveMetricRule,
  resolvePayoutRule,
  findSystem,
};
