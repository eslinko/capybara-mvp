'use strict';

const http = require('http');
const { handleHostRequest } = require('./health');
const { createAuthRuntime, tryHandleAuthRequest } = require('./authHttp');
const { tryHandleInviteRequest } = require('./inviteHttp');
const { tryHandleCapabilityProbe } = require('./capabilityProbe');
const { tryHandleConnectorLaunchRequest } = require('./connectorLaunch');
const { createSignRuntime, tryHandleSignRequest } = require('./signHttp');

/**
 * Create thin Node `http` host server (no Express).
 *
 * Composes GET /health + `/auth/*` + `POST /auth/invite` (INV-04) +
 * `/v1/capabilities/profile.self` + `GET /connector/launch` (WPROOF-10).
 *
 * Experimental `/sign/*` (WPROOF-01…09 residual) is **retired** from default
 * compose (option A). Opt-in only via `enableSignHttp: true` for historical
 * unit harness Soft residual — Soft≠Live · not Live product path.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   authRuntime?: ReturnType<typeof createAuthRuntime>,
 *   enableSignHttp?: boolean,
 *   signRuntime?: ReturnType<typeof createSignRuntime>,
 *   signTokenStore?: import('./signTokenStore').SignTokenStore,
 *   challengeStore?: import('../packages/core/src/auth/ChallengeStore').ChallengeStore,
 *   sessionStore?: import('../packages/core/src/auth/bearerSession').BearerSessionStore,
 *   authPort?: import('../packages/core/src/auth/supabaseAuthPort').SupabaseAuthPort,
 *   membershipStore?: import('../packages/core/src/membership/MembershipStore'),
 *   inviteStore?: import('../packages/core/src/invite/InviteStore'),
 *   nowMs?: number
 * }} [options]
 * @returns {import('http').Server}
 */
function createHostServer(options = {}) {
  const env = options.env || process.env;
  const { tryLoadSupabaseCreateClient } = require('./authHttp');
  const loadedCreateClient = tryLoadSupabaseCreateClient();
  const runtime =
    options.authRuntime ||
    createAuthRuntime(env, {
      challengeStore: options.challengeStore,
      sessionStore: options.sessionStore,
      authPort: options.authPort,
      createClient:
        typeof options.createClient === 'function'
          ? options.createClient
          : loadedCreateClient || undefined,
      membershipStore: options.membershipStore,
      inviteStore: options.inviteStore,
      nowMs: options.nowMs,
    });

  const enableSignHttp = options.enableSignHttp === true;
  let signRuntime = null;
  if (enableSignHttp) {
    signRuntime =
      options.signRuntime ||
      createSignRuntime({
        signTokenStore: options.signTokenStore,
        challenges: runtime.challenges,
        nowMs: options.nowMs,
        env,
      });
    if (!signRuntime.challenges) {
      signRuntime.challenges = runtime.challenges;
    }
    if (!runtime.signTokens) {
      runtime.signTokens = signRuntime.signTokens;
    }
  } else if (options.signTokenStore) {
    runtime.signTokens = options.signTokenStore;
  }

  return http.createServer((req, res) => {
    Promise.resolve(tryHandleAuthRequest(req, res, runtime))
      .then((authHandled) => {
        if (authHandled) return true;
        return tryHandleInviteRequest(req, res, runtime);
      })
      .then((handled) => {
        if (handled) return true;
        if (tryHandleConnectorLaunchRequest(req, res, env)) return true;
        return false;
      })
      .then((handled) => {
        if (handled) return true;
        if (enableSignHttp && signRuntime) {
          return tryHandleSignRequest(req, res, signRuntime);
        }
        return false;
      })
      .then((handled) => {
        if (handled) return true;
        return tryHandleCapabilityProbe(req, res, runtime);
      })
      .then((handled) => {
        if (!handled) {
          handleHostRequest(req, res);
        }
      })
      .catch((err) => {
        const body = JSON.stringify({
          ok: false,
          error: 'EHOST_INTERNAL',
          message: err && err.message ? err.message : 'host error',
        });
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
          });
        }
        res.end(body);
      });
  });
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
