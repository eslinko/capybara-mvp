'use strict';

const http = require('http');
const { handleHostRequest } = require('./health');

/**
 * Create thin Node `http` host server (no Express).
 *
 * Phase 2 boundary: DualAuth / challenge-session edge may later register on the
 * same process — do **not** implement DualAuth in HOST-01 / Phase 1.
 *
 * @returns {import('http').Server}
 */
function createHostServer() {
  return http.createServer(handleHostRequest);
}

/**
 * Fail-closed PORT resolution for host start mode.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {number}
 */
function resolveListenPort(env) {
  const raw = env && env.PORT;
  if (typeof raw !== 'string' || !raw.trim()) {
    const err = new Error('HOST fail-closed: process.env.PORT is required');
    err.code = 'EHOST_PORT_REQUIRED';
    throw err;
  }
  const port = Number(raw.trim());
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    const err = new Error(
      'HOST fail-closed: process.env.PORT must be a valid TCP port',
    );
    err.code = 'EHOST_PORT_INVALID';
    throw err;
  }
  return port;
}

/**
 * @param {import('http').Server} server
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {Promise<import('http').Server>}
 */
function listenHost(server, env = process.env) {
  const port = resolveListenPort(env);
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });
}

module.exports = {
  createHostServer,
  resolveListenPort,
  listenHost,
};
