/**
 * Nuke render runner (every licence: Nuke, NukeX, Indie, Non-commercial).
 *
 * A job runs renderq_nuke.py in Nuke's terminal mode (-t) instead of `nuke -x`:
 *   - `-x` gives up on any error while loading the comp (a gizmo knob expression, say), where the GUI
 *     carries on; the helper loads like the GUI and reports those errors instead,
 *   - the helper renders only the chosen Write nodes, skips frames already on disk and writes a small
 *     JPEG of every finished frame for the preview,
 *   - Indie allows only 10 Python Node objects per session: the helper does everything through TCL.
 * The licence mode comes from the settings, or is found automatically: .nkind -> Indie, .nknc -> NC, and
 * for .nk the modes are tried in turn until one does not fail with a licence error.
 * Some nodes only load in the Nuke GUI (an Indie .gzind gizmo Indie refuses in terminal mode, a gizmo
 * whose folder only menu.py adds to the plugin path): the probe runs in terminal mode and, when it could
 * not create a node, the job renders in GUI mode with Qt's offscreen platform, so no window opens.
 *
 * Nothing in here depends on Electron; main.js injects process spawning, IPC sending and previews.
 */
const fs = require('fs');
const path = require('path');
const { parseFrameRanges, contiguousRuns } = require('./blenderRender');

const HELPER_SOURCE = path.join(__dirname, 'renderq_nuke.py');
const MAX_RETRIES = 2;   // per process, only after it reached the "ready" line

/** Licence modes: settings value -> Nuke flags. */
const LICENSE_FLAGS = {
  nuke: [],
  'nuke-interactive': ['-i'],   // a Nuke interactive licence (no render licence)
  nukex: ['--nukex'],
  'nukex-interactive': ['--nukex', '-i'],
  indie: ['--indie'],
  nc: ['--nc'],
};
const LICENSE_LABELS = {
  nuke: 'Nuke', 'nuke-interactive': 'Nuke (interactive licence)', nukex: 'NukeX',
  'nukex-interactive': 'NukeX (interactive licence)', indie: 'Nuke Indie', nc: 'Nuke Non-commercial',
};
const LICENSE_ERROR = /noLicenseFound|No valid licen[cs]es?|No licen[cs]e (?:was )?found|licen[cs]e (?:is )?(?:not available|unavailable|expired)|Unable to (?:obtain|find|get) (?:a |the )?(?:\w+ )?licen[cs]e|Failed to (?:get|obtain|check ?out) (?:a |the )?(?:\w+ )?licen[cs]e|licen[cs]e check ?out failed/i;

// Nuke could not create a node while loading the comp (missing gizmo / plug-in, or one it refuses here).
const UNLOADABLE = /unknown command|unlicensed plug-in|Error loading file .*\.(?:gizmo|gzind|gznc|nk|nkind)\b/i;
// A hidden GUI-mode Nuke that has not started the helper by then is stuck (e.g. on an invisible dialog).
const GUI_READY_TIMEOUT_MS = 10 * 60 * 1000;

// Licence mode that worked, per Nuke executable and file type, for this app session.
const detectedLicense = new Map();

/** Which licence modes to try for a comp, in order. */
function licenseCandidates(sceneFile, mode) {
  if (mode && mode !== 'auto' && LICENSE_FLAGS[mode]) return [mode];
  const ext = path.extname(sceneFile || '').toLowerCase();
  if (ext === '.nkind') return ['indie'];   // only Indie opens .nkind
  if (ext === '.nknc') return ['nc'];        // only Non-commercial opens .nknc
  return ['nuke', 'nuke-interactive', 'nukex', 'nukex-interactive', 'nc'];
}

const normPath = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();

