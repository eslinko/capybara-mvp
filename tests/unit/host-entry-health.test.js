'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { expect } = require('chai');

const {
  healthPayload,
  handleHostRequest,
} = require('../../host/health');
const {
  createHostServer,
  resolveListenPort,
} = require('../../host/server');

const ROOT = path.join(__dirname, '../..');

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers || {};
    },
    end(chunk) {
      this.body = chunk == null ? '' : String(chunk);
    },
  };
}

describe('host entry + health (HOST-01)', () => {
  describe('health payload + handler (t02/t06)', () => {
    it('returns minimal { ok: true } with no env/secrets keys', () => {
      const payload = healthPayload();
      expect(payload).to.deep.equal({ ok: true });
      expect(Object.keys(payload)).to.deep.equal(['ok']);
      const blob = JSON.stringify(payload);
      expect(blob).to.not.match(/PRIVATE|SECRET|KEY|TOKEN|PASSWORD|CAPY_/i);
    });

    it('GET /health → 200 JSON ok (AC-H02)', () => {
      const res = mockRes();
      handleHostRequest({ method: 'GET', url: '/health' }, res);
      expect(res.statusCode).to.equal(200);
      expect(JSON.parse(res.body)).to.deep.equal({ ok: true });
      expect(res.body).to.not.match(/process\.env|PRIVATE_KEY|SUPABASE/i);
    });

    it('unknown path → 404 without leaking env', () => {
      const res = mockRes();
      handleHostRequest({ method: 'GET', url: '/nope' }, res);
      expect(res.statusCode).to.equal(404);
      expect(JSON.parse(res.body).ok).to.equal(false);
      expect(res.body).to.not.match(/PORT=|PRIVATE/i);
    });

    it('thin harness: createHostServer answers /health without Railway', (done) => {
      const server = createHostServer();
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        http
          .get({ hostname: '127.0.0.1', port, path: '/health' }, (res) => {
            let data = '';
            res.on('data', (c) => {
              data += c;
            });
            res.on('end', () => {
              expect(res.statusCode).to.equal(200);
              expect(JSON.parse(data)).to.deep.equal({ ok: true });
              server.close(() => done());
            });
          })
          .on('error', (err) => {
            server.close(() => done(err));
          });
      });
    });
  });

  describe('fail-closed PORT (t03)', () => {
    it('resolveListenPort throws when PORT absent', () => {
      expect(() => resolveListenPort({})).to.throw(/PORT is required/);
      expect(() => resolveListenPort({ PORT: '' })).to.throw(/PORT is required/);
      expect(() => resolveListenPort({ PORT: '  ' })).to.throw(/PORT is required/);
    });

    it('resolveListenPort accepts valid PORT', () => {
      expect(resolveListenPort({ PORT: '8080' })).to.equal(8080);
    });
  });

  describe('npm start wire + Phase 2 note (t04/t05)', () => {
    it('package.json start → host/start.js not cli/test (AC-H03)', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
      );
      expect(pkg.scripts.start).to.equal('node host/start.js');
      expect(pkg.scripts.start).to.not.match(/cli|mocha|hardhat|test/);
      expect(pkg.scripts.cli).to.match(/cli\/capybara/);
    });

    it('start.js documents Phase 2 DualAuth boundary without implementing it', () => {
      const src = fs.readFileSync(path.join(ROOT, 'host/start.js'), 'utf8');
      expect(src).to.match(/Phase 2/i);
      expect(src).to.match(/DualAuth/i);
      expect(src).to.match(/not\*?\*? implemented/i);
      expect(src).to.not.match(/createChallenge|verifyProof|supabaseAuth/i);
    });
  });

  describe('AC-H05 surface', () => {
    it('health path does not require money/pool wallet keys', () => {
      const res = mockRes();
      handleHostRequest({ method: 'GET', url: '/health' }, res);
      expect(res.statusCode).to.equal(200);
      expect(JSON.parse(res.body)).to.deep.equal({ ok: true });
      // Handler does not read wallet/env — AC-H05 for this story surface.
      const healthSrc = fs.readFileSync(
        path.join(ROOT, 'host/health.js'),
        'utf8',
      );
      expect(healthSrc).to.not.match(/process\.env|CAPYBARA_WALLET|PRIVATE_KEY/);
    });
  });
});
