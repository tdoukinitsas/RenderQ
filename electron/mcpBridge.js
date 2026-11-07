/**
 * RenderQ MCP stdio bridge.
 *
 * Agents (Claude Desktop, Claude Code, Codex, Cursor, VS Code, Windsurf, Gemini CLI) start this with RenderQ's own
 * executable in Node mode (ELECTRON_RUN_AS_NODE=1), through the launcher script RenderQ writes next to its
 * discovery file (<userData>/mcp/renderq-mcp.cjs). It speaks MCP over stdio to the agent and forwards to the
 * RenderQ app's HTTP MCP server.
 *
 * It answers initialize / tools/list itself (from mcpTools.js), so starting an agent does not start RenderQ.
 * The first call that needs the app connects to it, launching RenderQ first if it isn't running (and the MCP
 * server is enabled in its settings). If RenderQ is closed later, the next call launches it again.
 *
 * stdout carries the protocol: log to stderr only.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  SetLevelRequestSchema,
  LoggingMessageNotificationSchema,
  ResourceUpdatedNotificationSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { SERVER_NAME, INSTRUCTIONS, TOOLS, RESOURCES, RESOURCE_TEMPLATES, SERVER_CAPABILITIES } = require('./mcpTools');

let VERSION = '0.0.0';
try { VERSION = require('../package.json').version; } catch { /* unknown */ }