class NukeRenderJob {
  /**
   * @param {object} o
   * @param {string} o.appPath       Nuke executable
   * @param {string} o.sceneFile     .nk / .nkind / .nknc
   * @param {string} o.frameRanges   e.g. "1-100, 150"
   * @param {string} o.jobId
   * @param {object} o.settings      { licenseMode, gpu, threads, cacheSize, writes[], skipExisting,
   *                                  ignoreLoadErrors, chunkSize, preRenderPython, previewWidth }
   * @param {boolean} o.resume       continue a paused job (keeps this session's finished frames)
   * @param {object} o.deps          { spawn(cmd,args,opts,meta), send(channel,data), kill(proc),
   *                                  makeTempDir(prefix), removeDir(dir), previewDir?(jobId,{reset}),
   *                                  readPreview?(path), setCurrentProcess?(proc|null), log?(...args) }
   */
  constructor(o) {
    this.appPath = o.appPath;
    this.sceneFile = o.sceneFile;
    this.jobId = o.jobId;
    this.settings = o.settings || {};
    this.frames = parseFrameRanges(o.frameRanges);
    this.resume = !!o.resume;
    this.deps = o.deps;
    this.state = 'idle';   // running | paused | stopped | done | error
    this.proc = null;
  }

  // ---------------------------------------------------------------- control
  pause() { this._interrupt('paused'); }
  stop() { this._interrupt('stopped'); }

  _interrupt(state) {
    if (this.state !== 'running') return;
    this.state = state;
    if (this.proc) this.deps.kill(this.proc);
  }

  // ---------------------------------------------------------------- helpers
  _send(channel, data) { this.deps.send(channel, { jobId: this.jobId, ...data }); }
  _log(...a) { (this.deps.log || console.log)('[Nuke Render]', ...a); }

  _config(extra) {
    const s = this.settings;
    return {
      script: this.sceneFile,
      writes: Array.isArray(s.writes) ? s.writes : [],
      skipExisting: s.skipExisting !== false,
      ignoreLoadErrors: s.ignoreLoadErrors !== false,
      preRenderPython: s.preRenderPython || '',
      ...extra,
    };
  }

  _writeConfig(name, cfg) {
    const p = path.join(this.tempDir, name);
    fs.writeFileSync(p, JSON.stringify(cfg), 'utf8');
    return p;
  }

  /**
   * Nuke command line. Terminal mode: `-t helper config`. GUI mode (comps with nodes that only load in
   * the GUI): `-q helper` with the config in RENDERQ_NUKE_CONFIG and Qt's offscreen platform, so no window
   * opens (GUI mode would read extra arguments as files to open).
   */
  _launch(license, cfgPath, gui = this.gui) {
    const s = this.settings;
    const args = [...LICENSE_FLAGS[license]];
    if (s.gpu !== false) args.push('--gpu');
    if (s.threads > 0) args.push('-m', String(s.threads));
    if (s.cacheSize) args.push('-c', String(s.cacheSize));
    if (!gui) return { args: [...args, '-t', this.helperPath, cfgPath], env: null };
    return {
      args: [...args, '-q', this.helperPath],
      env: { RENDERQ_NUKE_CONFIG: cfgPath, QT_QPA_PLATFORM: 'offscreen' },
    };
  }

