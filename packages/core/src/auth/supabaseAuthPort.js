'use strict';

const crypto = require('crypto');
const { normalizeAddress } = require('../membership/normalize');
const { authError } = require('./errors');

/**
 * Supabase Auth port — create/link user after AddressProof.
 * Uses Supabase **Auth** semantics (not a custom users-table-as-Auth).
 *
 * @typedef {{
 *   address: string,
 *   challengeId: string,
 *   verifiedAt: string,
 *   verifiedAtMs: number
 * }} AddressProof
 *
 * @typedef {{
 *   userId: string,
 *   address: string,
 *   created: boolean
 * }} AuthUserLinkResult
 *
 * @typedef {{
 *   kind: string,
 *   residual: boolean,
 *   createOrLinkUser: (proof: AddressProof) => Promise<AuthUserLinkResult> | AuthUserLinkResult
 * }} SupabaseAuthPort
 */

const CAPYBARA_AUTH_EMAIL_DOMAIN = 'capybara.local';

/**
 * Synthetic Auth email key (arch-01 lock). Not a real inbox.
 *
 * @param {string} address
 * @returns {string}
 */
function buildCapybaraAuthEmail(address) {
  return `${normalizeAddress(address)}@${CAPYBARA_AUTH_EMAIL_DOMAIN}`;
}

/**
 * @param {{ message?: string, code?: string, status?: number, statusCode?: number } | null | undefined} err
 * @returns {boolean}
 */
function isDuplicateUserError(err) {
  if (!err || typeof err !== 'object') return false;
  const code = String(err.code || '').toLowerCase();
  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    code === 'duplicate_email'
  ) {
    return true;
  }
  const status = err.status ?? err.statusCode;
  if (status === 422 || status === 409) {
    const msg = String(err.message || '').toLowerCase();
    if (
      msg.includes('already') ||
      msg.includes('registered') ||
      msg.includes('exists') ||
      msg.includes('duplicate')
    ) {
      return true;
    }
  }
  const msg = String(err.message || '').toLowerCase();
  return (
    /already\s+(been\s+)?(registered|exists)/i.test(msg) ||
    /user\s+already\s+exists/i.test(msg) ||
    /email.*already/i.test(msg)
  );
}

/**
 * In-memory / sinon-friendly Auth double for unit tests (not live Supabase).
 *
 * @param {{ userIdForAddress?: (address: string) => string }} [opts]
 * @returns {SupabaseAuthPort & { _users: Map<string, string>, _calls: AddressProof[] }}
 */
function createMemorySupabaseAuthDouble(opts = {}) {
  /** @type {Map<string, string>} */
  const users = new Map();
  /** @type {AddressProof[]} */
  const calls = [];

  const port = {
    kind: 'memory-double',
    /** Unit double is not a live residual substitute claim. */
    residual: false,
    /**
     * @param {AddressProof} proof
     * @returns {AuthUserLinkResult}
     */
    createOrLinkUser(proof) {
      if (!proof || typeof proof.address !== 'string') {
        throw authError('EAUTH_BAD_PAYLOAD', 'AddressProof required');
      }
      const address = normalizeAddress(proof.address);
      calls.push({ ...proof, address });
      const existing = users.get(address);
      if (existing) {
        return { userId: existing, address, created: false };
      }
      const userId =
        typeof opts.userIdForAddress === 'function'
          ? opts.userIdForAddress(address)
          : `auth-user-${crypto.randomBytes(8).toString('hex')}`;
      users.set(address, userId);
      return { userId, address, created: true };
    },
    _users: users,
    _calls: calls,
  };
  return port;
}

/**
 * Legacy residual placeholder — **not** the production live factory.
 * Kept for honesty / AUTH-02 residual tests. Prefer {@link createLiveSupabaseAuthPort}.
 *
 * @returns {SupabaseAuthPort}
 */
function createLiveSupabaseAuthPortResidual() {
  return {
    kind: 'live-supabase-js',
    residual: true,
    createOrLinkUser() {
      throw authError(
        'EAUTH_BIND_FAILED',
        'Live Supabase Auth port is residual (Phase 1–2); use memory double in unit tests',
      );
    },
  };
}

/**
 * @param {object} admin
 * @param {string} email
 * @param {(email: string) => Promise<{ id: string } | null | undefined>} [resolveUserByEmail]
 * @returns {Promise<{ id: string } | null>}
 */
