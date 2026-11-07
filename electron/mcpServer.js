/**
 * RenderQ MCP server (main process).
 *
 * Serves the Model Context Protocol over Streamable HTTP on 127.0.0.1 so agents (Claude, Codex, Cursor...) can
 * read and edit the render queue, load/save queue files, start renders and follow their progress.
 *
 * The queue lives in the renderer (Pinia store), so most tool calls are forwarded to it over IPC
 * ('mcp-request' -> 'mcp-response', see composables/useMcpBridge.ts). The renderer reports what happens in the
 * queue as events ('mcp-event'), which are numbered and kept here for wait_for_events and pushed to connected
 * agents as MCP logging / resource-updated notifications.
 *
 * Agents normally reach this server through the stdio bridge (mcpBridge.js), which finds the port and access
 * token in the discovery file written here (<userData>/mcp/server.json) and launches RenderQ when it isn't
 * running. Requests need that token (Authorization: Bearer) and a localhost Host header (DNS rebinding).
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  isInitializeRequest,
} = require('@modelcontextprotocol/sdk/types.js');
const {
  SERVER_NAME, INSTRUCTIONS, TOOLS, RESOURCES, RESOURCE_TEMPLATES, SERVER_CAPABILITIES, MAX_WAIT_SECONDS,
} = require('./mcpTools');

const DEFAULT_PORT = 47770;
const EVENT_BUFFER_SIZE = 1000;
const MAX_SESSIONS = 32;
const RENDERER_TIMEOUT_MS = 70_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Fields of add_jobs / update_job that make a render run code or another program */
const SCRIPT_SETTINGS = ['preRenderPython'];

const SUPPORTED_EXTENSIONS = ['.blend', '.c4d', '.hip', '.hiplc', '.hipnc', '.aep', '.aepx', '.nk', '.nknc', '.nkind', '.ma', '.mb'];

class ToolError extends Error {}

class McpHost {
  /**
   * @param {object} o
   * @param {string} o.version              app version
   * @param {string} o.discoveryDir         where server.json (port + token) and the bridge launcher are written
   * @param {() => Electron.BrowserWindow|null} o.getWindow
   * @param {(jobId: string) => Array<{name: string, startedAt: number, status: string, exitCode: number|null, log: string}>} o.getJobProcesses
   * @param {{command: string, args: string[]}} o.launch   how the bridge starts RenderQ
   * @param {(status: object) => void} [o.onStatus]
   * @param {(...args: any[]) => void} [o.log]
   */
  constructor(o) {
    this.version = o.version;
    this.discoveryDir = o.discoveryDir;
    this.getWindow = o.getWindow;
    this.getJobProcesses = o.getJobProcesses;
    this.launch = o.launch;
    this.onStatus = o.onStatus || (() => {});
    this.log = o.log || ((...a) => console.log('[MCP]', ...a));

    this.settings = { enabled: false, port: DEFAULT_PORT, allowScripts: false };
    this.httpServer = null;
    this.token = null;
    this.state = 'stopped';      // stopped | starting | running | error
    this.error = null;
    this.sessions = new Map();   // sessionId -> { transport, server, subscriptions: Set<string>, lastSeen }

    this.instanceId = crypto.randomBytes(4).toString('hex');
    this.events = [];
    this.seq = 0;
    this.eventWaiters = new Set();

    this.rendererReady = false;
    this.rendererWaiters = [];
    this.pending = new Map();    // request id -> { resolve, reject, timer }
    this.requestSeq = 0;

    this.resourceUpdateTimer = null;
  }

  // ================================================================ settings / lifecycle

  get discoveryFile() { return path.join(this.discoveryDir, 'server.json'); }

  get url() { return `http://127.0.0.1:${this.settings.port}/mcp`; }