  /**
   * Run one Nuke process; resolves { code, err, tail, ready, licenseError, unloadable, timedOut } when it
   * exits. `unloadable` lists load errors of nodes Nuke could not create (missing / refused gizmos).
   * readyTimeoutMs: kill the process when the helper has not started by then (a hidden GUI dialog).
   */
  _runProcess({ args, env }, name, onLine, { readyTimeoutMs = 0 } = {}) {
    return new Promise((resolve) => {
      const proc = this.deps.spawn(this.appPath, args,
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: env ? { ...process.env, ...env } : process.env },
        { name: `${name}:${this.jobId}` });
      this.proc = proc;
      this.deps.setCurrentProcess?.(proc);
      const tail = [];
      const unloadable = [];
      let ready = false;
      let licenseError = null;
      let timedOut = false;
      const timer = readyTimeoutMs > 0 ? setTimeout(() => { timedOut = true; this.deps.kill(proc); }, readyTimeoutMs) : null;
      const buffer = { stdout: '', stderr: '' };
      const handle = (raw) => {
        const at = raw.indexOf('RENDERQ');   // Nuke's progress dots (".8") share the line with the helper's output
        const line = at > 0 ? raw.slice(at) : raw;
        tail.push(line);
        if (tail.length > 60) tail.shift();
        if (/^RENDERQ(: ready|_PROBE:)/.test(line)) { ready = true; if (timer) clearTimeout(timer); }
        if (!ready && !licenseError && LICENSE_ERROR.test(line)) licenseError = line.trim();
        if (!ready && !line.startsWith('RENDERQ') && UNLOADABLE.test(line)) {
          unloadable.push(line.replace(/^\[[\d:.]+\]\s*ERROR:\s*/, '').trim());
        }
        onLine?.(line);
      };
      const feed = (stream, chunk) => {
        const text = chunk.toString();
        if (!this.quiet) this._send('render-output', { output: text });
        buffer[stream] += text;
        const lines = buffer[stream].split(/\r?\n/);
        buffer[stream] = lines.pop();
        lines.forEach(handle);
      };
      proc.stdout.on('data', (d) => feed('stdout', d));
      proc.stderr.on('data', (d) => feed('stderr', d));
      let settled = false;
      const done = (code, err) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        for (const stream of ['stdout', 'stderr']) if (buffer[stream]) handle(buffer[stream]);
        this.proc = null;
        this.deps.setCurrentProcess?.(null);
        resolve({ code, err, tail, ready, licenseError, unloadable: [...new Set(unloadable)], timedOut });
      };
      proc.on('close', (code) => done(code));
      proc.on('error', (err) => done(-1, err));
    });
  }

  _failure(result, what) {
    if (result.timedOut) {
      return `${what}: Nuke's GUI mode did not start within ${GUI_READY_TIMEOUT_MS / 60000} minutes ` +
        '(it runs without a window, so a dialog may have been waiting). Open the comp in Nuke once, or set ' +
        'Settings > Nuke > Nuke mode to "Terminal".';
    }
    const why = result.err ? result.err.message : `exit code ${result.code}`;
    const lines = result.tail.filter((l) => !/Illegal version number change/.test(l));
    const renderq = lines.filter((l) => l.startsWith('RENDERQ_ERROR')).map((l) => l.slice('RENDERQ_ERROR'.length).trim());
    const missing = lines.filter((l) => !l.startsWith('RENDERQ') && /unknown command|unlicensed plug-in|Error loading file/i.test(l))
      .map((l) => l.replace(/^\[[\d:.]+\]\s*ERROR:\s*/, '').trim())
      .filter((l) => !renderq.some((r) => r.includes(l)));
    let detail = [...new Set([...renderq, ...missing])].slice(-6).join('\n') ||
      lines.filter((l) => /error|traceback|exception/i.test(l)).slice(-4).join('\n') || lines.slice(-4).join('\n');
    if (/unknown command|unlicensed plug-in/i.test(detail)) {
      detail += this.gui
        ? '\nA node of the comp could not be created even in Nuke\'s GUI mode: a plug-in or gizmo is missing or not licensed.'
        : '\nA node of the comp could not be created in Nuke\'s terminal mode. Set Settings > Nuke > Nuke mode to ' +
          '"Auto" or "GUI" to render such comps in the (hidden) Nuke GUI.';
    }
    return `${what} (${why})${detail ? `:\n${detail}` : ''}`;
  }

  // ---------------------------------------------------------------- job
  async run() {
    this.state = 'running';
    this.tempDir = this.deps.makeTempDir(`renderq_nuke_${this.jobId || 'job'}`);
    this.helperPath = path.join(this.tempDir, 'renderq_nuke.py');
    fs.writeFileSync(this.helperPath, fs.readFileSync(HELPER_SOURCE));   // Nuke needs a real file (not asar)
    this.previewDir = this.deps.previewDir?.(this.jobId, { reset: !this.resume }) || null;
    this.startedAt = Date.now();
    this.rendered = 0;
    try {
      if (this.frames.length === 0) throw new Error('No frames to render');
      if (!this.appPath || !fs.existsSync(this.appPath)) {
        throw new Error(`Nuke not found at "${this.appPath || '(not set)'}" - choose the Nuke executable in Settings`);
      }
      const total = this.frames.length;
      this._send('render-progress', { phase: 'probe', currentFrameIndex: 0, totalFrames: total, doneCount: 0 });

      // 1. probe: licence, Write nodes, frames already on disk
      const probe = await this._probe();
      if (this.state !== 'running') return this._finishInterrupted();
      const writes = this._selectedWrites(probe.writes);
      const images = writes.filter((w) => !w.movie);
      const skip = this.settings.skipExisting !== false;
      const done = new Set();
      if (skip && images.length && !writes.some((w) => w.movie)) {
        for (const f of this.frames) {
          // a frame is finished when every chosen Write that renders it has its file
          const relevant = images.filter((w) => !w.useLimit || (f >= w.first && f <= w.last));
          if (relevant.length && relevant.every((w) => w.hasFrameNumber && w.done.includes(f))) done.add(f);
        }
      }
      for (const w of images.filter((w) => !w.hasFrameNumber)) {
        this._log(`warning: Write "${w.name}" has no frame number in its file name (${w.file}) - every frame overwrites the same file`);
      }

      // 2. plan: Nuke loads the comp once per process, so by default one process does every missing frame
      const missing = this.frames.filter((f) => !done.has(f));
      const chunkSize = parseInt(this.settings.chunkSize, 10) || 0;
      const queue = [];
      for (let i = 0; i < missing.length; i += chunkSize || missing.length || 1) {
        queue.push({ frames: missing.slice(i, i + (chunkSize || missing.length)), retries: 0 });
      }
      let doneCount = total - missing.length;
      const skipped = doneCount;
      this._log(`${total} frame(s) of ${writes.map((w) => w.name).join(', ')}: ${skipped} already rendered, ` +
        `${queue.length} Nuke process(es) to run (${LICENSE_LABELS[this.license]}${this.gui ? ", hidden GUI mode" : ""})`);
      this._send('render-progress', { phase: 'render', currentFrameIndex: doneCount, totalFrames: total, doneCount, skippedCount: skipped,
        nukeGuiMode: !!this.gui, nukeGuiReason: this.guiReason || null });

      // 3. render
      this.finished = new Set();
      while (queue.length) {
        if (this.state !== 'running') return this._finishInterrupted();
        const task = queue.shift();
        const result = await this._renderTask(task, total, () => doneCount, (n) => { doneCount = n; });
        if (this.state !== 'running') return this._finishInterrupted();
        if (result.code === 0) continue;

        const left = task.frames.filter((f) => !this.finished.has(f));
        const failed = result.tail.some((l) => l.startsWith('RENDERQ_ERROR'));   // a frame failed: retrying won't help
        if (result.ready && !failed && task.retries < MAX_RETRIES && left.length) {
          this._log(`Nuke exited (${result.err ? result.err.message : `exit code ${result.code}`}) - retrying ` +
            `${left.length} frame(s) from ${left[0]} (attempt ${task.retries + 2})`);
          queue.unshift({ frames: left, retries: task.retries + 1 });
          continue;
        }
        throw new Error(this._failure(result, 'Nuke render failed'));
      }

      this.state = 'done';
      this._send('render-complete', {});
      return { success: true };
    } catch (error) {
      if (this.state !== 'running') return this._finishInterrupted();
      this.state = 'error';
      this._send('render-error', { error: error.message });
      return { success: false, error: error.message };
    } finally {
      this.deps.removeDir(this.tempDir);
    }
  }

  /** Describe the comp for the queue (frame range, format, Write nodes) with the licence that opens it. */
  async info() {
    this.state = 'running';
    this.quiet = true;   // no render-output: no job is rendering this
    this.tempDir = this.deps.makeTempDir('renderq_nuke_info');
    this.helperPath = path.join(this.tempDir, 'renderq_nuke.py');
    fs.writeFileSync(this.helperPath, fs.readFileSync(HELPER_SOURCE));
    try {
      if (!this.appPath || !fs.existsSync(this.appPath)) {
        throw new Error(`Nuke not found at "${this.appPath || '(not set)'}" - choose the Nuke executable in Settings`);
      }
      const report = await this._probe();
      return { ...report, license: this.license, licenseLabel: LICENSE_LABELS[this.license], gui: !!this.gui, guiReason: this.guiReason };
    } finally {
      this.state = 'idle';
      this.deps.removeDir(this.tempDir);
    }
  }

  _finishInterrupted() {
    if (this.state === 'paused') this._send('render-paused', {});
    return { success: false, [this.state]: true };
  }

  _selectedWrites(all) {
    const names = Array.isArray(this.settings.writes) ? this.settings.writes : [];
    if (names.length) {
      const missing = names.filter((n) => !all.some((w) => w.name === n));
      if (missing.length) throw new Error(`Write node(s) not found in the comp: ${missing.join(', ')}`);
      return all.filter((w) => names.includes(w.name));
    }
    const enabled = all.filter((w) => !w.disabled && w.connected);
    if (!enabled.length) throw new Error('The comp has no enabled Write node - tick the Write nodes to render');
    return enabled;
  }

  /**
   * Terminal or (hidden) GUI mode for rendering. Auto: GUI when terminal mode could not create some nodes,
   * e.g. an Indie .gzind gizmo that Indie refuses outside the GUI ("doesn't allow rendering to an external
   * frameserver"), or a gizmo whose folder is added to the plugin path only in menu.py.
   */
  _chooseMode(unloadable) {
    const mode = this.settings.nukeMode || 'auto';
    const nodes = unloadable.map((l) => {
      let m;
      if ((m = l.match(/^(\S+?): '([^']+)': unknown command/i))) return `${m[1]} (${m[2]})`;
      if ((m = l.match(/Error loading file (.+?\.\w+)/i))) return path.basename(m[1]);
      return l.slice(0, 120);
    });
    this.gui = mode === 'gui' || (mode === 'auto' && nodes.length > 0);
    this.guiReason = mode === 'gui' ? 'Settings: Nuke mode is GUI'
      : this.gui ? `needed for ${[...new Set(nodes)].join(', ')} (does not load in terminal mode)` : null;
    if (this.gui) this._log(`rendering in Nuke's GUI mode without a window - ${this.guiReason}`);
  }

  /** Probe the comp; on a licence error try the next licence mode. Sets this.license (and this.gui). */
  async _probe() {
    const cfgPath = this._writeConfig('probe.json', this._config({ mode: 'probe', frames: this.frames }));
    const key = `${normPath(this.appPath)}|${path.extname(this.sceneFile).toLowerCase()}`;
    let candidates = licenseCandidates(this.sceneFile, this.settings.licenseMode);
    const known = detectedLicense.get(key);
    if (known && candidates.includes(known)) candidates = [known, ...candidates.filter((c) => c !== known)];
    const failures = [];
    for (const license of candidates) {
      let report = null;
      // always probed in terminal mode: quick, finds the licence, and shows which nodes need the GUI
      const result = await this._runProcess(this._launch(license, cfgPath, false), 'nuke-probe', (line) => {
        if (line.startsWith('RENDERQ_PROBE:')) {
          try { report = JSON.parse(line.slice('RENDERQ_PROBE:'.length)); } catch (e) { /* reported below */ }
        }
      });
      if (this.state !== 'running') return { writes: [] };
      if (report) {
        this.license = license;
        detectedLicense.set(key, license);
        for (const e of report.loadErrors || []) this._log(`comp loaded with errors (ignored, as in the Nuke GUI): ${e}`);
        this._chooseMode(result.unloadable);
        return report;
      }
      if (result.licenseError) {
        failures.push(`${LICENSE_LABELS[license]}: ${result.licenseError}`);
        continue;
      }
      throw new Error(this._failure(result, `Could not open the comp with ${LICENSE_LABELS[license]}`));
    }
    throw new Error(`No Nuke licence available for this comp:\n${failures.join('\n')}\n` +
      'Choose the licence in Settings > Nuke (Indie comps are .nkind, Non-commercial ones .nknc).');
  }

  async _renderTask(task, total, getDone, setDone) {
    const cfg = this._config({
      mode: 'render', frames: task.frames,
      preview: this.previewDir ? { dir: this.previewDir, width: this.settings.previewWidth || 1280 } : null,
    });
    const cfgPath = this._writeConfig('render.json', cfg);
    const runs = contiguousRuns(task.frames).map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`));
    this._log(`rendering frames ${runs.join(', ')}`);
    let current = task.frames[0];
    let frameStart = Date.now();

    const progress = (extra = {}) => this._send('render-progress', {
      phase: 'render', frame: current, currentFrameIndex: getDone(), totalFrames: total, doneCount: getDone(),
      renderedCount: this.rendered, elapsedMs: Date.now() - this.startedAt, ...extra,
    });
    const complete = (frames, info) => {
      for (const f of frames) {
        if (this.finished.has(f)) continue;
        this.finished.add(f);
        setDone(getDone() + 1);
        if (info) this.rendered += 1;
      }
      progress({ frameDone: true });
      if (!info) return;
      this._send('frame-rendered', {
        frame: info.frame, outputPath: info.output, previewPath: info.preview || null,
        currentFrameIndex: getDone() - 1, totalFrames: total, doneCount: getDone(),
        renderedCount: this.rendered, elapsedMs: Date.now() - this.startedAt,
      });
      if (info.preview && this.deps.readPreview) {
        this.deps.readPreview(info.preview)
          .then((data) => this._send('frame-preview', { outputPath: info.preview, data }))
          .catch((e) => this._log('preview failed:', e?.message || e));
      }
    };

    const onLine = (line) => {
      let m;
      if ((m = line.match(/^RENDERQ_FRAME (-?\d+)/))) {
        current = parseInt(m[1], 10);
        frameStart = Date.now();
        progress();
      } else if ((m = line.match(/^RENDERQ_SKIP (-?\d+)/))) {
        complete([parseInt(m[1], 10)], null);
      } else if (line.startsWith('RENDERQ_DONE:')) {
        let info;
        try { info = JSON.parse(line.slice('RENDERQ_DONE:'.length)); } catch (e) { return; }
        complete(info.frames || [info.frame], info);
      }
    };

    return this._runProcess(this._launch(this.license, cfgPath), this.gui ? 'nuke-render-gui' : 'nuke-render', onLine,
      { readyTimeoutMs: this.gui ? GUI_READY_TIMEOUT_MS : 0 });
  }
}

/**
 * Which licence modes run with this Nuke (for the Settings "Detect" button): starts Nuke in terminal mode
 * with a one-line script once per mode. Resolves [{ license, label, ok, version?, detail? }].
 */
async function detectNukeLicenses({ appPath, deps }) {
  const tempDir = deps.makeTempDir('renderq_nuke_detect');
  const script = path.join(tempDir, 'detect.py');
  fs.writeFileSync(script, 'import nuke\nprint("RENDERQ_NUKE " + nuke.NUKE_VERSION_STRING)\n');
  const results = [];
  try {
    for (const license of Object.keys(LICENSE_FLAGS)) {
      const out = await new Promise((resolve) => {
        let text = '';
        const proc = deps.spawn(appPath, [...LICENSE_FLAGS[license], '-t', script],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }, { name: 'nuke-licence-check' });
        proc.stdout.on('data', (d) => { text += d; });
        proc.stderr.on('data', (d) => { text += d; });
        proc.on('close', () => resolve(text));
        proc.on('error', (e) => resolve(String(e?.message || e)));
      });
      const m = out.match(/RENDERQ_NUKE (\S+)/);
      const detail = m ? undefined : ((out.match(LICENSE_ERROR) || [])[0] || out.trim().split(/\r?\n/).pop() || 'no output');
      results.push({ license, label: LICENSE_LABELS[license], ok: !!m, version: m ? m[1] : undefined, detail });
    }
    return results;
  } finally {
    deps.removeDir(tempDir);
  }
}

module.exports = { NukeRenderJob, detectNukeLicenses, licenseCandidates, LICENSE_FLAGS, LICENSE_LABELS, LICENSE_ERROR };
