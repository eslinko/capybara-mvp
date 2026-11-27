'use strict';

/**
 * EDGE-08 / G8 — membership+invite redeploy residual honesty (unit).
 * PGDUR-02: durable Postgres when createClient composed; else fail-closed (AC-P06).
 * Soft≠Live: adapters/unit ≠ invent REQ-12 Done / Live Pass.
 * AC-G8-03/04: manuals Residual-label; npm/docs alone ≠ durability Done.
 */

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

const ROOT = path.join(__dirname, '..', '..');
const AUTH_HTTP = path.join(ROOT, 'host', 'authHttp.js');
const RESIDUAL = path.join(ROOT, 'docs', 'manuals', 'MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL.md');
const IDENTITY = path.join(ROOT, 'docs', 'manuals', 'IDENTITY-HTTP-EDGE-MANUAL.md');
const SCENARIO = path.join(ROOT, 'docs', 'manuals', 'FAMILY-ONBOARDING-OPERATOR-SCENARIO.md');

describe('EDGE-08 membership+invite redeploy residual (G8)', () => {
  it('as-is: createAuthRuntime resolves durable stores via resolveMembershipInviteStores (PGDUR-02)', () => {
    const text = fs.readFileSync(AUTH_HTTP, 'utf8');
    expect(text).to.match(/resolveMembershipInviteStores/);
    expect(text).to.match(/PostgresMembershipStore|FailClosedMembershipStore/);
    expect(text).to.match(/PGDUR-02|Soft≠Live|fail-closed/i);
  });

  it('AC-G8-03: residual manual labels durability Absent and forbids invent multi-step Pass', () => {
    const text = fs.readFileSync(RESIDUAL, 'utf8');
    expect(text).to.match(/Residual continued|Absent \/ Residual/i);
    expect(text).to.match(/do not invent|Do \*\*not\*\* invent/i);
    expect(text).to.match(/Phase 3|DDL/i);
    expect(text).to.match(/AC-G8-04|npm test/i);
  });

  it('AC-G8-03: IDENTITY + scenario warn mid-run redeploy; session carve-out', () => {
    const identity = fs.readFileSync(IDENTITY, 'utf8');
    const scenario = fs.readFileSync(SCENARIO, 'utf8');
    expect(identity).to.match(/InviteStore/);
    expect(identity).to.match(/Residual|G8/);
    expect(identity).to.match(/Bearer|SignToken/i);
    expect(scenario).to.match(/G8 Residual|redeploy wipe|MEMBERSHIP-INVITE-REDEPLOY-RESIDUAL/);
    expect(scenario).to.match(/not invent multi-step|Do \*\*not\*\* invent multi-step/i);
  });

  it('AC-G8-04 honesty: residual manual documents post-redeploy criterion without claiming Pass', () => {
    const text = fs.readFileSync(RESIDUAL, 'utf8');
    expect(text).to.match(/Post-redeploy verify criterion/i);
    expect(text).to.match(/This wave:|Residual continued/i);
    expect(text).to.match(/≠ durability Done|alone ≠ durability/i);
    expect(text).to.not.match(/AC-G8-01\/02 may Pass this wave|durability Present \(this wave\)/i);
  });
});
