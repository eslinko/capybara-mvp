'use strict';

/**
 * MCP-01 — in-process MCP Streamable HTTP/SSE surface on the same host.
 * Path lock: `/mcp` (+ trailing slash). Foreign paths → false without writing res.
 * Enable gate: caller mounts only when CAPY_MCP_ENABLED=1 (fail-closed otherwise).
 * Soft≠Live · tools/DualAuth OOS (MCP-02+) · ≠ invent Live Pass / Live Deploy Done.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

const MCP_PATH = '/mcp';

/**
 * @param {string} pathname
 * @returns {boolean}
 */
function isMcpPath(pathname) {
  return pathname === MCP_PATH || pathname === `${MCP_PATH}/`;
}

/**
 * OP lock: enable only when exact string `1`.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined> | null | undefined} env
 * @returns {boolean}
 */
function isMcpEnabled(env) {
  return Boolean(env && String(env.CAPY_MCP_ENABLED) === '1');
}

/**
 * Minimal MCP server Soft — no tools this story (MCP-02+).
 *
 * @returns {McpServer}
 */
function createCapybaraMcpServer() {
  return new McpServer({
    name: 'capybara-host-mcp',
    version: '0.1.0',
  });
}

/**
 * tryHandle* boolean contract (etalon: capabilityProbe).
 * Path match only — enable gate is the caller's responsibility (server compose).
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {Promise<boolean>}
 */
async function tryHandleMcpRequest(req, res) {
  const pathname =
    typeof req.url === 'string' ? req.url.split('?')[0] : '';
  if (!isMcpPath(pathname)) {
    return false;
  }

  try {
    const server = createCapybaraMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      // Soft Soft≠Live: JSON response mode still Streamable HTTP class (SSE opt-in later).
      enableJsonResponse: true,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
  } catch (err) {
    if (!res.headersSent) {
      const message =
        err && err.message ? String(err.message) : 'MCP internal error';
      const body = JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message },
        id: null,
      });
      res.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
    }
  }
  return true;
}

module.exports = {
  MCP_PATH,
  isMcpPath,
  isMcpEnabled,
  createCapybaraMcpServer,
  tryHandleMcpRequest,
};