async function findUserByEmail(admin, email, resolveUserByEmail) {
  if (typeof resolveUserByEmail === 'function') {
    const user = await resolveUserByEmail(email);
    return user && typeof user.id === 'string' ? user : null;
  }
  if (typeof admin.getUserByEmail === 'function') {
    const result = await admin.getUserByEmail(email);
    const user = result?.data?.user;
    return user && typeof user.id === 'string' ? user : null;
  }
  if (typeof admin.listUsers !== 'function') {
    return null;
  }
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.listUsers({ page, perPage: 200 });
    if (listed?.error) {
      throw authError(
        'EAUTH_BIND_FAILED',
        `Admin listUsers failed: ${listed.error.message || 'unknown'}`,
      );
    }
    const users = listed?.data?.users || [];
    const found = users.find(
      (u) => typeof u?.email === 'string' && u.email.toLowerCase() === target,
    );
    if (found && typeof found.id === 'string') {
      return found;
    }
    if (users.length < 200) break;
  }
  return null;
}

/**
 * Working live Supabase Auth port (AC-S02).
 * Inject `admin` (Auth Admin API) for units; or `createClient` + url/key for runtime
 * (packaging `@supabase/supabase-js` = SBPORT-03 soft parallel).
 *
 * @param {{
 *   admin?: {
 *     createUser: Function,
 *     listUsers?: Function,
 *     getUserByEmail?: Function
 *   },
 *   createClient?: Function,
 *   supabaseUrl?: string,
 *   serviceRoleKey?: string,
 *   resolveUserByEmail?: (email: string) => Promise<{ id: string } | null | undefined>
 * }} [opts]
 * @returns {SupabaseAuthPort}
 */
function createLiveSupabaseAuthPort(opts = {}) {
  let admin = opts.admin;
  if (!admin) {
    const createClient = opts.createClient;
    const url = typeof opts.supabaseUrl === 'string' ? opts.supabaseUrl.trim() : '';
    const key =
      typeof opts.serviceRoleKey === 'string' ? opts.serviceRoleKey.trim() : '';
    if (typeof createClient !== 'function') {
      throw authError(
        'EAUTH_BIND_FAILED',
        'createLiveSupabaseAuthPort requires admin or createClient inject',
      );
    }
    if (!url || !key) {
      throw authError(
        'EAUTH_ENV_MISSING',
        'supabaseUrl and serviceRoleKey required when using createClient',
      );
    }
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    admin = client?.auth?.admin;
    if (!admin || typeof admin.createUser !== 'function') {
      throw authError(
        'EAUTH_BIND_FAILED',
        'createClient did not yield auth.admin.createUser',
      );
    }
  } else if (typeof admin.createUser !== 'function') {
    throw authError(
      'EAUTH_BIND_FAILED',
      'admin.createUser is required for live Supabase Auth port',
    );
  }

  const resolveUserByEmail = opts.resolveUserByEmail;

  return {
    kind: 'live-supabase-js',
    residual: false,
    /**
     * @param {AddressProof} proof
     * @returns {Promise<AuthUserLinkResult>}
     */
    async createOrLinkUser(proof) {
      if (!proof || typeof proof.address !== 'string') {
        throw authError('EAUTH_BAD_PAYLOAD', 'AddressProof required');
      }
      const address = normalizeAddress(proof.address);
      const email = buildCapybaraAuthEmail(address);

      const created = await admin.createUser({
        email,
        email_confirm: true,
        app_metadata: { address },
        user_metadata: { address },
      });

      if (!created?.error) {
        const userId = created?.data?.user?.id;
        if (!userId || typeof userId !== 'string') {
          throw authError(
            'EAUTH_BIND_FAILED',
            'Admin createUser returned empty userId',
          );
        }
        return { userId, address, created: true };
      }

      if (isDuplicateUserError(created.error)) {
        const existing = await findUserByEmail(
          admin,
          email,
          resolveUserByEmail,
        );
        if (!existing?.id) {
          throw authError(
            'EAUTH_BIND_FAILED',
            'Duplicate Auth user but resolve-by-email returned empty userId',
          );
        }
        return { userId: existing.id, address, created: false };
      }

      throw authError(
        'EAUTH_BIND_FAILED',
        `Admin createUser failed: ${created.error.message || 'unknown'}`,
      );
    },
  };
}

module.exports = {
  CAPYBARA_AUTH_EMAIL_DOMAIN,
  buildCapybaraAuthEmail,
  isDuplicateUserError,
  createMemorySupabaseAuthDouble,
  createLiveSupabaseAuthPortResidual,
  createLiveSupabaseAuthPort,
};
