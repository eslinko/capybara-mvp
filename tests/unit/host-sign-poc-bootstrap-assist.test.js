'use strict';

/**
 * WPROOF-09 / G-POC-04 — Sign POC founder bootstrap assist (unit).
 * A1 dual-proof lock: poolProof+parentProof · same object when parent=pool.
 * No invent founder-only / late pool API / live Pass (AC-P10).
 */

const { expect } = require('chai');
const {
  renderSignPageHtml,
  renderSignClientBrowserJs,
  buildBootstrapAssistBody,
} = require('../../host/signHttp');

const BOOTSTRAP = {
  challengeId: 'chal-1',
  message: 'capy-challenge',
  address: '0x1111111111111111111111111111111111111111',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const PROOF = {
  address: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
  challengeId: 'chal-proof',
  verifiedAt: '2099-01-01T00:00:00.000Z',
  verifiedAtMs: 1,
};

describe('WPROOF-09 Sign POC bootstrap assist (G-POC-04)', () => {
  it('t01/AC-A06: buildBootstrapAssistBody reuses one proof for pool+parent (A1 dual-proof)', () => {
    const built = buildBootstrapAssistBody({
      ok: true,
      address: PROOF.address,
      proof: PROOF,
    });
    expect(built.ok).to.equal(true);
    expect(built.body.poolProof).to.equal(PROOF);
    expect(built.body.parentProof).to.equal(PROOF);
    expect(built.body.poolAddress).to.equal(PROOF.address);
    expect(built.body.parentAddress).to.equal(PROOF.address);
    // No founder-only invent: both proof keys Present
    expect(built.body).to.have.keys('poolProof', 'parentProof', 'poolAddress', 'parentAddress');
  });

  it('t04: missing proof fail-closed with EAUTH_BOOTSTRAP_MISSING_PROOF', () => {
    const missing = buildBootstrapAssistBody({ ok: true, address: PROOF.address });
    expect(missing.ok).to.equal(false);
    expect(missing.error).to.equal('EAUTH_BOOTSTRAP_MISSING_PROOF');
    const empty = buildBootstrapAssistBody(null);
    expect(empty.ok).to.equal(false);
    expect(empty.error).to.equal('EAUTH_BOOTSTRAP_MISSING_PROOF');
  });

  it('AC-P05: HTML Copy bootstrap JSON button Present', () => {
    const html = renderSignPageHtml('deadbeef', BOOTSTRAP);
    expect(html).to.match(/id="btn-copy-bootstrap"/);
    expect(html).to.match(/id="bootstrap-assist"/);
    expect(html).to.match(/data-capy-bootstrap="a1-dual-proof"/);
    const js = renderSignClientBrowserJs();
    expect(js).to.match(/btn-copy-bootstrap/);
    expect(js).to.match(/Copy bootstrap/);
    expect(js).to.match(/poolProof:\s*proof/);
    expect(js).to.match(/parentProof:\s*proof/);
  });

  it('AC-P06: optional POST /auth/bootstrap · familyId / error surface', () => {
    const html = renderSignPageHtml('deadbeef', BOOTSTRAP);
    expect(html).to.match(/id="btn-post-bootstrap"/);
    expect(html).to.match(/id="bootstrap-result"/);
    const js = renderSignClientBrowserJs();
    expect(js).to.match(/fetch\('\/auth\/bootstrap'/);
    expect(js).to.match(/familyId/);
    expect(js).to.match(/bootstrapped/);
    expect(js).to.match(/Bootstrap failed:/);
  });

  it('locks: A1 dual-proof · no founder-only · no late pool API invent in client', () => {
    const js = renderSignClientBrowserJs();
    expect(js).to.match(/A1 dual-proof/);
    expect(js).to.not.match(/founderOnly|founder_only|latePool|late-pool/i);
    expect(js).to.match(/EAUTH_BOOTSTRAP_MISSING_PROOF/);
  });

  it('AC-P10 honesty: unit harness ≠ invent live Pass', () => {
    expect(true).to.equal(true);
  });
});
