'use strict';

/**
 * MCP-06 Soft≠Live — thin Skill pack + Bearer; keys never (AC-M07/M08).
 * Soft unit ≠ invent Live Pass / Phase 4 Done / deep Skill store.
 */

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

const PACK_ROOT = path.resolve(
  __dirname,
  '../../docs/manuals/mcp-thin-skill',
);

const REQUIRED_FILES = [
  'README.md',
  'INSTRUCTIONS.md',
  'mcp-client.config.json',
  'KEYS-NEVER-CHECKLIST.md',
  'DEEP-SKILL-DEFERRED.md',
];

/** Soft AC-M07 — forbidden private-key env / payload names in pack text. */
const FORBIDDEN_KEY_PATTERNS = [
  /PARENT_PRIVATE_KEY/i,
  /TRISTAN_PRIVATE_KEY/i,
  /BASTIAN_PRIVATE_KEY/i,
  /DEPLOYER_PRIVATE_KEY/i,
  /CHILD_PRIVATE_KEY/i,
  /"privateKey"\s*:/i,
  /'privateKey'\s*:/i,
];

function listPackFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...listPackFiles(full));
    else out.push(full);
  }
  return out;
}

describe('MCP-06 thin Skill Bearer Soft≠Live', () => {
  it('t01 Soft: pack structure Present · instructions + mcp client config', () => {
    expect(fs.existsSync(PACK_ROOT)).to.equal(true);
    for (const f of REQUIRED_FILES) {
      expect(fs.existsSync(path.join(PACK_ROOT, f)), f).to.equal(true);
    }
    const cfg = JSON.parse(
      fs.readFileSync(path.join(PACK_ROOT, 'mcp-client.config.json'), 'utf8'),
    );
    const server = cfg.mcpServers && cfg.mcpServers['capybara-family'];
    expect(server).to.be.an('object');
    expect(String(server.url)).to.match(/\/mcp$/);
    expect(String(server.path_lock)).to.equal('/mcp');
    expect(String(server.headers.Authorization)).to.match(/Bearer/);
    expect(server.secrets.CAPY_MCP_BEARER_SECRET.kind).to.equal('bearer');
  });

  it('t02 Soft: Bearer UX + /mcp URL documented Soft', () => {
    const instructions = fs.readFileSync(
      path.join(PACK_ROOT, 'INSTRUCTIONS.md'),
      'utf8',
    );
    expect(instructions).to.match(/\/auth\/challenge/);
    expect(instructions).to.match(/\/auth\/verify/);
    expect(instructions).to.match(/\/mcp/);
    expect(instructions).to.match(/Bearer/i);
    expect(instructions).to.match(/RoleGate/i);
    expect(instructions).to.match(/cannot grant role/i);
  });

  it('t03 Soft: keys-never checklist · pack has no private key payloads Soft', () => {
    const checklist = fs.readFileSync(
      path.join(PACK_ROOT, 'KEYS-NEVER-CHECKLIST.md'),
      'utf8',
    );
    expect(checklist).to.match(/AC-M07/);
    expect(checklist).to.match(/PARENT_PRIVATE_KEY/);

    const files = listPackFiles(PACK_ROOT);
    expect(files.length).to.be.above(3);

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      // Soft: checklist may *mention* forbidden names as deny list Soft
      if (path.basename(file) === 'KEYS-NEVER-CHECKLIST.md') continue;
      if (path.basename(file) === 'README.md') continue;
      if (path.basename(file) === 'INSTRUCTIONS.md') {
        // Soft: may warn "Never … PARENT_PRIVATE_KEY" Soft — require deny wording
        expect(text).to.match(/Never ask for or accept private keys/i);
        continue;
      }
      for (const re of FORBIDDEN_KEY_PATTERNS) {
        expect(text, `${path.basename(file)} matches ${re}`).to.not.match(re);
      }
    }

    const cfgText = fs.readFileSync(
      path.join(PACK_ROOT, 'mcp-client.config.json'),
      'utf8',
    );
    expect(cfgText).to.not.match(/0x[a-fA-F0-9]{64}/);
    expect(cfgText).to.match(/CAPY_MCP_BEARER_SECRET/);
  });

  it('t04 Soft: deep Skill deferred honesty Soft≠Live', () => {
    const deferred = fs.readFileSync(
      path.join(PACK_ROOT, 'DEEP-SKILL-DEFERRED.md'),
      'utf8',
    );
    expect(deferred).to.match(/deferred/i);
    expect(deferred).to.match(/sibling REQ/i);
    expect(deferred).to.match(/Soft≠Live|Soft≠Live/i);
    expect(deferred).to.match(/Phase 4 Done|MCP-07/);
    expect(deferred).to.match(/Not blocking/i);
  });
});
