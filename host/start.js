'use strict';

/**
 * Production host entry — `npm run start` → this file (AC-H03).
 * Not CLI / hardhat / test runners.
 *
 * Same process mounts `/auth/*` (EDGE-01 session + EDGE-02 bootstrap) via createHostServer.
 * DualAuthGate capability probe is **not** implemented here (EDGE-03).
 * Live Supabase port = REQ-09 residual. MembershipStore in-memory residual (EDGE-04).
 * Unit green alone ≠ Phase 2 Done (AC-I06).
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
