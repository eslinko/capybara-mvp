'use strict';

/**
 * SBPORT-03 — @supabase/supabase-js packaging for host image.
 * Unit green ≠ REQ-09 / Phase 2 Done.
 */

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');

describe('SBPORT-03 supabase-js packaging', () => {
  it('t01: @capybara/core declares @supabase/supabase-js (AC-S01 runtime dep)', () => {
    const corePkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'packages/core/package.json'), 'utf8'),
    );
    expect(corePkg.dependencies['@supabase/supabase-js']).to.match(/^\^?2\./);
  });

  it('t01: workspace can require(@supabase/supabase-js).createClient', () => {
    const mod = require('@supabase/supabase-js');
    expect(mod.createClient).to.be.a('function');
  });

  it('t02: Dockerfile workspace install pulls core deps into image path', () => {
    const df = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
    expect(df).to.match(/COPY packages\/core\/package\.json/);
    expect(df).to.match(
      /npm install --omit=dev --workspace=@capybara\/core/,
    );
    expect(df).to.match(/@supabase\/supabase-js/);
  });

  it('t03: Dockerfile does not bake SUPABASE_* or bearer secrets (AC-S04 class)', () => {
    const df = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
    const instructions = df
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    expect(instructions).to.not.match(/ENV\s+SUPABASE_/);
    expect(instructions).to.not.match(/ENV\s+CAPY_BEARER_SECRET/);
    expect(instructions).to.not.match(/^COPY\s+\.env/m);
    expect(df).to.match(/never bake secrets|env-only/i);
  });

  it('t03: .dockerignore excludes .env surfaces', () => {
    const ignore = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
    expect(ignore).to.match(/^\.env$/m);
    expect(ignore).to.match(/^\.env\.\*$/m);
  });
});
