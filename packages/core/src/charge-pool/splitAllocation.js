'use strict';

const { ethers } = require('ethers');

/**
 * @param {string|null|undefined} splitRaw e.g. `tristan:60,bastian:40`
 * @param {string[]} children
 * @returns {Array<{ wallet: string, percent: number }>}
 */
function parseSplitSpec(splitRaw, children) {
  const childSet = new Set(children.map((c) => c.toLowerCase()));
  if (splitRaw === undefined || splitRaw === null || String(splitRaw).trim() === '') {
    const equalPct = 100 / children.length;
    return children.map((wallet) => ({ wallet, percent: equalPct }));
  }

  const trimmed = String(splitRaw).trim();
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('CAPYBARA_SPLIT is empty — use format tristan:60,bastian:40');
  }

  /** @type {Array<{ wallet: string, percent: number }>} */
  const spec = [];
  let totalPct = 0;

  for (const part of parts) {
    const match = /^([a-zA-Z]+)\s*:\s*(\d+(?:\.\d+)?)$/.exec(part);
    if (!match) {
      throw new Error(`CAPYBARA_SPLIT: invalid segment «${part}» — use name:percent`);
    }
    const wallet = match[1].toLowerCase();
    const percent = Number(match[2]);
    if (!childSet.has(wallet)) {
      throw new Error(
        `CAPYBARA_SPLIT: unknown wallet «${wallet}» — expected one of: ${children.join(', ')}`
      );
    }
    if (!Number.isFinite(percent) || percent <= 0) {
      throw new Error(`CAPYBARA_SPLIT: percent for «${wallet}» must be positive`);
    }
    if (spec.some((row) => row.wallet === wallet)) {
      throw new Error(`CAPYBARA_SPLIT: duplicate wallet «${wallet}»`);
    }
    spec.push({ wallet, percent });
    totalPct += percent;
  }

  if (Math.abs(totalPct - 100) > 0.001) {
    throw new Error(`CAPYBARA_SPLIT: percents must sum to 100 (got ${totalPct})`);
  }

  for (const child of children) {
    if (!spec.some((row) => row.wallet === child)) {
      throw new Error(`CAPYBARA_SPLIT: missing wallet «${child}»`);
    }
  }

  return spec.sort(
    (a, b) => children.indexOf(a.wallet) - children.indexOf(b.wallet)
  );
}

/**
 * Divide total raw amount across children; remainder base-units → first child in order.
 * @param {bigint} totalRaw
 * @param {string[]} children
 * @param {string|null|undefined} splitRaw
 * @returns {Array<{ wallet: string, amountRaw: bigint, percent?: number }>}
 */
function allocateShares(totalRaw, children, splitRaw = null) {
  if (totalRaw < 0n) {
    throw new Error('allocateShares: totalRaw must be non-negative');
  }
  if (children.length === 0) {
    throw new Error('allocateShares: children list is empty');
  }

  const isEqual = splitRaw === undefined || splitRaw === null || String(splitRaw).trim() === '';

  if (isEqual) {
    const base = totalRaw / BigInt(children.length);
    const remainder = totalRaw - base * BigInt(children.length);
    return children.map((wallet, index) => ({
      wallet,
      amountRaw: base + (index === 0 ? remainder : 0n),
    }));
  }

  const spec = parseSplitSpec(splitRaw, children);

  /** @type {Array<{ wallet: string, amountRaw: bigint, percent: number }>} */
  const rows = spec.map(({ wallet, percent }) => ({
    wallet,
    percent,
    amountRaw: (totalRaw * BigInt(Math.round(percent * 1000))) / 100000n,
  }));

  const allocated = rows.reduce((acc, row) => acc + row.amountRaw, 0n);
  const remainder = totalRaw - allocated;
  if (remainder > 0n) {
    rows[0].amountRaw += remainder;
  }

  return rows;
}

/**
 * @param {string} amountHuman
 * @param {number} decimals
 * @returns {bigint}
 */
function parseAmountHuman(amountHuman, decimals) {
  const trimmed = String(amountHuman).trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`CAPYBARA_AMOUNT must be a positive number (got «${trimmed}»)`);
  }
  if (Number(trimmed) <= 0) {
    throw new Error('CAPYBARA_AMOUNT must be greater than 0');
  }
  return ethers.parseUnits(trimmed, decimals);
}

module.exports = {
  parseSplitSpec,
  allocateShares,
  parseAmountHuman,
};
