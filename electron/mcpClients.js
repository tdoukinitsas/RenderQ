/**
 * One-click install of the RenderQ MCP server into agent apps (Settings > MCP Server).
 *
 * Each client gets a stdio server entry named "renderq" that runs RenderQ's own executable in Node mode on the
 * bridge launcher (see mcpServer.js writeLauncher / mcpBridge.js), so no Node.js install is needed and the
 * bridge can start RenderQ when an agent needs it. Config files are backed up (<file>.renderq-backup) before
 * they are changed; other entries are left as they are.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ENTRY_NAME = 'renderq';

const home = os.homedir();
const platform = process.platform;

function appDataDir() {
  if (platform === 'win32') return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

/** Claude Desktop from the Microsoft Store keeps its config in the package's virtualised AppData */
function claudeDesktopConfigPaths() {
  const paths = [path.join(appDataDir(), 'Claude', 'claude_desktop_config.json')];
  if (platform === 'win32' && process.env.LOCALAPPDATA) {
    const packages = path.join(process.env.LOCALAPPDATA, 'Packages');
    try {
      for (const name of fs.readdirSync(packages)) {
        if (/^(AnthropicPBC\.)?Claude_/i.test(name)) {
          paths.push(path.join(packages, name, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
        }
      }
    } catch { /* no Store apps */ }
  }
  return paths;
}

/**
 * format: 'json' (key path into a JSON/JSONC object) or 'toml' (Codex)
 * detect: folders whose existence suggests the client is installed
 */
const CLIENTS = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    format: 'json',
    files: () => claudeDesktopConfigPaths(),
    detect: () => claudeDesktopConfigPaths().map((p) => path.dirname(p)),
    key: ['mcpServers'],
    entry: (cmd) => ({ command: cmd.command, args: cmd.args, env: cmd.env }),
    restartHint: 'Quit and reopen Claude Desktop to load RenderQ.',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    format: 'json',
    files: () => [path.join(home, '.claude.json')],
    detect: () => [path.join(home, '.claude'), path.join(home, '.claude.json')],
    key: ['mcpServers'],
    entry: (cmd) => ({ type: 'stdio', command: cmd.command, args: cmd.args, env: cmd.env }),
    restartHint: 'Start a new Claude Code session (or run /mcp) to load RenderQ.',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    description: 'Codex CLI, IDE extension and app',
    format: 'toml',
    files: () => [path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'config.toml')],
    detect: () => [process.env.CODEX_HOME || path.join(home, '.codex')],
    restartHint: 'Start a new Codex session to load RenderQ.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    format: 'json',
    files: () => [path.join(home, '.cursor', 'mcp.json')],
    detect: () => [path.join(home, '.cursor')],
    key: ['mcpServers'],
    entry: (cmd) => ({ command: cmd.command, args: cmd.args, env: cmd.env }),
    restartHint: 'RenderQ appears in Cursor Settings > MCP (toggle it on if needed).',
  },
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'GitHub Copilot agent mode',
    format: 'json',
    files: () => [path.join(appDataDir(), 'Code', 'User', 'mcp.json')],
    detect: () => [path.join(appDataDir(), 'Code', 'User')],
    key: ['servers'],
    entry: (cmd) => ({ type: 'stdio', command: cmd.command, args: cmd.args, env: cmd.env }),
    restartHint: 'Start RenderQ from the MCP Servers list in VS Code (or reload the window).',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    format: 'json',
    files: () => [path.join(home, '.codeium', 'windsurf', 'mcp_config.json')],
    detect: () => [path.join(home, '.codeium', 'windsurf')],
    key: ['mcpServers'],
    entry: (cmd) => ({ command: cmd.command, args: cmd.args, env: cmd.env }),
    restartHint: 'Refresh the MCP servers in Windsurf (Cascade > MCP) to load RenderQ.',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    format: 'json',
    files: () => [path.join(home, '.gemini', 'settings.json')],
    detect: () => [path.join(home, '.gemini')],
    key: ['mcpServers'],
    entry: (cmd) => ({ command: cmd.command, args: cmd.args, env: cmd.env, timeout: 120000 }),
    restartHint: 'Start a new Gemini CLI session to load RenderQ.',
  },
];

// ================================================================ JSON with comments (VS Code)

/** Strip // and block comments and trailing commas, leaving strings alone */
function stripJsonc(text) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 2; continue; }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; i++; continue; }
    if (ch === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (ch === '/' && next === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    out += ch;
    i++;
  }
  return stripTrailingCommas(out);
}

function stripTrailingCommas(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') { out += text[++i] ?? ''; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(stripJsonc(text));
    } catch (err) {
      throw new Error(`Could not read ${file} (${err.message}). Fix the file or add RenderQ by hand with "Copy config".`);
    }
  }
}

