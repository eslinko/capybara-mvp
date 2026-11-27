'use strict';

/**
 * MCP-01/02 — in-process MCP Streamable HTTP/SSE + DualAuth→parent→RoleGate Soft.
 * Path lock: `/mcp` (+ trailing slash). Foreign paths → false without writing res.
 * Enable gate: caller mounts only when CAPY_MCP_ENABLED=1 (fail-closed otherwise).
 * Soft≠Live · Action invoke OOS (MCP-03/04) · ≠ invent Live Pass / Phase 4 Done.
 */

const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {
  authorizeMcpToolCall,
  mapMcpToolGateError,
} = require('./mcpToolGate');
const {
  PARENT_ONLY_MCP_TOOLS,
  assertNoChildToolsRegistered,
} = require('./mcpToolRegistry');

const MCP_TOOL_ARGS_SHAPE = {
  familyId: z.string().optional(),
  clientClaimedRole: z.string().optional(),
  role: z.string().optional(),
};

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
 * Soft MCP server — parent-only gate-probe tools (AC-M05). No Action invoke.
 *
 * @param {{
 *   req?: import('http').IncomingMessage,
 *   runtime?: ReturnType<typeof import('../authHttp').createAuthRuntime>,
 * }} [opts]
 * @returns {McpServer}
 */
function createCapybaraMcpServer(opts = {}) {
  if (!assertNoChildToolsRegistered()) {
    throw new Error('MCP-02 Soft: child tools must not be registered (AC-M05)');
  }

  const server = new McpServer({
    name: 'capybara-host-mcp',
    version: '0.1.0',
  });

  const req = opts.req;
  const runtime = opts.runtime;

  for (const tool of PARENT_ONLY_MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: MCP_TOOL_ARGS_SHAPE,
      },
      async (args) => {
        // AC-M08: void chat/client role claims (never trust Skill text)
        const claimed =
          args && typeof args.clientClaimedRole === 'string'
            ? args.clientClaimedRole
            : args && typeof args.role === 'string'
              ? args.role
              : undefined;
        void claimed;

        if (!req || !runtime) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  error: 'EMCP_GATE_RUNTIME',
                  message: 'MCP tool gate requires host runtime Soft',
                }),
              },
            ],
          };
        }

        try {
          const gated = await authorizeMcpToolCall({
            req,
            runtime,
            capabilityId: tool.capabilityId,
            familyId:
              args && typeof args.familyId === 'string'
                ? args.familyId
                : undefined,
            clientClaimedRole: claimed,
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: true,
                  gated: true,
                  soft: true,
                  actionInvoke: false,
                  ...gated,
                }),
              },
            ],
          };
        } catch (err) {
          const mapped = mapMcpToolGateError(err);
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  error: mapped.code,
                  status: mapped.status,
                  message: mapped.message,
                }),
              },
            ],
          };
        }
      },
    );
  }

  return server;
}

/**
 * tryHandle* boolean contract (etalon: capabilityProbe).
 * Path match only — enable gate is the caller's responsibility (server compose).
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {ReturnType<typeof import('../authHttp').createAuthRuntime>} [runtime]
 * @returns {Promise<boolean>}
 */
async function tryHandleMcpRequest(req, res, runtime) {
  const pathname =
    typeof req.url === 'string' ? req.url.split('?')[0] : '';
  if (!isMcpPath(pathname)) {
    return false;
  }

  try {
    const server = createCapybaraMcpServer({ req, runtime });
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
