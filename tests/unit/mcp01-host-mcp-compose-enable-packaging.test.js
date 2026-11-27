'use strict';

/**
 * MCP-01 Soft≠Live — enable on/off + /health coexistence + path surface.
 * Soft unit ≠ invent Live Pass / Live Deploy Done (MCP-07) / Phase 4 Done.
 */

const { expect } = require('chai');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createHostServer } = require('../../host/server');
const {
  MCP_PATH,
  isMcpPath,
  isMcpEnabled,
  tryHandleMcpRequest,
} = require('../../host/mcp/mcpHttp');

const ROOT = path.join(__dirname, '../..');

function listenEphemeral(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
    server.on('error', reject);
  });
}

function requestJson(port, { method, path: reqPath, body, headers }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers: {
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                Accept: 'application/json, text/event-stream',
              }
            : { Accept: 'application/json' }),
          ...(headers || {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const INITIALIZE_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mcp01-soft-unit', version: '0.0.0' },
  },
};

describe('MCP-01 host MCP compose enable packaging Soft≠Live', () => {
  it('isMcpPath matches /mcp (+ slash) only', () => {
    expect(isMcpPath('/mcp')).to.equal(true);
    expect(isMcpPath('/mcp/')).to.equal(true);
    expect(isMcpPath('/health')).to.equal(false);
    expect(isMcpPath('/mcp/extra')).to.equal(false);
    expect(MCP_PATH).to.equal('/mcp');
  });

  it('isMcpEnabled only when CAPY_MCP_ENABLED=1', () => {
    expect(isMcpEnabled({ CAPY_MCP_ENABLED: '1' })).to.equal(true);
    expect(isMcpEnabled({})).to.equal(false);
    expect(isMcpEnabled({ CAPY_MCP_ENABLED: '0' })).to.equal(false);
    expect(isMcpEnabled({ CAPY_MCP_ENABLED: 'true' })).to.equal(false);
    expect(isMcpEnabled(null)).to.equal(false);
  });

  it('tryHandleMcpRequest foreign path → false without writing res', async () => {
    let wrote = false;
    const res = {
      writeHead() {
        wrote = true;
      },
      end() {
        wrote = true;
      },
      headersSent: false,
      on() {},
    };
    const handled = await tryHandleMcpRequest(
      { method: 'POST', url: '/health' },
      res,
    );
    expect(handled).to.equal(false);
    expect(wrote).to.equal(false);
  });

  it('enable absent: /mcp fail-closed (not mounted) → 404; /health 200', async () => {
    const server = createHostServer({ env: {} });
    const port = await listenEphemeral(server);
    try {
      const mcp = await requestJson(port, {
        method: 'POST',
        path: '/mcp',
        body: INITIALIZE_BODY,
      });
      expect(mcp.status).to.equal(404);
      expect(mcp.json).to.deep.include({ ok: false, error: 'not_found' });

      const health = await requestJson(port, {
        method: 'GET',
        path: '/health',
      });
      expect(health.status).to.equal(200);
      expect(health.json).to.deep.equal({ ok: true });
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('enable=1: /mcp serves MCP initialize Soft; /health still open', async () => {
    const server = createHostServer({
      env: { CAPY_MCP_ENABLED: '1' },
    });
    const port = await listenEphemeral(server);
    try {
      const mcp = await requestJson(port, {
        method: 'POST',
        path: '/mcp',
        body: INITIALIZE_BODY,
      });
      expect(mcp.status).to.be.oneOf([200, 202]);
      expect(mcp.json).to.be.an('object');
      expect(mcp.json).to.have.property('jsonrpc', '2.0');
      expect(mcp.json).to.have.property('id', 1);
      expect(mcp.json).to.have.property('result');
      expect(mcp.json.result).to.have.property('serverInfo');
      expect(mcp.json.result.serverInfo).to.include({
        name: 'capybara-host-mcp',
      });

      const health = await requestJson(port, {
        method: 'GET',
        path: '/health',
      });
      expect(health.status).to.equal(200);
      expect(health.json).to.deep.equal({ ok: true });
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('packaging Soft: core package.json + Dockerfile mention MCP SDK', () => {
    const corePkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'packages/core/package.json'), 'utf8'),
    );
    expect(corePkg.dependencies).to.have.property(
      '@modelcontextprotocol/sdk',
    );
    const dockerfile = fs.readFileSync(
      path.join(ROOT, 'Dockerfile'),
      'utf8',
    );
    expect(dockerfile).to.include('@modelcontextprotocol/sdk');
    expect(dockerfile).to.include('npm install --omit=dev --workspace=@capybara/core');
  });
});
