/**
 * The page's side of the RenderQ MCP server (electron/mcpServer.js).
 *
 * - Answers the tool calls the main process forwards ('mcp-request'), working on the render queue store and on
 *   the page's own operations (loading scenes, the render loop, queue files) passed in as `ops`.
 * - Reports what happens in the queue as events ('mcp-event'): jobs added / started / finished / failed,
 *   progress, queue started / paused / completed... The main process numbers them for wait_for_events and
 *   pushes them to connected agents.
 */
import { watch, onUnmounted } from 'vue';
import { useRenderQueueStore, type RenderJob } from '~/stores/renderQueue';
import { useSettingsStore } from '~/stores/settings';
import { ApplicationType, APPLICATION_INFO } from '~/types/applications';
import { parseFrameRanges, validateFrameRange, formatTime } from '~/utils/helpers';

export type ExistingFramesPolicy = 'default' | 'skip' | 'overwrite';

export interface McpBridgeOps {
  /** Add scene files as jobs; jobIds right away, `done` once every scene has been read */
  addSceneFiles(filePaths: string[], options: {
    frameRanges?: string;
    appSettings?: Record<string, any>;
    position?: 'end' | 'top' | number;
  }): { jobIds: string[]; done: Promise<void> };
  /** Start rendering all pending jobs, or only jobIds */
  startRender(options: { jobIds?: string[] | null; existingFrames?: ExistingFramesPolicy }): Promise<void>;
  pauseRender(): Promise<void>;
  resumeRender(): Promise<void>;
  stopRender(): Promise<void>;
  /** Save the queue to a file; returns the path written */
  saveQueueTo(filePath: string): Promise<string>;
  /** Load a queue file; returns the ids of the jobs it added */
  loadQueueFrom(filePath: string, mode: 'replace' | 'append'): Promise<string[]>;
  getAppPathForType(appType: ApplicationType): string;
  getAppPathForJob(job: RenderJob): string;
}

class McpToolError extends Error {}

const MAX_FRAMES = 100_000;
const PROGRESS_EVENT_INTERVAL_MS = 10_000;

function api(): any {
  return typeof window !== 'undefined' ? (window as any).electronAPI : null;
}

/** Send a queue event to the MCP server (ignored when the server is off) */
export function emitMcpEvent(type: string, data: Record<string, any> = {}) {
  const settings = useSettingsStore();
  if (!settings.mcpEnabled) return;
  try {
    api()?.mcpEmitEvent?.(JSON.parse(JSON.stringify({ type, ...data })));
  } catch (e) {
    console.warn('[MCP] Failed to send event:', e);
  }
}

function effectiveRange(job: RenderJob) {
  return job.useCustomFrameRange ? job.frameRanges : `${job.originalFrameStart}-${job.originalFrameEnd}`;
}

function frameCount(job: RenderJob) {
  return parseFrameRanges(effectiveRange(job)).length;
}

function isoIn(ms: number | null | undefined) {
  return ms && ms > 0 ? new Date(Date.now() + ms).toISOString() : null;
}

function round(n: number, digits = 1) {
  const f = 10 ** digits;
  return Math.round((n || 0) * f) / f;
}

