'use strict';

const os = require('os');

/**
 * @returns {string}
 */
function resolveLaunchedBy() {
  return process.env.USER || os.userInfo().username || 'unknown';
}

module.exports = {
  resolveLaunchedBy,
};