const HOME = process.env.RENDERQ_MCP_HOME || argValue('--home');
const DISCOVERY_FILE = HOME ? path.join(HOME, 'server.json') : null;
const LAUNCH_TIMEOUT_MS = 90_000;
const CALL_TIMEOUT_MS = 120_000;

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function log(...args) {
  process.stderr.write(`[renderq-mcp] ${args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')}\n`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readDiscovery() {
  if (!DISCOVERY_FILE) return null;
  try { return JSON.parse(fs.readFileSync(DISCOVERY_FILE, 'utf8')); } catch { return null; }
}

function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

class BridgeError extends Error {}

// ================================================================ connection to the RenderQ app

let client = null;
let connecting = null;
let launchedAt = 0;
let logLevel = null;
const subscriptions = new Set();

async function getClient() {
  if (client) return client;
  if (!connecting) connecting = connect().finally(() => { connecting = null; });
  return connecting;
}

async function connect() {
  if (!DISCOVERY_FILE) throw new BridgeError('RenderQ MCP bridge was started without its launcher. Reinstall the connection from RenderQ Settings > MCP Server.');
  let d = readDiscovery();

  if (d && isAlive(d.pid)) {
    if (!d.enabled) throw new BridgeError('RenderQ is running but its MCP server is turned off. Ask the user to enable it in RenderQ: Settings > MCP Server.');
    if (d.error) throw new BridgeError(`RenderQ's MCP server could not start: ${d.error}`);
    if (!d.running || !d.token) return openClient(await waitForServer()); // still starting up
    try {
      return await openClient(d);
    } catch (err) {
      log('Could not connect to RenderQ:', err);
      const fresh = readDiscovery();
      if (fresh?.token && fresh.token !== d.token) return openClient(fresh);
      // a live process that isn't RenderQ: the app crashed and its pid was reused, so start it again
      if (await isRenderQListening(d)) throw new BridgeError(`Could not connect to RenderQ at ${d.url}: ${err.message}`);
    }
  } else if (d && d.enabled === false) {
    throw new BridgeError('The RenderQ MCP server is turned off. Ask the user to open RenderQ and enable it in Settings > MCP Server.');
  }

  await launchRenderQ(d);
  return openClient(await waitForServer(d?.pid));
}

async function isRenderQListening(d) {
  try {
    const res = await fetch(`http://127.0.0.1:${d.port}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok && (await res.json())?.name === 'RenderQ';
  } catch {
    return false;
  }
}

async function launchRenderQ(d) {
  const launch = d?.launch;
  if (!launch?.command) throw new BridgeError('RenderQ is not running and the bridge does not know how to start it. Open RenderQ once, then try again.');
  if (Date.now() - launchedAt < LAUNCH_TIMEOUT_MS) return; // already launching
  log('Starting RenderQ…');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // RenderQ itself must start as the desktop app
  delete env.RENDERQ_MCP_HOME;
  try {
    const child = spawn(launch.command, launch.args || [], { detached: true, stdio: 'ignore', env, windowsHide: false });
    child.on('error', (err) => log('Failed to start RenderQ:', err));
    child.unref();
    launchedAt = Date.now();
  } catch (err) {
    throw new BridgeError(`Failed to start RenderQ (${launch.command}): ${err.message}`);
  }
}

/** Wait for a RenderQ (other than stalePid, a dead instance's reused pid) to report its server running */
async function waitForServer(stalePid = null) {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const d = readDiscovery();
    if (d && d.pid !== stalePid && isAlive(d.pid)) {
      if (!d.enabled) throw new BridgeError('RenderQ started, but its MCP server is turned off. Ask the user to enable it in RenderQ: Settings > MCP Server.');
      if (d.error) throw new BridgeError(`RenderQ started, but its MCP server could not start: ${d.error}`);
      if (d.running && d.token) return d;
    }
    await sleep(500);
  }
  throw new BridgeError('Timed out waiting for RenderQ to start. Is it installed, and does it open normally?');
}

async function openClient(d) {
  const upstream = server.getClientVersion();
  const c = new Client(
    { name: upstream?.name ? `${upstream.name} (via renderq-mcp)` : 'renderq-mcp', title: upstream?.title, version: upstream?.version || VERSION },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(d.url), {
    requestInit: { headers: { Authorization: `Bearer ${d.token}` } },
    reconnectionOptions: { maxReconnectionDelay: 10_000, initialReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1.5, maxRetries: 2 },
  });

  c.setNotificationHandler(LoggingMessageNotificationSchema, (n) => {
    server.notification({ method: 'notifications/message', params: n.params }).catch(() => {});
  });
  c.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => {
    server.notification({ method: 'notifications/resources/updated', params: n.params }).catch(() => {});
  });
  c.onclose = () => { if (client === c) client = null; };
  c.onerror = (err) => log('Connection error:', err);

  await c.connect(transport);
  client = c;
  log(`Connected to RenderQ ${d.version || ''} at ${d.url}`);
  if (logLevel) await c.setLoggingLevel(logLevel).catch(() => {});
  for (const uri of subscriptions) await c.subscribeResource({ uri }).catch(() => {});
  return c;
}

/** Run a request against RenderQ; reconnects (or relaunches RenderQ) once if the connection dropped */
async function withClient(fn) {
  let c = await getClient();
  try {
    return await fn(c);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    log('Connection to RenderQ lost, reconnecting:', err);
    if (client === c) client = null;
    try { await c.close(); } catch { /* already closed */ }
    c = await getClient();
    return fn(c);
  }
}

function isConnectionError(err) {
  const msg = String(err?.message || err);
  return /ECONNREFUSED|ECONNRESET|fetch failed|socket hang up|Session not found|Not connected|Connection closed|HTTP 404/i.test(msg)
    || err?.code === 404;
}

// ================================================================ stdio server for the agent

const server = new Server(
  { name: SERVER_NAME, title: 'RenderQ', version: VERSION },
  { capabilities: SERVER_CAPABILITIES, instructions: INSTRUCTIONS },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await withClient((c) => c.callTool(request.params, undefined, { timeout: CALL_TIMEOUT_MS }));
  } catch (err) {
    if (!(err instanceof BridgeError)) log(`Tool ${request.params.name} failed:`, err);
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: RESOURCE_TEMPLATES }));
server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
  withClient((c) => c.readResource(request.params, { timeout: CALL_TIMEOUT_MS })));

server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  subscriptions.add(request.params.uri);
  if (client) await client.subscribeResource(request.params).catch(() => {});
  return {};
});
server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
  subscriptions.delete(request.params.uri);
  if (client) await client.unsubscribeResource(request.params).catch(() => {});
  return {};
});
server.setRequestHandler(SetLevelRequestSchema, async (request) => {
  logLevel = request.params.level;
  if (client) await client.setLoggingLevel(logLevel).catch(() => {});
  return {};
});

async function main() {
  const transport = new StdioServerTransport();
  transport.onclose = () => shutdown();
  process.stdin.on('end', () => shutdown());
  await server.connect(transport);
  log(`RenderQ MCP bridge ${VERSION} ready${DISCOVERY_FILE ? '' : ' (no discovery file configured)'}`);
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try { await client?.close(); } catch { /* exiting */ }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  log('Fatal:', err);
  process.exit(1);
});
