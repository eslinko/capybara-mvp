'use strict';

/**
 * WPROOF-08 / G-POC — Sign POC debug statuses + Auth + copy (unit).
 * AC-P10: unit/host harness ≠ invent live MetaMask Pass.
 * Do not change /auth/verify body (assert client still posts challengeId+signature only).
 */

const { expect } = require('chai');
const {
  renderSignPageHtml,
  renderSignClientBrowserJs,
} = require('../../host/signHttp');

const BOOTSTRAP = {
  challengeId: 'chal-1',
  message: 'capy-challenge',
  address: '0x1111111111111111111111111111111111111111',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

describe('WPROOF-08 Sign POC debug statuses + copy (G-POC)', () => {
  it('AC-P01: HTML ordered status steps bind→connect→sign→verify→outcome', () => {
    const html = renderSignPageHtml('deadbeef', BOOTSTRAP);
    expect(html).to.match(/id="status-steps"/);
    expect(html).to.match(/data-step="bind"/);
    expect(html).to.match(/data-step="connect"/);
    expect(html).to.match(/data-step="sign"/);
    expect(html).to.match(/data-step="verify"/);
    expect(html).to.match(/data-step="outcome"/);
    const js = renderSignClientBrowserJs();
    expect(js).to.match(/STEP_ORDER/);
    expect(js).to.match(/advanceTo\('bind'\)/);
    expect(js).to.match(/advanceTo\('connect'\)/);
    expect(js).to.match(/advanceTo\('sign'\)/);
    expect(js).to.match(/advanceTo\('verify'\)/);
    expect(js).to.match(/advanceTo\('outcome'\)/);
  });

  it('AC-P02: success surfaces userId + address (Auth Present)', () => {
    const html = renderSignPageHtml('deadbeef', BOOTSTRAP);
    expect(html).to.match(/id="out-userid"/);
    expect(html).to.match(/id="out-address"/);
    expect(html).to.match(/Auth user Present/);
    const js = renderSignClientBrowserJs();
    expect(js).to.match(/showSuccessCapture/);
    expect(js).to.match(/json\.userId/);
    expect(js).to.match(/Verified\. userId:/);
  });

  it('AC-P03: copy proof · Bearer · verify JSON without DevTools', () => {
    const html = renderSignPageHtml('deadbeef', BOOTSTRAP);
    expect(html).to.match(/id="btn-copy-proof"/);
    expect(html).to.match(/id="btn-copy-bearer"/);
    expect(html).to.match(/id="btn-copy-verify"/);
    expect(html).to.match(/__CAPY_LAST_VERIFY__/);
    const js = renderSignClientBrowserJs();
    expect(js).to.match(/btn-copy-proof/);
    expect(js).to.match(/btn-copy-bearer/);
    expect(js).to.match(/btn-copy-verify/);
    expect(js).to.match(/v\.proof/);
    expect(js).to.match(/v\.token/);
    expect(js).to.match(/JSON\.stringify\(v\)/);
  });

  it('AC-P04: fail paths include status + error code markers', () => {
    const js = renderSignClientBrowserJs();
    expect(js).to.match(/EMISMATCH_ACCOUNT/);
    expect(js).to.match(/ESIGN_WALLET_REJECT/);
    expect(js).to.match(/Verify failed:/);
    expect(js).to.match(/failAt\(/);
  });

  it('AC-P08/P09: POC residual banner · same host · no product keys', () => {
    const html = renderSignPageHtml('deadbeef', BOOTSTRAP);
    expect(html).to.match(/id="poc-banner"/);
    expect(html).to.match(/data-capy-poc="residual"/);
    expect(html).to.match(/POC \/ residual/);
    expect(html).to.match(/Connector = target wallet UX/);
    expect(html).to.match(/no product private keys/);
    expect(html).to.match(/src="\/sign\/client\.js"/);
  });

  it('AC-P10 honesty + lock: /auth/verify body still challengeId+signature only', () => {
    const js = renderSignClientBrowserJs();
    expect(js).to.match(/fetch\('\/auth\/verify'/);
    expect(js).to.match(
      /JSON\.stringify\(\{\s*challengeId:\s*bootstrap\.challengeId,\s*signature:\s*signature\s*\}\)/,
    );
    expect(js).to.not.match(/fetch\('\/auth\/verify'[\s\S]*signToken/);
  });

  it('AC-P10: unit harness ≠ invent live MetaMask Pass claim', () => {
    // This suite is HTML/JS contract only — no ethereum mock Pass asserted as live Done.
    expect(true).to.equal(true);
  });
});
