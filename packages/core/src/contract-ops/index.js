'use strict';

const fs = require('fs/promises');
const path = require('path');
const { ethers } = require('ethers');
const { normalizePrivateKey } = require('../config/build');
const { confirmPayment } = require('../daily-payments/confirmPayment');

/**
 * Artifact path relative to the capybara repo root.
 * Same file `scripts/deploy.js` reads. Core does not load Hardhat.
 */
const ARTIFACT_RELATIVE_PATH = 'artifacts/contracts/CapybaraToken.sol/CapybaraToken.json';

/**
 * @returns {string} Absolute capybara/ directory (four levels above this file).
 */
function capybaraRootFromHere() {
  return path.resolve(__dirname, '../../../..');
}

/**
 * @param {string} [rootDir]
 * @returns {string}
 */
function resolveCapybaraTokenArtifactPath(rootDir) {
  const root = rootDir ?? capybaraRootFromHere();
  return path.join(root, ARTIFACT_RELATIVE_PATH);
}

/**
 * Load ABI + bytecode. Missing file → error containing «compile first».
 * @param {{ rootDir?: string, artifactPath?: string }} [options]
 * @returns {Promise<{ abi: unknown[], bytecode: string, artifactPath: string }>}
 */
async function loadCapybaraTokenArtifact(options = {}) {
  const artifactPath = options.artifactPath ?? resolveCapybaraTokenArtifactPath(options.rootDir);
  let raw;
  try {
    raw = await fs.readFile(artifactPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const missing = new Error(
        `Contract artifact not found at ${artifactPath}. compile first`
      );
      missing.code = 'ARTIFACT_MISSING';
      throw missing;
    }
    throw error;
  }

  const parsed = JSON.parse(raw);
  const abi = parsed?.abi;
  const bytecode = parsed?.bytecode;
  if (!Array.isArray(abi) || typeof bytecode !== 'string' || bytecode.length === 0) {
    throw new Error(
      `Contract artifact at ${artifactPath} is missing abi or bytecode. compile first`
    );
  }
  return { abi, bytecode, artifactPath };
}

/**
 * Wallet(normalize(DEPLOYER_PRIVATE_KEY), provider). Provider comes from the router
 * (CAPY_RPC_URL). Address must match DEPLOYER_ADDRESS.
 * @param {{ config?: { deployer?: { address?: string, privateKey?: string }|null }, provider?: import('ethers').Provider }} router
 * @returns {import('ethers').Wallet}
 */
function getDeployerWallet(router) {
  const deployer = router?.config?.deployer ?? null;
  const provider = router?.provider ?? null;
  const privateKeyRaw = deployer?.privateKey ?? '';
  if (!String(privateKeyRaw).trim()) {
    throw new Error('DEPLOYER_PRIVATE_KEY is required');
  }
  if (!provider) {
    throw new Error('CAPY_RPC_URL is required');
  }
  const expected = String(deployer?.address ?? '').trim();
  if (!expected) {
    throw new Error('DEPLOYER_ADDRESS is required');
  }

  const privateKey = normalizePrivateKey(privateKeyRaw);
  const wallet = new ethers.Wallet(privateKey, provider);
  if (wallet.address.toLowerCase() !== expected.toLowerCase()) {
    const mismatch = new Error(
      `DEPLOYER_ADDRESS mismatch: config ${expected} != wallet ${wallet.address}`
    );
    mismatch.code = 'DEPLOYER_ADDRESS_MISMATCH';
    throw mismatch;
  }
  return wallet;
}

/**
 * Mock returns a would-* result and does not send. gfl_reality marks send allowed;
 * the caller still must confirm via confirmGflReality.
 * @param {string} mode
 * @returns {{ ok: true, mode: 'mock'|'gfl_reality', would: string|null, send: boolean }}
 */
function assertGflOrMockSimulate(mode) {
  const normalized = String(mode ?? '').trim();
  if (normalized !== 'mock' && normalized !== 'gfl_reality') {
    throw new Error('CAPY_MODE must be one of: mock, gfl_reality');
  }
  if (normalized === 'mock') {
    return { ok: true, mode: 'mock', would: 'would-simulate', send: false };
  }
  return { ok: true, mode: 'gfl_reality', would: null, send: true };
}

/**
 * TTY confirm only when mode is gfl_reality and the session is interactive.
 * Mock returns the would-* shape and does not prompt.
 * @param {{ config?: { mode?: string } }} router
 * @param {string} summary
 * @param {{ isTty?: boolean, confirmFn?: (question: string) => Promise<string>, question?: string }} [options]
 * @returns {Promise<object>}
 */
async function confirmGflReality(router, summary, options = {}) {
  const mode = router?.config?.mode === 'gfl_reality' ? 'gfl_reality' : 'mock';
  if (mode !== 'gfl_reality') {
    return assertGflOrMockSimulate('mock');
  }

  const isTty = options.isTty ?? Boolean(process.stdin.isTTY);
  const confirmed = await confirmPayment({
    owedTotalDisplay: String(summary ?? ''),
    walletName: 'deployer',
    question: options.question ?? `❓ Подтвердить ${summary}? (да/нет) `,
    isTty,
    confirmFn: options.confirmFn,
  });
  return {
    ok: true,
    mode: 'gfl_reality',
    confirmed,
    send: Boolean(confirmed),
    would: null,
  };
}

module.exports = {
  ARTIFACT_RELATIVE_PATH,
  resolveCapybaraTokenArtifactPath,
  loadCapybaraTokenArtifact,
  getDeployerWallet,
  assertGflOrMockSimulate,
  confirmGflReality,
};