/** A job as agents see it */
function serializeJob(job: RenderJob, index: number, detailed = false) {
  const settings = (job.appSettings || {}) as Record<string, any>;
  const active = job.status === 'rendering' || job.status === 'paused';
  const base: Record<string, any> = {
    id: job.id,
    index,
    fileName: job.fileName,
    filePath: job.filePath,
    application: job.applicationType,
    status: job.status,
    progress: round(job.progress),
    frameRange: effectiveRange(job),
    customFrameRange: job.useCustomFrameRange,
    frames: frameCount(job),
    outputPath: settings.outputPath || job.outputPath,
    error: job.error || null,
  };
  if (active) {
    base.framesDone = job.currentFrame;
    base.unitsTotal = job.totalFrames;            // frames x view layers for split Blender renders
    if (job.currentFrameNumber !== undefined) base.currentFrameNumber = job.currentFrameNumber;
    if (job.currentLayer) base.currentLayer = job.currentLayer;
    if (job.totalSamples) base.samples = `${job.currentSample}/${job.totalSamples}`;
    base.elapsedMs = job.renderStartTime ? Date.now() - job.renderStartTime : job.elapsedTime;
    base.estimatedTimeRemainingMs = job.estimatedTimeRemaining || null;
    base.estimatedTimeRemaining = job.estimatedTimeRemaining ? formatTime(job.estimatedTimeRemaining) : null;
    base.estimatedCompletionTime = isoIn(job.estimatedTimeRemaining);
  }
  if (job.status === 'complete') base.elapsedMs = job.elapsedTime;
  if (job.failedFrames?.length) {
    base.failedFrames = job.failedFrames;
    base.failedFramesError = job.failedFramesError || null;
  }
  if (Object.keys(settings).length) base.appSettings = settings;
  if (!detailed) return base;

  return {
    ...base,
    sceneFrameRange: `${job.originalFrameStart}-${job.originalFrameEnd}`,
    sceneOutputPath: job.outputPath,
    outputDir: job.outputDir,
    format: job.format,
    resolution: settings.resolution || job.resolution,
    sceneResolution: job.resolution,
    fps: job.fps,
    renderEngine: settings.engine || job.renderEngine,
    isVideoOutput: job.isVideoOutput,
    appExecutablePath: job.appExecutablePath || null,
    viewLayers: job.viewLayers,
    pythonDriverCount: job.pythonDriverCount,
    takeName: job.takeName,
    renderNode: job.renderNode,
    composition: job.composition,
    writeNodes: job.writeNodes,
    loadErrors: job.loadErrors,
    nukeVersion: job.nukeVersion,
    nukeLicense: job.nukeLicense,
    nukeGuiMode: job.nukeGuiMode,
    renderedFrameCount: job.renderedFramePaths?.length ?? 0,
    recentRenderedFrames: (job.renderedFramePaths || []).slice(-20),
    lastRenderedFrame: job.lastRenderedFrame,
    exrLayers: job.exrLayers?.length ? job.exrLayers : undefined,
  };
}

/** Short job reference for events */
function jobRef(job: RenderJob) {
  return { jobId: job.id, fileName: job.fileName, application: job.applicationType };
}

