'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('chai');

const {
  loadHostDotenv,
  CAPYBARA_DOTENV_PATH,
} = require('../../host/loadHostDotenv');

const ROOT = path.join(__dirname, '../..');
const START_SRC = fs.readFileSync(path.join(ROOT, 'host/start.js'), 'utf8');
const LOADER_SRC = fs.readFileSync(
  path.join(ROOT, 'host/loadHostDotenv.js'),
  'utf8',
);

describe('host entry dotenv load (EDGE-05)', () => {
  describe('call site + path SSOT (t01/t02)', () => {
    it('start.js require.main calls loadHostDotenv before main()', () => {
      expect(START_SRC).to.match(/require\(['"]\.\/loadHostDotenv['"]\)/);
      expect(START_SRC).to.match(/require\.main\s*===\s*module/);
      const mainBlock = START_SRC.slice(START_SRC.indexOf('require.main'));
      const loadIdx = mainBlock.indexOf('loadHostDotenv');
      const mainIdx = mainBlock.indexOf('main(');
      expect(loadIdx).to.be.gte(0);
      expect(mainIdx).to.be.gt(loadIdx);
    });

    it('loader uses CAPYBARA_DOTENV_PATH + dotenv override:false', () => {
      expect(LOADER_SRC).to.match(/CAPYBARA_DOTENV_PATH/);
      expect(LOADER_SRC).to.match(/packages\/core\/src\/env-path/);
      expect(LOADER_SRC).to.match(/require\(['"]dotenv['"]\)/);
      expect(LOADER_SRC).to.match(/override:\s*false/);
      expect(CAPYBARA_DOTENV_PATH).to.be.a('string').that.is.not.empty;
    });
  });

  describe('fill / no-overwrite / missing file (t02/t03)', () => {
    let tmpDir;
    let envFile;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capy-edge05-'));
      envFile = path.join(tmpDir, '.env');
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        /* ignore */
      }
    });

    it('fills missing keys from file into target env', () => {
      fs.writeFileSync(
        envFile,
        'EDGE05_TEST_PORT=9123\nEDGE05_TEST_SECRET=from-file\n',
        'utf8',
      );
      const env = { EDGE05_TEST_OTHER: 'keep' };
      const result = loadHostDotenv(env, { dotenvPath: envFile });
      expect(result.loaded).to.equal(true);
      expect(env.EDGE05_TEST_PORT).to.equal('9123');
      expect(env.EDGE05_TEST_SECRET).to.equal('from-file');
      expect(env.EDGE05_TEST_OTHER).to.equal('keep');
    });

    it('does not overwrite existing process.env keys (platform wins)', () => {
      fs.writeFileSync(
        envFile,
        'EDGE05_NO_OW=from-file\nEDGE05_FILL=from-file\n',
        'utf8',
      );
      const env = { EDGE05_NO_OW: 'from-platform' };
      const result = loadHostDotenv(env, { dotenvPath: envFile });
      expect(result.loaded).to.equal(true);
      expect(env.EDGE05_NO_OW).to.equal('from-platform');
      expect(env.EDGE05_FILL).to.equal('from-file');
    });

    it('absent .env does not throw (silent skip)', () => {
      const missing = path.join(tmpDir, 'no-such.env');
      const env = { KEEP: '1' };
      const result = loadHostDotenv(env, { dotenvPath: missing });
      expect(result.loaded).to.equal(false);
      expect(env).to.deep.equal({ KEEP: '1' });
    });
  });

  describe('no secret dump + honesty (t03/t04)', () => {
    it('start.js does not dump env/secrets on start path', () => {
      expect(START_SRC).to.match(/never dump env\/secrets|AC-H02|AC-I05/i);
      expect(START_SRC).to.not.match(/JSON\.stringify\(\s*process\.env/);
      expect(START_SRC).to.not.match(/console\.(log|error)\([^)]*process\.env/);
      expect(START_SRC).to.not.match(/console\.(log|error)\([^)]*dotenv/);
      expect(LOADER_SRC).to.not.match(/console\.(log|error|info|debug)/);
    });

    it('does not claim Phase 2 Done from dotenv load alone (AC-I06)', () => {
      expect(START_SRC).to.match(/≠ Phase 2 Done|not claimed/i);
      expect(START_SRC).to.not.match(/Phase 2 Done\s*[:=]\s*true/i);
    });
  });
});