function writeFileSafely(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.renderq-backup`);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function getAt(obj, keys) {
  return keys.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

// ================================================================ Codex TOML

const TOML_TABLE = /^\s*\[\s*mcp_servers\.(?:"renderq"|'renderq'|renderq)\s*(?:\.[^\]]*)?\]\s*(#.*)?$/;
const TOML_ANY_TABLE = /^\s*\[/;

/** Remove [mcp_servers.renderq] (and its sub-tables) from a TOML document */
function removeTomlEntry(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (TOML_TABLE.test(line)) { skipping = true; continue; }
    if (skipping && TOML_ANY_TABLE.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function tomlEntry(cmd) {
  const str = (s) => JSON.stringify(s); // JSON strings are valid TOML basic strings
  const env = Object.entries(cmd.env).map(([k, v]) => `${k} = ${str(v)}`).join(', ');
  return [
    `[mcp_servers.${ENTRY_NAME}]`,
    `command = ${str(cmd.command)}`,
    `args = [${cmd.args.map(str).join(', ')}]`,
    `env = { ${env} }`,
    'startup_timeout_sec = 30',
    'tool_timeout_sec = 120',
    '',
  ].join('\n');
}

function readTomlEntry(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => TOML_TABLE.test(l));
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length && !TOML_ANY_TABLE.test(lines[i]); i++) body.push(lines[i]);
  const block = body.join('\n');
  const command = /^\s*command\s*=\s*(".*")\s*$/m.exec(block);
  const args = /^\s*args\s*=\s*(\[.*\])\s*$/m.exec(block);
  try {
    return { command: command ? JSON.parse(command[1]) : null, args: args ? JSON.parse(args[1]) : null };
  } catch {
    return { command: null, args: null };
  }
}

// ================================================================ API

function sameCommand(entry, cmd) {
  return !!entry && entry.command === cmd.command && JSON.stringify(entry.args || []) === JSON.stringify(cmd.args);
}

/** Installed state of every client: 'installed' | 'outdated' (points elsewhere) | 'not-installed' */
function getClientsStatus(cmd) {
  return CLIENTS.map((c) => {
    const detected = c.detect().some((p) => fs.existsSync(p));
    let state = 'not-installed';
    let error = null;
    let configPath = c.files()[0];
    for (const file of c.files()) {
      if (!fs.existsSync(file)) continue;
      try {
        const entry = c.format === 'toml'
          ? readTomlEntry(fs.readFileSync(file, 'utf8'))
          : getAt(readJsonFile(file), [...c.key, ENTRY_NAME]);
        if (entry) {
          configPath = file;
          state = sameCommand(entry, cmd) ? 'installed' : 'outdated';
          if (state === 'installed') break;
        }
      } catch (err) {
        error = err.message;
      }
    }
    return { id: c.id, name: c.name, description: c.description || '', detected, state, configPath, error, restartHint: c.restartHint };
  });
}

/** Files to write for a client: the ones that exist (Claude Desktop may have two), else the default */
function targetFiles(c) {
  const files = c.files();
  const existing = files.filter((f) => fs.existsSync(f) || fs.existsSync(path.dirname(f)));
  return existing.length ? existing : [files[0]];
}

function installClient(id, cmd) {
  const c = CLIENTS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown client: ${id}`);
  const written = [];
  for (const file of targetFiles(c)) {
    if (c.format === 'toml') {
      const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const base = removeTomlEntry(text).replace(/\s*$/, '');
      writeFileSafely(file, `${base ? `${base}\n\n` : ''}${tomlEntry(cmd)}`);
    } else {
      const data = readJsonFile(file);
      let node = data;
      for (const k of c.key) {
        if (!node[k] || typeof node[k] !== 'object') node[k] = {};
        node = node[k];
      }
      node[ENTRY_NAME] = c.entry(cmd);
      writeFileSafely(file, `${JSON.stringify(data, null, 2)}\n`);
    }
    written.push(file);
  }
  return { id, files: written, restartHint: c.restartHint };
}

function uninstallClient(id) {
  const c = CLIENTS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown client: ${id}`);
  const changed = [];
  for (const file of c.files()) {
    if (!fs.existsSync(file)) continue;
    if (c.format === 'toml') {
      const text = fs.readFileSync(file, 'utf8');
      if (!readTomlEntry(text)) continue;
      writeFileSafely(file, `${removeTomlEntry(text).replace(/\s*$/, '')}\n`);
    } else {
      const data = readJsonFile(file);
      const parent = getAt(data, c.key);
      if (!parent || !(ENTRY_NAME in parent)) continue;
      delete parent[ENTRY_NAME];
      writeFileSafely(file, `${JSON.stringify(data, null, 2)}\n`);
    }
    changed.push(file);
  }
  return { id, files: changed };
}

/** The config snippet for a client, to paste by hand */
function getClientSnippet(id, cmd) {
  const c = CLIENTS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown client: ${id}`);
  if (c.format === 'toml') return { language: 'toml', file: c.files()[0], text: tomlEntry(cmd) };
  const data = {};
  let node = data;
  for (const k of c.key) node = node[k] = {};
  node[ENTRY_NAME] = c.entry(cmd);
  return { language: 'json', file: c.files()[0], text: JSON.stringify(data, null, 2) };
}

module.exports = { CLIENTS, getClientsStatus, installClient, uninstallClient, getClientSnippet, stripJsonc, removeTomlEntry, tomlEntry, readTomlEntry };
