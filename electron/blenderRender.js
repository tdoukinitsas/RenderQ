/**
 * Blender render runner.
 *
 * One job = one queue item. Instead of one Blender process per frame, a job:
 *   1. probes the file once (renderq_blender.py in 'probe' mode) to find frames whose output already exists,
 *   2. renders the missing frames with `-s S -e E -a`, one process per contiguous run (optionally split into
 *      chunks of N frames, and optionally one process per view layer, interleaved chunk by chunk so complete
 *      frames arrive progressively),
 *   3. reports progress parsed from Blender's log, retries a process that crashed after it had started
 *      rendering, and can be paused/stopped at any time - restarting skips everything already on disk.
 *
 * Nothing in here depends on Electron; main.js injects process spawning, IPC sending and previews.
 */
const fs = require('fs');
const path = require('path');

const HELPER_SOURCE = path.join(__dirname, 'renderq_blender.py');
const MAX_RETRIES = 2;                 // per process, only after it reached the "ready" line
const DEFAULT_SPLIT_CHUNK = 100;       // frames per process when view layers are rendered separately

// Frames completed during this app session, per job - lets a resumed job continue even with overwrite on.
const sessionDone = new Map();

function parseFrameRanges(rangeString) {
  const frames = new Set();
  for (const part of String(rangeString || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      for (let f = Math.min(a, b); f <= Math.max(a, b); f++) frames.add(f);
    } else if (/^-?\d+$/.test(part)) {
      frames.add(parseInt(part, 10));
    }
  }
  return [...frames].sort((a, b) => a - b);
}

function contiguousRuns(frames) {
  const runs = [];
  for (const f of frames) {
    const last = runs[runs.length - 1];
    if (last && f === last.end + 1) last.end = f;
    else runs.push({ start: f, end: f });
  }
  return runs;
}

function chunkFrames(frames, size) {
  if (!size || size <= 0) return [frames];
  const chunks = [];
  for (let i = 0; i < frames.length; i += size) chunks.push(frames.slice(i, i + size));
  return chunks;
}

/**
 * Plan the processes: for every chunk, every layer renders its missing frames (as contiguous runs).
 * `done` maps layer key ('' when not split) -> Set of finished frames.
 */
function planTasks({ frames, layers, done, chunkSize }) {
  const tasks = [];
  for (const chunk of chunkFrames(frames, chunkSize)) {
    for (const layer of layers) {
      const finished = done.get(layer || '') || new Set();
      const missing = chunk.filter((f) => !finished.has(f));
      for (const run of contiguousRuns(missing)) tasks.push({ layer, ...run, retries: 0 });
    }
  }
  return tasks;
}

