'use strict';

/**
 * Production host entry — `npm run start` → this file (AC-H03).
 * Not CLI / hardhat / test runners.
 *
 * Phase 2: same process mounts `/auth/*` (EDGE-01/02) + `POST /auth/invite` (INV-04) +
 * DualAuthGate→RoleGate capability probe `/v1/capabilities/profile.self` (EDGE-03).
 * Live Supabase port = REQ-09 residual.
 * PGDUR-06 Soft≠Live: startup presence reports non-secret store_kind
 * (postgres | fail-closed | memory-inject). Live cast Pass Residual OK ≠ invent.
 * Host dotenv load via CAPYBARA_DOTENV_PATH before main() (EDGE-05).
 * Unit green alone ≠ Phase 2 Done / REQ-12 Done; family onboarding Done not claimed.
 */

const { createHostServer, resolveListenPort, listenHost } = require('./server');
const { describeAuthEnvPresence } = require('./authHttp');
const { loadHostDotenv } = require('./loadHostDotenv');

function main(env = process.env) {
  try {
    resolveListenPort(env);
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
    return;
  }

  const server = createHostServer({ env });
  return listenHost(server, env)
    .then(() => {
      // Port + residual-safe auth class presence — never dump secrets (AC-H02 / AC-I05).
      // PGDUR-06: include store_kind from composed runtime (no secrets).
      const storeKind =
        server.authRuntime && server.authRuntime.storeKind
          ? server.authRuntime.storeKind
          : undefined;
      console.error(`capybara host listening on ${String(env.PORT).trim()}`);
      console.error(
        describeAuthEnvPresence(env, undefined, { storeKind }).line,
      );
      return server;
    })
    .catch((err) => {
      console.error(err && err.message ? err.message : err);
      process.exitCode = 1;
    });
}

if (require.main === module) {
  // Load package `.env` before PORT/auth resolve (EDGE-05). No secret dump.
  loadHostDotenv(process.env);
  main();
}

module.exports = {
  main,
  loadHostDotenv,
};
