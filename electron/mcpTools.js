/**
 * RenderQ MCP: tool and resource definitions shared by the in-app server (mcpServer.js) and the stdio
 * bridge (mcpBridge.js). The bridge answers tools/list from here, so an agent can start without RenderQ
 * running; RenderQ is only contacted (or launched) when a tool is called.
 *
 * No Electron or SDK imports in here.
 */

const SERVER_NAME = 'renderq';

const APP_TYPES = ['blender', 'cinema4d', 'houdini', 'aftereffects', 'nuke', 'maya'];

const JOB_STATUSES = ['idle', 'loading', 'rendering', 'paused', 'complete', 'error', 'missing-app'];

const EVENT_TYPES = [
  'job_added', 'job_ready', 'job_load_failed', 'job_removed', 'job_updated',
  'job_started', 'job_resumed', 'job_progress', 'job_paused', 'job_completed', 'job_failed', 'job_reset',
  'job_missing_app',
  'queue_started', 'queue_paused', 'queue_resumed', 'queue_stopped', 'queue_completed',
  'queue_loaded', 'queue_saved', 'queue_cleared',
];

/** Longest a wait_for_events call blocks: most MCP clients time a tool call out after 60 s */
const MAX_WAIT_SECONDS = 55;

const INSTRUCTIONS = `RenderQ is a desktop render queue for Blender, Cinema 4D, Houdini, After Effects, Nuke and Maya.
These tools drive the queue in the running RenderQ app (it is launched automatically if needed); the user sees every change live.

Typical workflow to render shots:
1. list_render_apps: check the needed application is installed.
2. add_jobs with absolute scene file paths (optionally a frame range / settings). RenderQ reads each scene's frame range, output path and settings.
3. Optionally update_job / move_jobs to adjust, then save_queue to keep a .json of the queue.
4. start_queue (everything pending) or render_jobs (only specific jobs).
5. Monitor with wait_for_events, passing the "cursor" from the previous response as "since"; it blocks until something happens (job finished, failed, queue completed...) or times out. get_queue_status gives progress and the estimated time remaining / completion time at any point.
6. On job_failed, read the error and get_render_log, fix (frame range, settings) and render_jobs again with reset: true.

Job ids look like "job_..." and stay stable while the job is in the queue. Frame ranges use the form "1-100", "1,5,10-20".
Jobs with status "idle" are pending; "complete"/"error" jobs are skipped by start_queue until reset_jobs puts them back to pending.`;

const jobIdsSchema = {
  type: 'array',
  items: { type: 'string' },
  minItems: 1,
  description: 'Job ids (from list_jobs / add_jobs)',
};

const existingFramesSchema = {
  type: 'string',
  enum: ['default', 'skip', 'overwrite'],
  description:
    'What to do with frames whose output files already exist. "default": Blender/Nuke follow each job\'s skipExisting setting (default skip), other apps render only the missing frames. "skip": only render missing frames. "overwrite": re-render every frame. Never prompts the user.',
};

const appSettingsSchema = {
  type: 'object',
  additionalProperties: true,
  description:
    'Per-job render setting overrides, merged into the job\'s current overrides (set a key to null to remove it). ' +
    'Common: outputPath (output path pattern, e.g. "D:/out/shot_####.exr"), resolution {x, y, percentage}. ' +
    'Blender: engine (CYCLES|BLENDER_EEVEE|BLENDER_EEVEE_NEXT|BLENDER_WORKBENCH), cyclesDevice (CPU|CUDA|OPTIX|HIP|ONEAPI|METAL), samples, viewLayers (string[]), splitViewLayers, chunkSize, skipExisting, allowPythonScripts, factoryStartup. ' +
    'Nuke: writes (Write node names to render), skipExisting, ignoreLoadErrors, chunkSize. ' +
    'Maya: renderer, camera, renderLayer. ' +
    'preRenderPython is only accepted when the user allows agent scripts in RenderQ settings.',
};