  /** Apply settings saved by the renderer (Settings > MCP Server); starts, restarts or stops the server */
  async applySettings(s = {}) {
    const next = {
      enabled: !!s.mcpEnabled,
      port: Number.isInteger(s.mcpPort) && s.mcpPort > 0 && s.mcpPort < 65536 ? s.mcpPort : DEFAULT_PORT,
      allowScripts: !!s.mcpAllowScripts,
    };
    const restart = next.enabled !== this.settings.enabled || next.port !== this.settings.port || (next.enabled && this.state === 'error');
    this.settings = next;
    if (!restart) { this.writeDiscovery(); return this.getStatus(); }
    await this.stop();
    if (next.enabled) await this.start();
    else this.writeDiscovery();
    return this.getStatus();
  }

  async start() {
    this.state = 'starting';
    this.error = null;
    this.token = crypto.randomBytes(24).toString('base64url');
    const server = http.createServer((req, res) => this.handleHttp(req, res).catch((err) => {
      this.log('HTTP handler error:', err);
      if (!res.headersSent) sendJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }));
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.settings.port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
      });
    } catch (err) {
      this.state = 'error';
      this.error = err.code === 'EADDRINUSE'
        ? `Port ${this.settings.port} is already in use (another RenderQ, or another program). Choose another port.`
        : err.message;
      this.log('Failed to start:', this.error);
      this.writeDiscovery();
      this.emitStatus();
      return;
    }
    this.httpServer = server;
    this.state = 'running';
    this.log(`Listening on ${this.url}`);
    this.writeDiscovery();
    this.emitStatus();
  }

  async stop() {
    for (const [id, s] of this.sessions) {
      try { await s.transport.close(); } catch { /* closing anyway */ }
      this.sessions.delete(id);
    }
    if (this.httpServer) {
      const server = this.httpServer;
      this.httpServer = null;
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(() => resolve()));
      this.log('Stopped');
    }
    this.token = null;
    this.state = 'stopped';
    this.error = null;
    this.emitStatus();
  }

  /** App quitting: tell the bridge RenderQ is gone (it launches it again on the next tool call, if enabled) */
  shutdown() {
    this.writeDiscovery({ quitting: true });
    if (this.httpServer) {
      this.httpServer.closeAllConnections?.();
      this.httpServer.close();
      this.httpServer = null;
    }
    this.state = 'stopped';
  }

  getStatus() {
    return {
      enabled: this.settings.enabled,
      allowScripts: this.settings.allowScripts,
      state: this.state,
      error: this.error,
      port: this.settings.port,
      url: this.url,
      token: this.state === 'running' ? this.token : null,
      launcherPath: this.launcherPath(),
      sessions: [...this.sessions.values()].map((s) => {
        const client = s.server.getClientVersion();
        return { name: client?.title || client?.name || 'unknown', version: client?.version || '', lastSeen: s.lastSeen };
      }),
    };
  }

  emitStatus() {
    try { this.onStatus(this.getStatus()); } catch { /* window closed */ }
  }

  /** server.json: what the bridge needs to connect (or to launch RenderQ). Holds the token: owner-only. */
  writeDiscovery({ quitting = false } = {}) {
    try {
      fs.mkdirSync(this.discoveryDir, { recursive: true });
      const running = !quitting && this.state === 'running';
      const data = {
        name: 'RenderQ',
        version: this.version,
        pid: quitting ? null : process.pid,
        enabled: this.settings.enabled,
        running,
        port: this.settings.port,
        url: this.url,
        token: running ? this.token : null,
        error: this.error,
        launch: this.launch,
        updatedAt: new Date().toISOString(),
      };
      const tmp = `${this.discoveryFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this.discoveryFile);
      this.writeLauncher();
    } catch (err) {
      this.log('Could not write discovery file:', err.message);
    }
  }

  launcherPath() { return path.join(this.discoveryDir, 'renderq-mcp.cjs'); }

  /**
   * The script agent configs point at (run with RenderQ's own executable in Node mode). It lives in userData so
   * the path stays valid across updates and AppImage mounts, and loads the bridge from the installed app.
   */
  writeLauncher() {
    const devBridge = path.join(__dirname, 'mcpBridge.js');
    const content = `// Generated by RenderQ ${this.version}: starts the RenderQ MCP bridge (stdio) from the installed app.
// Run with RenderQ's executable and ELECTRON_RUN_AS_NODE=1 (see Settings > MCP Server in RenderQ).
const path = require('path');
const fs = require('fs');
process.env.RENDERQ_MCP_HOME = __dirname;
const candidates = [
  process.resourcesPath && path.join(process.resourcesPath, 'app', 'electron', 'mcpBridge.js'),
  ${JSON.stringify(devBridge)},
].filter(Boolean);
const bridge = candidates.find((p) => fs.existsSync(p));
if (!bridge) {
  process.stderr.write('RenderQ MCP bridge not found. Reinstall RenderQ, or reinstall the agent connection from RenderQ Settings > MCP Server.\\n');
  process.exit(1);
}
require(bridge);
`;
    const file = this.launcherPath();
    try {
      if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return;
    } catch { /* rewrite */ }
    fs.writeFileSync(file, content);
  }

  // ================================================================ renderer bridge

  /** The renderer registered its request handler (page loaded) */
  setRendererReady(ready) {
    this.rendererReady = ready;
    if (ready) {
      for (const w of this.rendererWaiters.splice(0)) w.resolve();
    } else {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new ToolError('The RenderQ window reloaded while handling the request. Try again.'));
        this.pending.delete(id);
      }
    }
  }

  waitForRenderer(timeoutMs = 45_000) {
    if (this.rendererReady) return Promise.resolve();
    // a loaded page that is ready answers 'mcp-hello' by announcing itself again
    const hello = () => {
      const win = this.getWindow();
      if (win && !win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send('mcp-hello');
    };
    hello();
    const helloTimer = setInterval(hello, 2000);
    return new Promise((resolve, reject) => {
      const waiter = { resolve: () => { clearTimeout(timer); clearInterval(helloTimer); resolve(); } };
      const timer = setTimeout(() => {
        clearInterval(helloTimer);
        this.rendererWaiters = this.rendererWaiters.filter((w) => w !== waiter);
        reject(new ToolError('RenderQ is still starting up (the window has not finished loading). Try again in a moment.'));
      }, timeoutMs);
      this.rendererWaiters.push(waiter);
    });
  }

  async requestRenderer(method, params = {}) {
    await this.waitForRenderer();
    const win = this.getWindow();
    if (!win || win.isDestroyed()) throw new ToolError('The RenderQ window is not open.');
    const id = ++this.requestSeq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ToolError(`RenderQ did not answer "${method}" in time.`));
      }, RENDERER_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      win.webContents.send('mcp-request', { id, method, params });
    });
  }

  /** 'mcp-response' from the renderer */
  handleRendererResponse({ id, ok, result, error } = {}) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    if (ok) p.resolve(result);
    else p.reject(new ToolError(error || 'Request failed'));
  }

  /** 'mcp-event' from the renderer: number it, keep it and tell the agents */
  handleRendererEvent(event) {
    if (!event || typeof event.type !== 'string') return;
    const entry = { seq: ++this.seq, time: new Date().toISOString(), ...event };
    this.events.push(entry);
    if (this.events.length > EVENT_BUFFER_SIZE) this.events.splice(0, this.events.length - EVENT_BUFFER_SIZE);

    for (const waiter of this.eventWaiters) waiter.check();

    if (this.state !== 'running' || this.sessions.size === 0) return;
    const level = entry.type === 'job_failed' || entry.type === 'job_load_failed' ? 'error'
      : (entry.type === 'queue_stopped' && entry.reason === 'error') || entry.type === 'job_missing_app' ? 'warning'
      : entry.type === 'job_progress' ? 'debug' : 'info';
    for (const [sessionId, s] of this.sessions) {
      s.server.sendLoggingMessage({ level, logger: SERVER_NAME, data: entry }, sessionId).catch(() => {});
    }
    this.scheduleResourceUpdates();
  }

  /** resources/updated for subscribed resources, at most twice a second */
  scheduleResourceUpdates() {
    if (this.resourceUpdateTimer) return;
    this.resourceUpdateTimer = setTimeout(() => {
      this.resourceUpdateTimer = null;
      for (const s of this.sessions.values()) {
        for (const uri of s.subscriptions) s.server.sendResourceUpdated({ uri }).catch(() => {});
      }
    }, 500);
  }

  // ================================================================ HTTP

  async handleHttp(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');

    // DNS rebinding: only localhost names, and no cross-site browser requests
    const host = String(req.headers.host || '').toLowerCase();
    const okHost = [`127.0.0.1:${this.settings.port}`, `localhost:${this.settings.port}`, `[::1]:${this.settings.port}`];
    if (!okHost.includes(host)) return sendJson(res, 403, { error: 'Forbidden host' });
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin)) {
      return sendJson(res, 403, { error: 'Forbidden origin' });
    }

    if (url.pathname === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, name: 'RenderQ', version: this.version, instance: this.instanceId });
    }
    if (url.pathname !== '/mcp') return sendJson(res, 404, { error: 'Not found' });

    if (!this.checkToken(req)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="RenderQ"');
      return sendJson(res, 401, { jsonrpc: '2.0', error: { code: -32001, message: 'Missing or invalid RenderQ access token' }, id: null });
    }

    const sessionId = req.headers['mcp-session-id'];
    let body;
    if (req.method === 'POST') {
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: `Parse error: ${err.message}` }, id: null });
      }
    }

    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return sendJson(res, 404, { jsonrpc: '2.0', error: { code: -32001, message: 'Session not found (RenderQ restarted?)' }, id: null });
      }
      session.lastSeen = Date.now();
      return session.transport.handleRequest(req, res, body);
    }

    if (req.method === 'POST' && isInitializeRequest(body)) {
      this.pruneSessions();
      const server = this.createSessionServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => {
          this.sessions.set(id, { transport, server, subscriptions: new Set(), lastSeen: Date.now() });
          this.log(`Agent connected (${id.slice(0, 8)})`);
          setTimeout(() => this.emitStatus(), 50); // client info is set once initialize is answered
        },
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id && this.sessions.delete(id)) {
          this.log(`Agent disconnected (${id.slice(0, 8)})`);
          this.emitStatus();
        }
      };
      await server.connect(transport);
      return transport.handleRequest(req, res, body);
    }

    return sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32000, message: 'Bad request: no valid session id' }, id: null });
  }

  checkToken(req) {
    if (!this.token) return false;
    const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
    if (!m) return false;
    const a = Buffer.from(m[1].trim());
    const b = Buffer.from(this.token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  pruneSessions() {
    if (this.sessions.size < MAX_SESSIONS) return;
    const oldest = [...this.sessions.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
    if (oldest) {
      this.sessions.delete(oldest[0]);
      oldest[1].transport.close().catch(() => {});
    }
  }

  // ================================================================ MCP

  createSessionServer() {
    const server = new Server(
      { name: SERVER_NAME, title: 'RenderQ', version: this.version },
      { capabilities: SERVER_CAPABILITIES, instructions: INSTRUCTIONS },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args = {} } = request.params;
      try {
        const result = await this.callTool(name, args, extra);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        if (!(err instanceof ToolError)) this.log(`Tool ${name} failed:`, err);
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: RESOURCE_TEMPLATES }));
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      let data;
      if (uri === 'renderq://queue/status') data = await this.callTool('get_queue_status', {});
      else if (uri === 'renderq://queue/jobs') data = await this.callTool('list_jobs', {});
      else if (uri.startsWith('renderq://jobs/')) data = await this.callTool('get_job', { jobId: decodeURIComponent(uri.slice('renderq://jobs/'.length)) });
      else throw new Error(`Unknown resource: ${uri}`);
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
    });
    server.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
      this.sessions.get(extra.sessionId)?.subscriptions.add(request.params.uri);
      return {};
    });
    server.setRequestHandler(UnsubscribeRequestSchema, async (request, extra) => {
      this.sessions.get(extra.sessionId)?.subscriptions.delete(request.params.uri);
      return {};
    });

    return server;
  }

  async callTool(name, args, extra = {}) {
    if (!TOOLS.some((t) => t.name === name)) throw new ToolError(`Unknown tool: ${name}`);
    args = args && typeof args === 'object' ? args : {};

    switch (name) {
      case 'wait_for_events':
        return this.waitForEvents(args, extra.signal);
      case 'get_render_log':
        return this.getRenderLog(args);
      case 'get_queue_status': {
        const status = await this.requestRenderer(name, args);
        return { ...status, eventCursor: this.seq };
      }
      case 'add_jobs':
        this.validateAddJobs(args);
        break;
      case 'update_job':
        this.checkScriptFields(args);
        break;
      case 'save_queue':
        if (args.filePath !== undefined) args = { ...args, filePath: this.validateSavePath(args.filePath) };
        break;
      case 'load_queue':
        this.validateExistingFile(args.filePath, ['.json'], 'Queue file');
        break;
      default:
        break;
    }
    return this.requestRenderer(name, args);
  }

  checkScriptFields(args) {
    if (this.settings.allowScripts) return;
    const blocked = [];
    if (args.appExecutablePath) blocked.push('appExecutablePath');
    for (const key of SCRIPT_SETTINGS) {
      if (args.appSettings && args.appSettings[key]) blocked.push(`appSettings.${key}`);
    }
    if (blocked.length) {
      throw new ToolError(`${blocked.join(', ')} can only be set by agents when the user turns on "Allow agents to set pre-render scripts and executable paths" in RenderQ Settings > MCP Server.`);
    }
  }

  validateAddJobs(args) {
    if (!Array.isArray(args.filePaths) || args.filePaths.length === 0) throw new ToolError('filePaths must list at least one scene file.');
    for (const p of args.filePaths) this.validateExistingFile(p, SUPPORTED_EXTENSIONS, 'Scene file');
    this.checkScriptFields(args);
  }

  validateExistingFile(p, extensions, label) {
    if (typeof p !== 'string' || !p.trim()) throw new ToolError(`${label} path is missing.`);
    if (!path.isAbsolute(p)) throw new ToolError(`${label} path must be absolute: ${p}`);
    const ext = path.extname(p).toLowerCase();
    if (!extensions.includes(ext)) throw new ToolError(`${label} has an unsupported extension "${ext}" (supported: ${extensions.join(', ')}): ${p}`);
    let stat;
    try { stat = fs.statSync(p); } catch { throw new ToolError(`${label} not found: ${p}`); }
    if (!stat.isFile()) throw new ToolError(`${label} is not a file: ${p}`);
  }

  validateSavePath(p) {
    if (typeof p !== 'string' || !p.trim()) throw new ToolError('filePath is empty.');
    if (!path.isAbsolute(p)) throw new ToolError(`filePath must be absolute: ${p}`);
    if (path.extname(p).toLowerCase() !== '.json') p = `${p}.json`;
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) throw new ToolError(`Folder does not exist: ${dir}`);
    return p;
  }

  getRenderLog({ jobId, maxChars = 8000 }) {
    if (!jobId) throw new ToolError('jobId is required.');
    const limit = Math.min(Math.max(Number(maxChars) || 8000, 500), 100_000);
    const procs = this.getJobProcesses(jobId);
    if (procs.length === 0) return { jobId, processes: [], log: '', note: 'No render processes recorded for this job in this RenderQ session.' };
    let log = procs.map((p) => `===== ${p.name} (started ${new Date(p.startedAt).toISOString()}, ${p.status}${p.exitCode != null ? `, exit code ${p.exitCode}` : ''}) =====\n${p.log}`).join('\n');
    const truncated = log.length > limit;
    if (truncated) log = log.slice(-limit);
    return {
      jobId,
      processes: procs.map((p) => ({ name: p.name, startedAt: new Date(p.startedAt).toISOString(), status: p.status, exitCode: p.exitCode })),
      truncated,
      log,
    };
  }

  async waitForEvents({ since, types, jobIds, timeoutSeconds = 30, maxEvents = 100 }, signal) {
    const timeoutMs = Math.min(Math.max(Number(timeoutSeconds) || 0, 0), MAX_WAIT_SECONDS) * 1000;
    const limit = Math.min(Math.max(Number(maxEvents) || 100, 1), 500);
    let cursor = Number.isInteger(since) ? since : this.seq;
    let cursorReset = false;
    if (cursor > this.seq) { cursor = 0; cursorReset = true; } // RenderQ restarted since the cursor was handed out
    const oldest = this.events[0]?.seq ?? this.seq + 1;
    const missed = cursor + 1 < oldest && this.events.length > 0 ? oldest - cursor - 1 : 0;

    const typeMatchers = Array.isArray(types) && types.length
      ? types.map((t) => (String(t).endsWith('*') ? (x) => x.startsWith(String(t).slice(0, -1)) : (x) => x === t))
      : null;
    const jobSet = Array.isArray(jobIds) && jobIds.length ? new Set(jobIds) : null;
    const matches = (e) => (!typeMatchers || typeMatchers.some((m) => m(e.type)))
      && (!jobSet || !e.jobId || jobSet.has(e.jobId));

    const collect = () => {
      const out = [];
      for (const e of this.events) {
        if (e.seq <= cursor || !matches(e)) continue;
        out.push(e);
        if (out.length >= limit) break;
      }
      return out;
    };

    let events = collect();
    let timedOut = false;
    if (events.length === 0 && timeoutMs > 0) {
      await new Promise((resolve) => {
        const waiter = {
          check: () => { if (collect().length) done(); },
        };
        const done = () => {
          clearTimeout(timer);
          this.eventWaiters.delete(waiter);
          signal?.removeEventListener?.('abort', done);
          resolve();
        };
        const timer = setTimeout(() => { timedOut = true; done(); }, timeoutMs);
        signal?.addEventListener?.('abort', done);
        this.eventWaiters.add(waiter);
      });
      events = collect();
    } else if (events.length === 0) {
      timedOut = true;
    }

    // Next cursor: after the last event returned, or everything seen so far when nothing matched / all returned
    const nextCursor = events.length >= limit ? events[events.length - 1].seq : this.seq;

    let queue = null;
    try {
      const s = await this.requestRenderer('get_queue_status', {});
      queue = {
        state: s.state,
        progress: s.progress,
        framesRendered: s.framesRendered,
        framesTotal: s.framesTotal,
        estimatedTimeRemaining: s.estimatedTimeRemaining,
        estimatedCompletionTime: s.estimatedCompletionTime,
        currentJob: s.currentJob ? { id: s.currentJob.id, fileName: s.currentJob.fileName, progress: s.currentJob.progress } : null,
        counts: s.counts,
      };
    } catch { /* status is a convenience */ }

    return {
      events,
      cursor: nextCursor,
      timedOut: timedOut && events.length === 0,
      ...(cursorReset ? { cursorReset: true, note: 'RenderQ restarted since that cursor; events are from the start of this session.' } : {}),
      ...(missed > 0 ? { missedEvents: missed } : {}),
      queue,
    };
  }
}

// ================================================================ helpers

function sendJson(res, status, data) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve(undefined);
      try { resolve(JSON.parse(text)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = { McpHost, DEFAULT_PORT };
