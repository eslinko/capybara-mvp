'use strict';

/**
 * INV-06 / G6 — Miguel co-parent env + scenario honesty (unit).
 * AC-G6-02: MIGUEL_ADDRESS in .env.example, no MIGUEL_PRIVATE_KEY.
 * AC-G6-03/04: co-parent path is invite+verify (covered by INV-04/05 harnesses) — no second bootstrap invent.
 * Live MetaMask / Railway Pass not claimed here.
 */

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

const ENV_EXAMPLE = path.join(__dirname, '..', '..', '.env.example');
const SCENARIO = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'manuals',
  'FAMILY-ONBOARDING-OPERATOR-SCENARIO.md',
);
const CHECKLIST = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'manuals',
  'CO-PARENT-MIGUEL-ENV-SCENARIO.md',
);

describe('INV-06 Miguel co-parent env + scenario (G6)', () => {
  it('AC-G6-02: .env.example documents MIGUEL_ADDRESS without private key', () => {
    const text = fs.readFileSync(ENV_EXAMPLE, 'utf8');
    expect(text).to.match(/^MIGUEL_ADDRESS=/m);
    expect(text).to.not.match(/^MIGUEL_PRIVATE_KEY=/m);
    expect(text).to.match(/NOT a private key/i);
  });

  it('AC-G6-01: scenario Step 4 order lock after kids + role=parent path', () => {
    const text = fs.readFileSync(SCENARIO, 'utf8');
    expect(text).to.match(/Step 4 — Miguel co-parent \(after children\)/);
    expect(text).to.match(/MIGUEL_ADDRESS/);
    expect(text).to.match(/role:\s*"parent"|role=parent|`role=parent`/);
    expect(text).to.match(/Present G6/);
    expect(text).to.match(/not invented|not invent|Live MetaMask/i);
  });

  it('AC-G6-03/04: soft checklist Present — equal parent · no second bootstrap · live Residual', () => {
    const text = fs.readFileSync(CHECKLIST, 'utf8');
    expect(text).to.match(/AC-G6-03/);
    expect(text).to.match(/AC-G6-04/);
    expect(text).to.match(/No second|no second bootstrap/i);
    expect(text).to.match(/Live Residual|not invent/i);
    expect(text).to.not.match(/POST \/auth\/bootstrap.*Miguel|bootstrap for co-parent.*Present Pass/i);
  });
});
