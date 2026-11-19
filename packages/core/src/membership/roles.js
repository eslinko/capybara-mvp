'use strict';

/** @type {Readonly<{ PARENT: 'parent', CHILD: 'child' }>} */
const ROLES = Object.freeze({
  PARENT: 'parent',
  CHILD: 'child',
});

const ROLE_SET = new Set([ROLES.PARENT, ROLES.CHILD]);

/**
 * @param {unknown} role
 * @returns {role is 'parent' | 'child'}
 */
function isRole(role) {
  return typeof role === 'string' && ROLE_SET.has(role);
}

/**
 * @param {unknown} role
 * @returns {'parent' | 'child'}
 */
function assertRole(role) {
  if (!isRole(role)) {
    const err = new Error(
      `Invalid role "${String(role)}". Allowed roles: parent, child`
    );
    err.code = 'EMEMBERSHIP_INVALID_ROLE';
    throw err;
  }
  return role;
}

module.exports = {
  ROLES,
  ROLE_SET,
  isRole,
  assertRole,
};
