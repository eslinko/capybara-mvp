'use strict';

const fs = require('fs/promises');
const path = require('path');
const { getAdvanceLockPath } = require('./advancePath');

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function acquireAdvanceFileLock(filePath) {
  const lockPath = getAdvanceLockPath(filePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.mkdir(lockPath);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const busy = new Error(`advance file lock held: ${lockPath}`);
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
async function releaseAdvanceFileLock(filePath) {
  await fs.rmdir(getAdvanceLockPath(filePath));
}

/**
 * @template T
 * @param {string} filePath
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withAdvanceFileLock(filePath, fn) {
  await acquireAdvanceFileLock(filePath);
  try {
    return await fn();
  } finally {
    await releaseAdvanceFileLock(filePath);
  }
}

module.exports = {
  acquireAdvanceFileLock,
  releaseAdvanceFileLock,
  withAdvanceFileLock,
};