/** @type {Array<{name: string, title: string, description: string, inputSchema: object, annotations?: object}>} */
const TOOLS = [
  // ---------------------------------------------------------------- read
  {
    name: 'get_queue_status',
    title: 'Get queue status',
    description:
      'Overall state of the render queue: idle/rendering/paused, the job being rendered, overall progress, frames rendered, estimated time remaining and estimated completion time, job counts per status, the open queue file, and the current event cursor for wait_for_events.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'list_jobs',
    title: 'List jobs',
    description:
      'All jobs in the queue in render order, with id, file, application, status, progress, frame range, output path, estimated time remaining and any error.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'array',
          items: { type: 'string', enum: JOB_STATUSES },
          description: 'Only jobs with one of these statuses',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_job',
    title: 'Get job',
    description:
      'Full details of one job: scene settings read from the file (frame range, output, resolution, engine, view layers / Write nodes...), per-job overrides (appSettings), progress, timing, failed frames and recently rendered frame paths.',
    inputSchema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'list_render_apps',
    title: 'List render applications',
    description:
      'Which render applications RenderQ found on this machine, the executable each uses, and the scene file extensions each handles.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_render_log',
    title: 'Get render log',
    description:
      'Console output of the render processes RenderQ ran for a job (the most recent last). Use it to diagnose a failed job.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        maxChars: { type: 'integer', minimum: 500, maximum: 100000, description: 'Characters from the end of the log (default 8000)' },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },

  // ---------------------------------------------------------------- edit
  {
    name: 'add_jobs',
    title: 'Add scene files',
    description:
      'Add scene files to the queue (one job per file; the application is chosen by extension: .blend, .c4d, .hip/.hiplc/.hipnc, .aep/.aepx, .nk/.nknc/.nkind, .ma/.mb). RenderQ opens each file to read its frame range, output and settings; this waits for that (up to waitSeconds) and returns the new jobs. Jobs still reading report status "loading" and emit job_ready / job_load_failed when done.',
    inputSchema: {
      type: 'object',
      properties: {
        filePaths: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Absolute paths of scene files' },
        frameRanges: { type: 'string', description: 'Frame range for every added job instead of the scene\'s own, e.g. "1001-1100"' },
        appSettings: appSettingsSchema,
        position: {
          description: '"end" (default), "top", or a 0-based index to insert the new jobs at',
          anyOf: [{ type: 'string', enum: ['end', 'top'] }, { type: 'integer', minimum: 0 }],
        },
        waitSeconds: { type: 'number', minimum: 0, maximum: 50, description: 'How long to wait for the scenes to be read (default 45)' },
      },
      required: ['filePaths'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'update_job',
    title: 'Update job',
    description:
      'Change a job\'s settings (not while it is rendering). Only the fields given change. Returns the updated job.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        frameRanges: {
          type: ['string', 'null'],
          description: 'Custom frame range, e.g. "1-50,60,70-80"; null to go back to the scene\'s own range',
        },
        appSettings: appSettingsSchema,
        takeName: { type: ['string', 'null'], description: 'Cinema 4D take' },
        renderNode: { type: ['string', 'null'], description: 'Houdini ROP path, e.g. /out/karma1' },
        composition: { type: ['string', 'null'], description: 'After Effects composition' },
        appExecutablePath: {
          type: ['string', 'null'],
          description: 'Render with this executable instead of the global one (only when the user allows it in RenderQ settings); null to clear',
        },
      },
      required: ['jobId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'remove_jobs',
    title: 'Remove jobs',
    description: 'Remove jobs from the queue (output files are not touched). The job being rendered cannot be removed until it is stopped.',
    inputSchema: {
      type: 'object',
      properties: { jobIds: jobIdsSchema },
      required: ['jobIds'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'move_jobs',
    title: 'Reorder jobs',
    description: 'Move jobs (keeping their relative order) to the top or bottom of the queue, one place up or down, or to a 0-based index.',
    inputSchema: {
      type: 'object',
      properties: {
        jobIds: jobIdsSchema,
        position: {
          description: '"top", "bottom", "up", "down", or a 0-based index',
          anyOf: [{ type: 'string', enum: ['top', 'bottom', 'up', 'down'] }, { type: 'integer', minimum: 0 }],
        },
      },
      required: ['jobIds', 'position'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'duplicate_job',
    title: 'Duplicate job',
    description: 'Copy a job (with its settings) to just below it, as a pending job. Useful to render the same scene with different frames or settings.',
    inputSchema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'reset_jobs',
    title: 'Reset jobs',
    description: 'Put finished, failed or paused jobs back to pending so they render again. Without jobIds, resets every complete and failed job.',
    inputSchema: {
      type: 'object',
      properties: { jobIds: jobIdsSchema },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'clear_queue',
    title: 'Clear queue',
    description: 'Remove completed jobs ("completed") or every job ("all", not while rendering).',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string', enum: ['completed', 'all'] } },
      required: ['scope'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },

  // ---------------------------------------------------------------- files
  {
    name: 'save_queue',
    title: 'Save queue file',
    description: 'Save the queue to a RenderQ queue .json file. Without filePath, saves over the queue file that is open.',
    inputSchema: {
      type: 'object',
      properties: { filePath: { type: 'string', description: 'Absolute path of the .json file to write' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'load_queue',
    title: 'Load queue file',
    description: 'Load a RenderQ queue .json file, replacing the queue (not while rendering) or appending its jobs.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute path of the .json file' },
        mode: { type: 'string', enum: ['replace', 'append'], description: 'Default "replace"' },
      },
      required: ['filePath'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },

  // ---------------------------------------------------------------- render control
  {
    name: 'start_queue',
    title: 'Start rendering the queue',
    description: 'Render every pending job in queue order. Returns at once; follow progress with wait_for_events / get_queue_status.',
    inputSchema: {
      type: 'object',
      properties: { existingFrames: existingFramesSchema },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'render_jobs',
    title: 'Render specific jobs',
    description:
      'Render only these jobs (in queue order), leaving the other pending jobs alone; rendering stops when they are done. If the queue is already rendering, they are added to the run. Returns at once.',
    inputSchema: {
      type: 'object',
      properties: {
        jobIds: jobIdsSchema,
        reset: { type: 'boolean', description: 'Re-render jobs that are complete or failed (default false: such jobs are an error)' },
        existingFrames: existingFramesSchema,
      },
      required: ['jobIds'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'pause_queue',
    title: 'Pause rendering',
    description: 'Pause the render (the render process is stopped; finished frames stay on disk). resume_queue continues the same job.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'resume_queue',
    title: 'Resume rendering',
    description: 'Resume a paused render.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'stop_queue',
    title: 'Stop rendering',
    description: 'Stop rendering. The current job goes back to pending (finished frames stay on disk).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },

  // ---------------------------------------------------------------- events
  {
    name: 'wait_for_events',
    title: 'Wait for queue events',
    description:
      `Return queue events newer than "since", waiting up to timeoutSeconds (max ${MAX_WAIT_SECONDS}) for one to happen if there are none yet. ` +
      'Event types: ' + EVENT_TYPES.join(', ') + '. ' +
      'Pass the returned "cursor" as "since" next time so no event is missed. Without "since", waits for events after now. ' +
      'Also returns a short queue status. Call it in a loop to monitor a render until queue_completed / queue_stopped.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'integer', minimum: 0, description: 'Cursor from a previous wait_for_events / get_queue_status' },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only these event types; a trailing * matches a prefix, e.g. "queue_*"',
        },
        jobIds: { type: 'array', items: { type: 'string' }, description: 'Only events about these jobs (queue events are always included)' },
        timeoutSeconds: { type: 'number', minimum: 0, maximum: MAX_WAIT_SECONDS, description: 'Default 30; 0 returns at once' },
        maxEvents: { type: 'integer', minimum: 1, maximum: 500, description: 'Default 100' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

const RESOURCES = [
  {
    uri: 'renderq://queue/status',
    name: 'queue-status',
    title: 'Render queue status',
    description: 'Same as get_queue_status. Subscribe to be notified when it changes.',
    mimeType: 'application/json',
  },
  {
    uri: 'renderq://queue/jobs',
    name: 'queue-jobs',
    title: 'Render queue jobs',
    description: 'Same as list_jobs. Subscribe to be notified when it changes.',
    mimeType: 'application/json',
  },
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'renderq://jobs/{jobId}',
    name: 'job',
    title: 'Render job',
    description: 'Same as get_job.',
    mimeType: 'application/json',
  },
];

const SERVER_CAPABILITIES = {
  tools: { listChanged: false },
  resources: { subscribe: true, listChanged: false },
  logging: {},
};

module.exports = {
  SERVER_NAME,
  APP_TYPES,
  JOB_STATUSES,
  EVENT_TYPES,
  MAX_WAIT_SECONDS,
  INSTRUCTIONS,
  TOOLS,
  RESOURCES,
  RESOURCE_TEMPLATES,
  SERVER_CAPABILITIES,
};
