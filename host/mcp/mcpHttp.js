'use strict';

/**
 * MCP-01/02/03 — in-process MCP Streamable HTTP/SSE + DualAuth→parent→RoleGate Soft
 * + family tools 0–4 via actionInvoker (isolated env · not bare router.route).
 * Path lock: `/mcp` (+ trailing slash). Foreign paths → false without writing res.
 * Enable gate: caller mounts only when CAPY_MCP_ENABLED=1 (fail-closed otherwise).
 * Soft≠Live · ≠ invent Live Pass / Phase 4 Done.
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
const {
  FAMILY_MCP_TOOLS,
  assertNoExcludedToolsRegistered,
} = require('./toolRegistry');
const { executeFamilyAction } = require('./actionInvoker');

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
 * Soft MCP server — MCP-02 gate-probe tools (AC-M05) + MCP-03 family tools 0–4.
 *
 * @param {{
 *   req?: import('http').IncomingMessage,
 *   runtime?: ReturnType<typeof import('../authHttp').createAuthRuntime>,
 *   router?: object | null,
 *   confirmFn?: (question: string) => Promise<string>,
 *   isTty?: boolean,
 *   baseEnv?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   executeHook?: Function,
 * }} [opts]
 * @returns {McpServer}
 */
function createCapybaraMcpServer(opts = {}) {
  if (!assertNoChildToolsRegistered()) {
    throw new Error('MCP-02 Soft: child tools must not be registered (AC-M05)');
  }
  if (!assertNoExcludedToolsRegistered()) {
    throw new Error('MCP-03 Soft: 51/52 / browser mint must not be registered (AC-M04)');
  }

  const server = new McpServer({
    name: 'capybara-host-mcp',
    version: '0.1.0',
  });

  const req = opts.req;
  const runtime = opts.runtime;

  /**
   * @param {unknown} args
   * @returns {string | undefined}
   */
  function voidClaimedRole(args) {
    const claimed =
      args && typeof args.clientClaimedRole === 'string'
        ? args.clientClaimedRole
        : args && typeof args.role === 'string'
          ? args.role
          : undefined;
    void claimed;
    return claimed;
  }

  /**
   * @param {{
   *   capabilityId: string,
   *   args: Record<string, unknown> | undefined,
   *   claimed: string | undefined,
   * }} gateInput
   */
  async function runGate(gateInput) {
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
        capabilityId: gateInput.capabilityId,
        familyId:
          gateInput.args && typeof gateInput.args.familyId === 'string'
            ? gateInput.args.familyId
            : undefined,
        clientClaimedRole: gateInput.claimed,
      });
      return { ok: true, gated };
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
  }

  for (const tool of PARENT_ONLY_MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: MCP_TOOL_ARGS_SHAPE,
      },
      async (args) => {
        const claimed = voidClaimedRole(args);
        const gate = await runGate({
          capabilityId: tool.capabilityId,
          args,
          claimed,
        });
        if (gate.isError) return gate;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: true,
                gated: true,
                soft: true,
                actionInvoke: false,
                ...gate.gated,
              }),
            },
          ],
        };
      },
    );
  }

  for (const tool of FAMILY_MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args) => {
        const claimed = voidClaimedRole(args);
        const gate = await runGate({
          capabilityId: tool.capabilityId,
          args,
          claimed,
        });
        if (gate.isError) return gate;

        try {
          const invoked = await executeFamilyAction({
            toolId: tool.name,
            args: args || {},
            router: opts.router || null,
            confirmFn: opts.confirmFn,
            isTty: opts.isTty,
            baseEnv: opts.baseEnv,
            executeHook: opts.executeHook,
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: true,
                  gated: true,
                  soft: true,
                  actionInvoke: true,
                  ...gate.gated,
                  invoke: {
                    toolId: invoked.toolId,
                    action: invoked.action,
                    isolatedEnv: invoked.isolatedEnv,
                    result: invoked.result,
                  },
                }),
              },
            ],
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  error: err && err.code ? err.code : 'EMCP_INVOKE',
                  message:
                    err && err.message
                      ? String(err.message)
                      : 'MCP family action invoke failed',
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
