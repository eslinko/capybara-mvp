'use strict';

/**
 * EDGE-09 / G9 — live ACL profile.self honesty (unit).
 * AC-G9-04: npm/docs alone ≠ REQ-08 / Phase 2 Done.
 * Live unauth Pass evidence path Present; founder/cast may be Residual — no invent Pass.
 */

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

const ROOT = path.join(__dirname, '..', '..');
const CHECKLIST = path.join(ROOT, 'docs', 'manuals', 'LIVE-ACL-PROFILE-SELF-PROOF.md');
const UNAUTH = path.join(
  ROOT,
  'docs',
  'manuals',
  'evidence',
  'live-acl-profile-self-unauth-deny-result.md',
);
const RESIDUAL = path.join(
  ROOT,
  'docs',
  'manuals',
  'evidence',
  'live-acl-profile-self-residual.md',
);
const SCENARIO = path.join(ROOT, 'docs', 'manuals', 'FAMILY-ONBOARDING-OPERATOR-SCENARIO.md');

describe('EDGE-09 live ACL profile.self honesty (G9)', () => {
  it('AC-G9-04: checklist locks AC-I06 — npm ≠ REQ-08 / Phase 2 Done invent', () => {
    const text = fs.readFileSync(CHECKLIST, 'utf8');
    expect(text).to.match(/AC-I06|npm test/);
    expect(text).to.match(/REQ-08|Phase 2 Done/);
    expect(text).to.match(/Do \*\*not\*\* invent|not invent/i);
  });

  it('AC-G9-01 evidence path: unauth deny Pass recorded with 401 DualAuth', () => {
    const text = fs.readFileSync(UNAUTH, 'utf8');
    expect(text).to.match(/401/);
    expect(text).to.match(/EAUTH_DUAL_DENY|EAUTH_SESSION_MISSING/);
    expect(text).to.match(/\*\*PASS\*\*|PASS/);
    expect(text).to.match(/Not\*\* claimed|Not claimed|not claimed/i);
  });

  it('AC-G9-02/03 honesty: founder/cast Residual labeled — no invent Pass', () => {
    const text = fs.readFileSync(RESIDUAL, 'utf8');
    expect(text).to.match(/Residual/);
    expect(text).to.match(/AC-G9-02/);
    expect(text).to.match(/not invented|Do not invent|not invent/i);
  });

  it('scenario Step 6 points at unauth Pass + founder Residual', () => {
    const text = fs.readFileSync(SCENARIO, 'utf8');
    expect(text).to.match(/LIVE-ACL-PROFILE-SELF-PROOF/);
    expect(text).to.match(/unauth deny Pass|live-acl-profile-self-unauth-deny/);
    expect(text).to.match(/founder\/cast \*\*Residual\*\*|founder Residual/i);
  });
});
