'use strict';

const fs = require('fs/promises');
const path = require('path');
const { getDebtLockPath } = require('./debtPath');

/**
 * @param {string} filePath
 * @returns {Promise<string>} lock directory path
 */
async function acquireDebtFileLock(filePath) {
  const lockPath = getDebtLockPath(filePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.mkdir(lockPath);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const busy = new Error(`debt file lock held: ${lockPath}`);
      busy.code = 'ELOCKED';
      throw busy;
    }
    throw error;
  }
  return lockPath;
}

/**
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function releaseDebtFileLock(filePath) {
  await fs.rmdir(getDebtLockPath(filePath));
}

/**
 * Hold the mkdir lock for the whole remainder read/append.
 * @template T
 * @param {string} filePath
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withDebtFileLock(filePath, fn) {
  await acquireDebtFileLock(filePath);
  try {
    return await fn();
  } finally {
    await releaseDebtFileLock(filePath);
  }
}

module.exports = {
  acquireDebtFileLock,
  releaseDebtFileLock,
  withDebtFileLock,
};
