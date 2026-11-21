'use strict';

/**
 * Production host entry — `npm run start` → this file (AC-H03).
 * Not CLI / hardhat / test runners.
 *
 * Phase 2 boundary: same process may later mount DualAuth challenge/session
 * handlers on this server. DualAuth is **not** implemented in HOST-01.
 */

const { createHostServer, resolveListenPort, listenHost } = require('./server');

function main(env = process.env) {
  try {
    resolveListenPort(env);
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
    return;
  }

  const server = createHostServer();
  return listenHost(server, env)
    .then(() => {
      // Log port only — never dump env/secrets (AC-H02).
      console.error(`capybara host listening on ${String(env.PORT).trim()}`);
      return server;
    })
    .catch((err) => {
      console.error(err && err.message ? err.message : err);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
