'use strict';

/**
 * Shared service-role supabase-js client for Auth Admin + table access (PGDUR / REQ-12).
 * Soft≠Live: client Present ≠ invent REQ-12 Done / Live Pass.
 * No invent `pg` / `DATABASE_URL`.
 *
 * @param {{
 *   supabaseUrl: string,
 *   supabaseKey: string,
 *   createClient?: Function
 * }} opts
 * @returns {object} supabase-js client
 */
function createServiceSupabaseClient(opts) {
  if (!opts || typeof opts.supabaseUrl !== 'string' || !opts.supabaseUrl.trim()) {
    const err = new Error('supabaseUrl required for service client');
    err.code = 'ESUPABASE_CLIENT';
    throw err;
  }
  if (typeof opts.supabaseKey !== 'string' || !opts.supabaseKey.trim()) {
    const err = new Error('supabaseKey required for service client');
    err.code = 'ESUPABASE_CLIENT';
    throw err;
  }

  let createClient = opts.createClient;
  if (typeof createClient !== 'function') {
    try {
      const mod = require('@supabase/supabase-js');
      createClient = typeof mod.createClient === 'function' ? mod.createClient : null;
    } catch {
      createClient = null;
    }
  }
  if (typeof createClient !== 'function') {
    const err = new Error(
      'Live Supabase client unavailable (@supabase/supabase-js); inject createClient',
    );
    err.code = 'ESUPABASE_CLIENT_UNAVAILABLE';
    throw err;
  }

  return createClient(opts.supabaseUrl.trim(), opts.supabaseKey.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

module.exports = {
  createServiceSupabaseClient,
};