const normPath = (p) => String(p || '').replace(/\//g, '\\').toLowerCase();

class BlenderRenderJob {
  /**
   * @param {object} o
   * @param {string} o.appPath       blender executable
   * @param {string} o.sceneFile     .blend
   * @param {string} o.frameRanges   e.g. "1-100, 150"
   * @param {string} o.jobId
   * @param {object} o.settings      per-job Blender settings (see renderq_blender.py for the meaning)
   * @param {boolean} o.resume       continue a paused job (keeps this session's finished frames)
   * @param {object} o.deps          { spawn(cmd,args,opts,meta), send(channel,data), kill(proc),
   *                                  makeTempDir(prefix), removeDir(dir), previewExr?(path,{allowBlender}),
   *                                  setCurrentProcess?(proc|null), log?(...args) }
   */
  constructor(o) {
    this.appPath = o.appPath;
    this.sceneFile = o.sceneFile;
    this.jobId = o.jobId;
    this.settings = o.settings || {};
    this.frames = parseFrameRanges(o.frameRanges);
    this.deps = o.deps;
    this.state = 'idle';   // running | paused | stopped | done | error
    this.proc = null;
    if (!o.resume) sessionDone.delete(this.jobId);
    if (!sessionDone.has(this.jobId)) sessionDone.set(this.jobId, new Map());
    this.finished = sessionDone.get(this.jobId);   // layer key -> Set(frame)
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
  _log(...a) { (this.deps.log || console.log)('[Blender Render]', ...a); }

  _layers() {
    const s = this.settings;
    const split = s.splitViewLayers && Array.isArray(s.splitLayers) && s.splitLayers.length > 0;
    return split ? s.splitLayers : [null];
  }

  _config(extra) {
    const s = this.settings;
    const layers = this._layers();
    return {
      engine: s.engine || '',
      cyclesDevice: s.cyclesDevice || '',
      resolution: s.resolution || null,
      outputPath: s.outputPath || '',
      preRenderPython: s.preRenderPython || '',
      viewLayers: layers[0] === null && Array.isArray(s.viewLayers) && s.viewLayers.length ? s.viewLayers : null,
      splitLayers: layers[0] === null ? [] : layers,
      skipExisting: s.skipExisting !== false,
      ...extra,
    };
  }

  _writeConfig(name, cfg) {
    const p = path.join(this.tempDir, name);
    fs.writeFileSync(p, JSON.stringify(cfg), 'utf8');
    return p;
  }

  _baseArgs() {
    const args = ['-b', this.sceneFile];
    // Python drivers and scripts in the file (on by default so renders match the Blender UI)
    args.push(this.settings.allowPythonScripts === false ? '--disable-autoexec' : '--enable-autoexec');
    if (this.settings.factoryStartup) args.splice(1, 0, '--factory-startup');
    args.push('--python-exit-code', '1', '--python', this.helperPath);
    return args;
  }

  _markFinished(layer, frame) {
    const key = layer || '';
    if (!this.finished.has(key)) this.finished.set(key, new Set());
    this.finished.get(key).add(frame);
  }

  /** Run one Blender process; resolves { code, lines, ready } when it exits. */
  _runProcess(args, name, onLine) {
    return new Promise((resolve) => {
      const env = { ...process.env, TEMP: this.tempDir, TMP: this.tempDir };
      const proc = this.deps.spawn(this.appPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env },
        { name: `${name}:${this.jobId}` });
      this.proc = proc;
      this.deps.setCurrentProcess?.(proc);
      const tail = [];
      let ready = false;
      let buffer = { stdout: '', stderr: '' };
      const feed = (stream, chunk) => {
        const text = chunk.toString();
        this._send('render-output', { output: text });
        buffer[stream] += text;
        const lines = buffer[stream].split(/\r?\n/);
        buffer[stream] = lines.pop();
        for (const line of lines) {
          tail.push(line);
          if (tail.length > 40) tail.shift();
          if (line.startsWith('RENDERQ: ready')) ready = true;
          onLine?.(line);
        }
      };
      proc.stdout.on('data', (d) => feed('stdout', d));
      proc.stderr.on('data', (d) => feed('stderr', d));
      let settled = false;
      const done = (code, err) => {
        if (settled) return;
        settled = true;
        for (const stream of ['stdout', 'stderr']) {
          if (buffer[stream]) { tail.push(buffer[stream]); onLine?.(buffer[stream]); }
        }
        this.proc = null;
        this.deps.setCurrentProcess?.(null);
        resolve({ code, err, tail, ready });
      };
      proc.on('close', (code) => done(code));
      proc.on('error', (err) => done(-1, err));
    });
  }

  // ---------------------------------------------------------------- job
  async run() {
    this.state = 'running';
    this.tempDir = this.deps.makeTempDir(`renderq_render_${this.jobId || 'job'}`);
    this.helperPath = path.join(this.tempDir, 'renderq_blender.py');
    fs.writeFileSync(this.helperPath, fs.readFileSync(HELPER_SOURCE));   // Blender needs a real file (not asar)
    this.startedAt = Date.now();
    this.rendered = 0;
    try {
      if (this.frames.length === 0) throw new Error('No frames to render');
      if (!this.appPath || !fs.existsSync(this.appPath)) {
        throw new Error(`Blender not found at "${this.appPath || '(not set)'}" - choose the Blender executable in Settings`);
      }
      const layers = this._layers();
      const total = this.frames.length * layers.length;
      this._send('render-progress', { phase: 'probe', currentFrameIndex: 0, totalFrames: total, doneCount: 0 });

      // 1. probe: which frames exist already, is the output a movie?
      const probe = await this._probe();
      if (this.state !== 'running') return this._finishInterrupted();
      const skip = this.settings.skipExisting !== false;
      const movie = Object.values(probe.layers).some((l) => l.movie);
      const done = new Map();
      for (const layer of layers) {
        const key = layer || '';
        const set = new Set(movie ? [] : [...(this.finished.get(key) || [])]);
        if (skip && !movie) for (const f of probe.layers[key]?.done || []) set.add(f);
        done.set(key, set);
      }
      const removed = Object.values(probe.layers).reduce((n, l) => n + (l.removedPlaceholders || 0), 0);
      if (removed) this._log(`removed ${removed} empty placeholder file(s) left by an interrupted render`);

      // 2. plan: movies are written in one go per run; image sequences may be chunked
      let chunkSize = parseInt(this.settings.chunkSize, 10) || 0;
      if (!chunkSize && layers.length > 1) chunkSize = DEFAULT_SPLIT_CHUNK;
      if (movie) chunkSize = 0;
      const queue = planTasks({ frames: this.frames, layers, done, chunkSize });
      let doneCount = total - queue.reduce((n, t) => n + (t.end - t.start + 1), 0);
      const skipped = doneCount;
      this._log(`${total} frame(s)${layers.length > 1 ? ` (${layers.length} view layers)` : ''}: ` +
        `${skipped} already rendered, ${queue.length} Blender process(es) to run`);
      this._send('render-progress', { phase: 'render', currentFrameIndex: doneCount, totalFrames: total, doneCount, skippedCount: skipped });

      // 3. render
      while (queue.length) {
        if (this.state !== 'running') return this._finishInterrupted();
        const task = queue.shift();
        const result = await this._renderTask(task, total, () => doneCount, (n) => { doneCount = n; });
        if (this.state !== 'running') return this._finishInterrupted();
        if (result.code === 0) continue;

        // crashed or failed: retry what is left of this run if it had got as far as rendering
        const left = [];
        for (let f = task.start; f <= task.end; f++) {
          if (!(this.finished.get(task.layer || '') || new Set()).has(f)) left.push(f);
        }
        const why = result.err ? result.err.message : `exit code ${result.code}`;
        if (result.ready && task.retries < MAX_RETRIES && left.length) {
          this._log(`Blender exited (${why}) - retrying frames ${left[0]}-${left[left.length - 1]}` +
            `${task.layer ? ` of ${task.layer}` : ''} (attempt ${task.retries + 2})`);
          const runs = contiguousRuns(left).map((r) => ({ layer: task.layer, ...r, retries: task.retries + 1 }));
          queue.unshift(...runs);
          continue;
        }
        const detail = result.tail.filter((l) => /error|traceback|exception/i.test(l)).slice(-4).join('\n') ||
          result.tail.slice(-4).join('\n');
        throw new Error(`Blender ${why}${task.layer ? ` (view layer ${task.layer})` : ''}` +
          `${detail ? `:\n${detail}` : ''}`);
      }

      this.state = 'done';
      sessionDone.delete(this.jobId);
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

  _finishInterrupted() {
    if (this.state === 'paused') this._send('render-paused', {});
    return { success: false, [this.state]: true };
  }

  async _probe() {
    const cfgPath = this._writeConfig('probe.json', this._config({ mode: 'probe', frames: this.frames }));
    let report = null;
    const result = await this._runProcess([...this._baseArgs(), '--', cfgPath], 'blender-probe', (line) => {
      if (line.startsWith('RENDERQ_PROBE:')) {
        try { report = JSON.parse(line.slice('RENDERQ_PROBE:'.length)); } catch (e) { /* reported below */ }
      }
    });
    if (this.state !== 'running') return { layers: {} };
    if (!report) {
      const detail = result.tail.filter((l) => /error|traceback|exception/i.test(l)).slice(-4).join('\n') ||
        result.tail.slice(-4).join('\n');
      throw new Error(`Could not prepare the Blender file (exit code ${result.code})${detail ? `:\n${detail}` : ''}`);
    }
    return report;
  }

  async _renderTask(task, total, getDone, setDone) {
    const cfgPath = this._writeConfig(`render_${task.layer || 'all'}.json`, this._config({ mode: 'render', layer: task.layer }));
    const args = [...this._baseArgs(), '-s', String(task.start), '-e', String(task.end), '-a', '--', cfgPath];
    this._log(`rendering ${task.layer ? `${task.layer} ` : ''}frames ${task.start}-${task.end}`);

    let outputBase = '';
    let current = task.start;
    const pending = [];
    for (let f = task.start; f <= task.end; f++) pending.push(f);
    let saved = [];
    let lastExr = null;
    let sample = null;

    const progress = (extra = {}) => this._send('render-progress', {
      phase: 'render', frame: current, layer: task.layer, currentFrameIndex: getDone(), totalFrames: total,
      doneCount: getDone(), renderedCount: this.rendered, elapsedMs: Date.now() - this.startedAt, ...extra,
    });
    const complete = (frame, outputPath, wasSkipped) => {
      const i = pending.indexOf(frame);
      if (i !== -1) pending.splice(i, 1);
      this._markFinished(task.layer, frame);
      setDone(getDone() + 1);
      if (!wasSkipped) this.rendered += 1;
      progress({ frameDone: true });
      if (wasSkipped || !outputPath) return;
      if (outputPath.toLowerCase().endsWith('.exr')) lastExr = outputPath;
      this._send('frame-rendered', {
        frame, layer: task.layer, outputPath, currentFrameIndex: getDone() - 1, totalFrames: total,
        doneCount: getDone(), renderedCount: this.rendered, elapsedMs: Date.now() - this.startedAt,
      });
      if (lastExr && this.deps.previewExr) {
        this.deps.previewExr(lastExr, { allowBlender: false })
          .then((data) => { lastExr = null; this._send('frame-preview', { outputPath, data }); })
          .catch(() => { /* retried with Blender between processes */ });
      }
    };

    const onLine = (line) => {
      let m;
      if (line.startsWith('RENDERQ: ready')) {
        try { outputBase = normPath(JSON.parse(line.slice('RENDERQ: ready'.length)).output); } catch (e) { /* ignore */ }
        return;
      }
      if ((m = line.match(/Skipping existing frame "(.+)"/i))) {
        complete(pending[0] ?? current, null, true);
        return;
      }
      if ((m = line.match(/\bFra:\s*(\d+)/))) {
        const f = parseInt(m[1], 10);
        if (f !== current) { current = f; sample = null; }
      }
      if ((m = line.match(/Sample (\d+)\/(\d+)/) || line.match(/Rendering (\d+) \/ (\d+) samples/))) {
        const s = { currentSample: parseInt(m[1], 10), totalSamples: parseInt(m[2], 10) };
        if (!sample || s.currentSample !== sample.currentSample) { sample = s; progress(s); }
        return;
      }
      if ((m = line.match(/Saved: '(.+)'/))) {
        saved.push(m[1]);   // File Output nodes print "Saved:" too; the main output is picked below
        return;
      }
      if (/\(Saving: [\d:.]+\)/.test(line)) {   // printed once per finished frame (images and movies)
        // movies print no "Saved:" for the main output - then there is no per-frame image to preview
        const main = outputBase
          ? saved.find((p) => normPath(p).startsWith(outputBase)) || null
          : saved[saved.length - 1] || null;
        saved = [];
        complete(current, main, false);
      }
    };

    const result = await this._runProcess(args, 'blender-render', onLine);
    // EXR previews that sharp could not decode: convert with Blender now that no render process is running
    if (lastExr && this.deps.previewExr && this.state === 'running') {
      try {
        const data = await this.deps.previewExr(lastExr, { allowBlender: true });
        this._send('frame-preview', { outputPath: lastExr, data });
      } catch (e) { this._log('EXR preview failed:', e?.message || e); }
    }
    return result;
  }
}

module.exports = { BlenderRenderJob, parseFrameRanges, contiguousRuns, planTasks };