export function useMcpBridge(ops: McpBridgeOps) {
  const renderQueue = useRenderQueueStore();
  const settings = useSettingsStore();
  const electron = api();

  // ============================================================ helpers

  function findJob(jobId: unknown) {
    if (typeof jobId !== 'string' || !jobId) throw new McpToolError('jobId is required.');
    const index = renderQueue.jobs.findIndex(j => j.id === jobId);
    if (index === -1) throw new McpToolError(`No job with id "${jobId}" in the queue (list_jobs shows the current ids).`);
    return { job: renderQueue.jobs[index], index };
  }

  function findJobs(jobIds: unknown) {
    if (!Array.isArray(jobIds) || jobIds.length === 0) throw new McpToolError('jobIds must list at least one job id.');
    return jobIds.map(id => findJob(id).job);
  }

  function jobOut(jobId: string, detailed = false) {
    const index = renderQueue.jobs.findIndex(j => j.id === jobId);
    return index === -1 ? null : serializeJob(renderQueue.jobs[index], index, detailed);
  }

  function checkFrameRange(range: unknown) {
    if (typeof range !== 'string') throw new McpToolError('frameRanges must be a string such as "1-100" or "1,5,10-20".');
    const check = validateFrameRange(range);
    if (!check.valid) throw new McpToolError(`Invalid frame range "${range}": ${check.error}`);
    let total = 0;
    for (const part of range.split(',')) {
      const [a, b] = part.split('-').map(s => parseInt(s.trim()));
      total += isNaN(b) ? 1 : b - a + 1;
    }
    if (total > MAX_FRAMES) throw new McpToolError(`Frame range "${range}" has more than ${MAX_FRAMES} frames.`);
    return range.trim();
  }

  /** Merge appSettings overrides into a job's (null removes a key) */
  function mergeAppSettings(current: Record<string, any> | undefined, patch: unknown) {
    if (patch === null) return undefined;
    if (typeof patch !== 'object' || Array.isArray(patch)) throw new McpToolError('appSettings must be an object.');
    const next: Record<string, any> = { ...(current || {}) };
    for (const [key, value] of Object.entries(patch as Record<string, any>)) {
      if (value === null) delete next[key];
      else next[key] = value;
    }
    return Object.keys(next).length ? next : undefined;
  }

  function counts() {
    const c: Record<string, number> = { idle: 0, loading: 0, rendering: 0, paused: 0, complete: 0, error: 0, 'missing-app': 0 };
    for (const j of renderQueue.jobs) c[j.status] = (c[j.status] || 0) + 1;
    return c;
  }

  /** Estimated time left for the jobs this run will still render */
  function estimateRemainingMs(): number | null {
    if (!renderQueue.isRendering) return null;
    if (!renderQueue.runJobIds) return renderQueue.totalEstimatedTime > 0 ? renderQueue.totalEstimatedTime : null;
    // Rendering selected jobs only: the current job's own estimate + the other run jobs at the average frame time
    const timed = renderQueue.jobs.filter(j => j.frameTimes.length > 0);
    const avg = timed.length
      ? timed.reduce((sum, j) => sum + j.frameTimes.reduce((a, b) => a + b, 0) / j.frameTimes.length, 0) / timed.length
      : 0;
    const current = renderQueue.currentJob;
    let ms = current?.estimatedTimeRemaining || 0;
    for (const j of renderQueue.runnablePendingJobs) ms += frameCount(j) * avg;
    return ms > 0 ? ms : null;
  }

  function queueStatus() {
    const current = renderQueue.currentJob;
    const remaining = estimateRemainingMs();
    const inScope = renderQueue.runJobIds
      ? renderQueue.jobs.filter(j => renderQueue.runJobIds!.includes(j.id))
      : renderQueue.jobs;
    const framesTotal = inScope.reduce((n, j) => n + (j.status === 'missing-app' ? 0 : frameCount(j)), 0);
    const framesRendered = inScope.reduce((n, j) => {
      if (j.status === 'complete') return n + frameCount(j);
      if (j.status === 'rendering' || j.status === 'paused') return n + Math.round((j.progress / 100) * frameCount(j));
      return n;
    }, 0);
    return {
      state: !renderQueue.isRendering ? 'idle' : renderQueue.isPaused ? 'paused' : 'rendering',
      scope: renderQueue.isRendering ? (renderQueue.runJobIds ? 'selected-jobs' : 'queue') : null,
      runJobIds: renderQueue.runJobIds,
      currentJob: current ? serializeJob(current, renderQueue.currentJobIndex) : null,
      progress: framesTotal > 0 ? round((framesRendered / framesTotal) * 100) : 0,
      framesRendered,
      framesTotal,
      estimatedTimeRemainingMs: remaining,
      estimatedTimeRemaining: remaining ? formatTime(remaining) : null,
      estimatedCompletionTime: isoIn(remaining),
      estimateNote: renderQueue.isRendering && !remaining ? 'No estimate until the first frame finishes.' : undefined,
      pendingJobs: (renderQueue.isRendering ? renderQueue.runnablePendingJobs : renderQueue.pendingJobs).length,
      jobCount: renderQueue.jobs.length,
      counts: counts(),
      queueFile: renderQueue.currentQueueFile,
      hasUnsavedChanges: renderQueue.hasUnsavedChanges,
      continueOnRenderErrors: settings.continueOnRenderErrors,
      now: new Date().toISOString(),
    };
  }

  // ============================================================ tools

  const handlers: Record<string, (p: any) => any> = {
    get_queue_status: () => queueStatus(),

    list_jobs: (p) => {
      const statuses: string[] | null = Array.isArray(p.status) && p.status.length ? p.status : null;
      const jobs = renderQueue.jobs
        .map((j, i) => serializeJob(j, i))
        .filter(j => !statuses || statuses.includes(j.status));
      return { jobs, total: renderQueue.jobs.length };
    },

    get_job: (p) => {
      const { job, index } = findJob(p.jobId);
      return serializeJob(job, index, true);
    },

    list_render_apps: () => ({
      applications: Object.values(ApplicationType).map((type) => {
        const installs = (renderQueue.appInstallations as any)[type] || [];
        const configured = ops.getAppPathForType(type);
        return {
          application: type,
          name: APPLICATION_INFO[type]?.name ?? type,
          fileExtensions: APPLICATION_INFO[type]?.fileExtensions ?? [],
          available: !!configured || installs.length > 0,
          executable: configured || null,
          installations: installs.map((i: any) => ({ version: i.version, path: i.commandLinePath || i.path })),
        };
      }),
    }),

    add_jobs: async (p) => {
      const filePaths: string[] = p.filePaths;
      const frameRanges = p.frameRanges !== undefined ? checkFrameRange(p.frameRanges) : undefined;
      const appSettings = p.appSettings !== undefined ? mergeAppSettings(undefined, p.appSettings) : undefined;
      let position: 'end' | 'top' | number = 'end';
      if (p.position === 'top' || p.position === 'end') position = p.position;
      else if (Number.isInteger(p.position) && p.position >= 0) position = p.position;

      const { jobIds, done } = ops.addSceneFiles(filePaths, { frameRanges, appSettings, position });
      const waitMs = Math.min(Math.max(Number(p.waitSeconds ?? 45), 0), 50) * 1000;
      let finished = waitMs === 0 ? false : await Promise.race([
        done.then(() => true),
        new Promise<boolean>(r => setTimeout(() => r(false), waitMs)),
      ]);
      const jobs = jobIds.map(id => jobOut(id)).filter(Boolean);
      return {
        jobs,
        allReady: finished && jobs.every((j: any) => j.status !== 'loading'),
        note: finished ? undefined : 'Some scenes are still being read (status "loading"); wait_for_events reports job_ready / job_load_failed for each.',
      };
    },

    update_job: (p) => {
      const { job } = findJob(p.jobId);
      if (job.status === 'rendering') throw new McpToolError('The job is rendering; pause or stop the queue before changing it.');
      if (job.status === 'loading') throw new McpToolError('The job is still reading its scene; wait for job_ready first.');
      const updates: Partial<RenderJob> = {};
      if (p.frameRanges !== undefined) {
        if (p.frameRanges === null) {
          updates.useCustomFrameRange = false;
          updates.frameRanges = `${job.originalFrameStart}-${job.originalFrameEnd}`;
        } else {
          updates.frameRanges = checkFrameRange(p.frameRanges);
          updates.useCustomFrameRange = true;
        }
      }
      if (p.appSettings !== undefined) updates.appSettings = mergeAppSettings(job.appSettings as any, p.appSettings);
      for (const key of ['takeName', 'renderNode', 'composition', 'appExecutablePath'] as const) {
        if (p[key] !== undefined) (updates as any)[key] = p[key] === null || p[key] === '' ? undefined : String(p[key]);
      }
      if (Object.keys(updates).length === 0) throw new McpToolError('Nothing to change: give frameRanges, appSettings, takeName, renderNode, composition or appExecutablePath.');
      renderQueue.updateJob(job.id, updates);
      renderQueue.hasUnsavedChanges = true;
      if ('appExecutablePath' in updates) renderQueue.validateJobApplications();
      emitMcpEvent('job_updated', { ...jobRef(job), changed: Object.keys(updates) });
      return jobOut(job.id, true);
    },

    remove_jobs: (p) => {
      const jobs = findJobs(p.jobIds);
      const ids = jobs.map(j => j.id);
      renderQueue.removeJobs(ids);
      const remaining = new Set(renderQueue.jobs.map(j => j.id));
      return {
        removed: ids.filter(id => !remaining.has(id)),
        notRemoved: ids.filter(id => remaining.has(id)).map(id => ({ jobId: id, reason: 'rendering - stop the queue first' })),
      };
    },

    move_jobs: (p) => {
      const jobs = findJobs(p.jobIds);
      const ids = jobs.map(j => j.id);
      const pos = p.position;
      if (pos === 'top' || pos === 'bottom') renderQueue.moveJobsToEdge(ids, pos);
      else if (pos === 'up' || pos === 'down') renderQueue.moveJobsBy(ids, pos === 'up' ? -1 : 1);
      else if (Number.isInteger(pos) && pos >= 0) {
        const move = new Set(ids);
        const moving = renderQueue.jobs.filter(j => move.has(j.id));
        const rest = renderQueue.jobs.filter(j => !move.has(j.id));
        rest.splice(Math.min(pos, rest.length), 0, ...moving);
        renderQueue.reorderJobs(rest);
        renderQueue.hasUnsavedChanges = true;
      } else {
        throw new McpToolError('position must be "top", "bottom", "up", "down" or a 0-based index.');
      }
      return { order: renderQueue.jobs.map((j, i) => ({ index: i, id: j.id, fileName: j.fileName, status: j.status })) };
    },

    duplicate_job: (p) => {
      const { job } = findJob(p.jobId);
      if (job.status === 'loading') throw new McpToolError('The job is still reading its scene; wait for job_ready first.');
      const id = renderQueue.duplicateJob(job.id);
      if (!id) throw new McpToolError('Could not duplicate the job.');
      return jobOut(id, true);
    },

    reset_jobs: (p) => {
      const ids = p.jobIds !== undefined
        ? findJobs(p.jobIds).map(j => j.id)
        : renderQueue.jobs.filter(j => j.status === 'complete' || j.status === 'error').map(j => j.id);
      const busy = renderQueue.isRendering ? renderQueue.currentJob?.id : undefined;
      const resettable = ids.filter(id => id !== busy);
      renderQueue.resetJobs(resettable);
      renderQueue.hasUnsavedChanges = true;
      return {
        jobs: ids.map(id => jobOut(id)),
        ...(busy && ids.includes(busy) ? { note: 'The job being rendered was left alone.' } : {}),
      };
    },

    clear_queue: (p) => {
      if (p.scope === 'all') {
        if (renderQueue.isRendering) throw new McpToolError('Cannot clear the whole queue while rendering; stop_queue first (or clear_queue with scope "completed").');
        const n = renderQueue.jobs.length;
        renderQueue.clearAll();
        renderQueue.hasUnsavedChanges = true;
        emitMcpEvent('queue_cleared', { scope: 'all', removed: n });
        return { removed: n, jobCount: 0 };
      }
      if (p.scope === 'completed') {
        const before = renderQueue.jobs.length;
        renderQueue.clearCompleted();
        const removed = before - renderQueue.jobs.length;
        emitMcpEvent('queue_cleared', { scope: 'completed', removed });
        return { removed, jobCount: renderQueue.jobs.length };
      }
      throw new McpToolError('scope must be "completed" or "all".');
    },

    save_queue: async (p) => {
      const filePath = p.filePath || renderQueue.currentQueueFile;
      if (!filePath) throw new McpToolError('No queue file is open; give filePath (an absolute path ending in .json).');
      const written = await ops.saveQueueTo(filePath);
      emitMcpEvent('queue_saved', { filePath: written, jobCount: renderQueue.jobs.length });
      return { filePath: written, jobCount: renderQueue.jobs.length };
    },

    load_queue: async (p) => {
      const mode = p.mode === 'append' ? 'append' : 'replace';
      if (mode === 'replace' && renderQueue.isRendering) {
        throw new McpToolError('Cannot replace the queue while rendering; stop_queue first, or load with mode "append".');
      }
      const jobIds = await ops.loadQueueFrom(p.filePath, mode);
      emitMcpEvent('queue_loaded', { filePath: p.filePath, mode, jobCount: jobIds.length });
      return { mode, filePath: p.filePath, jobs: jobIds.map(id => jobOut(id)), queueFile: renderQueue.currentQueueFile };
    },

    start_queue: async (p) => {
      if (renderQueue.isRendering) {
        if (renderQueue.isPaused) throw new McpToolError('The queue is paused; use resume_queue.');
        if (renderQueue.runJobIds) {
          // rendering selected jobs: widen the run to the whole queue
          renderQueue.runJobIds = null;
          return { ...queueStatus(), note: 'Was rendering selected jobs; the rest of the queue will now render too.' };
        }
        return { ...queueStatus(), note: 'The queue is already rendering.' };
      }
      if (renderQueue.pendingJobs.length === 0) {
        const loading = renderQueue.jobs.filter(j => j.status === 'loading').length;
        throw new McpToolError(loading
          ? `No pending jobs yet: ${loading} job(s) are still reading their scenes. Wait for job_ready, then start again.`
          : 'No pending jobs (status "idle"). Add jobs, or reset_jobs to render finished/failed jobs again.');
      }
      await ops.startRender({ jobIds: null, existingFrames: p.existingFrames });
      return queueStatus();
    },

    render_jobs: async (p) => {
      const jobs = findJobs(p.jobIds);
      const problems: string[] = [];
      for (const job of jobs) {
        if (job.status === 'idle') continue;
        if ((job.status === 'complete' || job.status === 'error' || job.status === 'paused') && p.reset) {
          if (renderQueue.isRendering && renderQueue.currentJob?.id === job.id) continue;
          renderQueue.resetJobs([job.id]);
          continue;
        }
        if (job.status === 'rendering' || (job.status === 'paused' && renderQueue.currentJob?.id === job.id)) continue;
        problems.push(`${job.id} (${job.fileName}) is ${job.status}${job.status === 'complete' || job.status === 'error' ? ' - pass reset: true to render it again' : ''}`);
      }
      if (problems.length) throw new McpToolError(`Cannot render: ${problems.join('; ')}.`);
      const ids = jobs.map(j => j.id);

      if (renderQueue.isRendering) {
        if (renderQueue.runJobIds) {
          renderQueue.runJobIds = [...new Set([...renderQueue.runJobIds, ...ids])];
          return { ...queueStatus(), note: 'Added to the jobs being rendered.' };
        }
        // the whole queue is rendering: render these next
        const currentId = renderQueue.currentJob?.id;
        const move = new Set(ids.filter(id => id !== currentId));
        const moving = renderQueue.jobs.filter(j => move.has(j.id));
        const rest = renderQueue.jobs.filter(j => !move.has(j.id));
        const at = currentId ? rest.findIndex(j => j.id === currentId) + 1 : 0;
        rest.splice(at, 0, ...moving);
        renderQueue.reorderJobs(rest);
        renderQueue.hasUnsavedChanges = true;
        return { ...queueStatus(), note: 'The queue is already rendering; these jobs were moved to render next.' };
      }

      await ops.startRender({ jobIds: ids, existingFrames: p.existingFrames });
      return queueStatus();
    },

    pause_queue: async () => {
      if (!renderQueue.isRendering) throw new McpToolError('Nothing is rendering.');
      if (renderQueue.isPaused) return { ...queueStatus(), note: 'Already paused.' };
      await ops.pauseRender();
      return queueStatus();
    },

    resume_queue: async () => {
      if (!renderQueue.isRendering || !renderQueue.isPaused) throw new McpToolError('The queue is not paused.');
      await ops.resumeRender();
      return queueStatus();
    },

    stop_queue: async () => {
      if (!renderQueue.isRendering) return { ...queueStatus(), note: 'Nothing was rendering.' };
      await ops.stopRender();
      return queueStatus();
    },
  };

  async function handleRequest({ id, method, params }: { id: number; method: string; params: any }) {
    try {
      const handler = handlers[method];
      if (!handler) throw new McpToolError(`Unknown request: ${method}`);
      const result = await handler(params || {});
      electron.mcpRespond({ id, ok: true, result: JSON.parse(JSON.stringify(result ?? null)) });
    } catch (e: any) {
      if (!(e instanceof McpToolError)) console.error(`[MCP] ${method} failed:`, e);
      electron.mcpRespond({ id, ok: false, error: e?.message || String(e) });
    }
  }

  // ============================================================ events

  // Events start once the page has restored the queue (ready()), not for the jobs it loads at startup
  let active = false;

  // Job status changes (sync: catch every transition, even several in one tick)
  const prevStatus = new Map<string, RenderJob['status']>();
  const prevInfo = new Map<string, { fileName: string; application: string }>();
  function snapshotJobs() {
    prevStatus.clear();
    prevInfo.clear();
    for (const j of renderQueue.jobs) {
      prevStatus.set(j.id, j.status);
      prevInfo.set(j.id, { fileName: j.fileName, application: j.applicationType });
    }
  }

  const stopStatusWatch = watch(
    () => renderQueue.jobs.map(j => `${j.id}|${j.status}`).join('\n'),
    () => {
      if (!active) return;
      const seen = new Set<string>();
      for (const job of renderQueue.jobs) {
        seen.add(job.id);
        const before = prevStatus.get(job.id);
        const now = job.status;
        prevInfo.set(job.id, { fileName: job.fileName, application: job.applicationType });
        if (before === now) continue;
        prevStatus.set(job.id, now);
        // The status is often set before the rest of the update (elapsed time, error...): describe the job
        // once the update is done. Microtasks keep the order (and run before the queue_* events' microtask).
        queueMicrotask(() => describeTransition(job, before, now));
      }
      for (const id of [...prevStatus.keys()]) {
        if (seen.has(id)) continue;
        prevStatus.delete(id);
        const info = prevInfo.get(id);
        prevInfo.delete(id);
        queueMicrotask(() => emitMcpEvent('job_removed', { jobId: id, ...(info || {}) }));
      }
    },
    { flush: 'sync' },
  );

  function describeTransition(job: RenderJob, before: RenderJob['status'] | undefined, now: RenderJob['status']) {
    const ref = { ...jobRef(job), status: now, previousStatus: before ?? null };
    if (before === undefined) { emitMcpEvent('job_added', ref); if (now === 'loading') return; }
    switch (now) {
      case 'idle':
        if (before === 'loading') emitMcpEvent('job_ready', { ...ref, frameRange: effectiveRange(job), outputPath: (job.appSettings as any)?.outputPath || job.outputPath });
        else if (before !== undefined && before !== 'missing-app') emitMcpEvent('job_reset', ref);
        break;
      case 'rendering':
        emitMcpEvent(before === 'paused' ? 'job_resumed' : 'job_started', { ...ref, frameRange: effectiveRange(job), frames: frameCount(job) });
        break;
      case 'paused':
        emitMcpEvent('job_paused', { ...ref, progress: round(job.progress) });
        break;
      case 'complete':
        emitMcpEvent('job_completed', {
          ...ref,
          elapsedMs: job.elapsedTime,
          frames: frameCount(job),
          outputPath: (job.appSettings as any)?.outputPath || job.outputPath,
          ...(job.failedFrames?.length ? { failedFrames: job.failedFrames, failedFramesError: job.failedFramesError } : {}),
        });
        break;
      case 'error':
        emitMcpEvent(before === 'loading' ? 'job_load_failed' : 'job_failed', { ...ref, error: job.error });
        break;
      case 'missing-app':
        emitMcpEvent('job_missing_app', { ...ref, error: job.error });
        break;
    }
  }

  // Progress (at most every 10 s per job)
  const lastProgressAt = new Map<string, number>();
  const stopProgressWatch = watch(
    () => renderQueue.currentJob ? `${renderQueue.currentJob.id}|${renderQueue.currentJob.currentFrame}` : '',
    () => {
      const job = renderQueue.currentJob;
      if (!active || !job || job.status !== 'rendering' || !job.currentFrame) return;
      const now = Date.now();
      if (now - (lastProgressAt.get(job.id) || 0) < PROGRESS_EVENT_INTERVAL_MS) return;
      lastProgressAt.set(job.id, now);
      emitMcpEvent('job_progress', {
        ...jobRef(job),
        progress: round(job.progress),
        framesDone: job.currentFrame,
        unitsTotal: job.totalFrames,
        currentFrameNumber: job.currentFrameNumber,
        estimatedTimeRemainingMs: job.estimatedTimeRemaining || null,
        queueEstimatedTimeRemainingMs: estimateRemainingMs(),
        queueEstimatedCompletionTime: isoIn(estimateRemainingMs()),
      });
    },
  );

  // Queue state. A finished queue is told apart from a stopped one by markQueueCompleted / setStopReason, which
  // the page calls in the same tick, so the decision waits for a microtask.
  let completion: Record<string, any> | null = null;
  let stopReason: string | null = null;
  let runScope: { scope: string; jobIds: string[] | null } | null = null;
  const stopQueueWatch = watch(
    () => [renderQueue.isRendering, renderQueue.isPaused] as const,
    ([rendering, paused], [wasRendering, wasPaused]) => {
      if (rendering && !wasRendering) {
        completion = null;
        stopReason = null;
        runScope = { scope: renderQueue.runJobIds ? 'selected-jobs' : 'queue', jobIds: renderQueue.runJobIds ? [...renderQueue.runJobIds] : null };
        if (active) emitMcpEvent('queue_started', { ...runScope, pendingJobs: renderQueue.runnablePendingJobs.length });
      } else if (!rendering && wasRendering) {
        const scope = runScope;
        queueMicrotask(() => {
          if (renderQueue.isRendering || !active) return; // restarted in the same tick
          if (completion) emitMcpEvent('queue_completed', { ...(scope || {}), ...completion });
          else emitMcpEvent('queue_stopped', { ...(scope || {}), reason: stopReason || 'stopped' });
          completion = null;
          stopReason = null;
        });
      } else if (active && rendering && paused && !wasPaused) {
        emitMcpEvent('queue_paused', { currentJob: renderQueue.currentJob ? jobRef(renderQueue.currentJob) : null });
      } else if (active && rendering && !paused && wasPaused) {
        emitMcpEvent('queue_resumed', { currentJob: renderQueue.currentJob ? jobRef(renderQueue.currentJob) : null });
      }
    },
    { flush: 'sync' },
  );

  // ============================================================ wiring

  onUnmounted(() => {
    active = false;
    stopStatusWatch();
    stopProgressWatch();
    stopQueueWatch();
    electron?.removeAllListeners?.('mcp-request');
    electron?.removeAllListeners?.('mcp-hello');
  });

  return {
    /** Start answering agents and reporting events (call once the queue and installations are loaded) */
    ready() {
      snapshotJobs();
      active = true;
      if (electron?.onMcpRequest) {
        electron.removeAllListeners?.('mcp-request');
        electron.onMcpRequest(handleRequest);
        electron.removeAllListeners?.('mcp-hello');
        electron.onMcpHello?.(() => electron.mcpRendererReady());
        electron.mcpRendererReady();
      }
    },
    /** The run finished (every job it covered is done): the next stop is reported as queue_completed */
    markQueueCompleted(summary: Record<string, any>) {
      completion = summary;
    },
    /** Why rendering is about to stop: 'stopped' (user / agent) or 'error' (a job failed and the queue halted) */
    setStopReason(reason: 'stopped' | 'error') {
      stopReason = reason;
    },
  };
}
