import { defineStore } from 'pinia';
import { 
  ApplicationType, 
  APPLICATION_INFO,
  type AppInstallation,
  type ApplicationRenderSettings,
} from '~/types/applications';

/**
 * Render job - supports all application types
 * Legacy alias: BlendJob is now RenderJob
 */
export interface RenderJob {
  id: string;
  filePath: string;
  fileName: string;
  
  // Application type
  applicationType: ApplicationType;
  
  // Per-job application executable override (optional)
  appExecutablePath?: string;
  
  // Frame range
  frameRanges: string;
  useCustomFrameRange: boolean;
  originalFrameStart: number;
  originalFrameEnd: number;
  
  // Output settings
  outputPath: string;
  outputDir: string;
  format: string;
  resolution: {
    x: number;
    y: number;
    percentage: number;
  };
  fps: number;
  
  // Render engine (Blender-specific, but kept for compatibility)
  renderEngine: string;
  
  // Status
  status: 'idle' | 'rendering' | 'paused' | 'complete' | 'error' | 'missing-app' | 'loading';
  progress: number;
  currentFrame: number;
  totalFrames: number;
  elapsedTime: number;
  estimatedTimeRemaining: number;
  lastRenderedFrame: string | null;
  error: string | null;
  renderStartTime: number | null;
  frameTimes: number[];
  
  // Output type
  isVideoOutput: boolean;
  renderedFramePaths: string[];
  exrLayers: string[];
  
  // Application-specific settings
  appSettings?: ApplicationRenderSettings;
  
  // App-specific fields
  // Cinema 4D
  takeName?: string;
  // Houdini
  renderNode?: string;
  // After Effects
  composition?: string;
  renderSettingsTemplate?: string;
  outputModuleTemplate?: string;
  // Nuke
  writeNode?: string;
}

// Legacy type alias for backwards compatibility
export type BlendJob = RenderJob;

export interface RenderQueueState {
  jobs: RenderJob[];
  currentJobIndex: number;
  isRendering: boolean;
  isPaused: boolean;
  
  // Legacy - kept for backwards compatibility
  blenderPath: string;
  blenderInstallations: { version: string; path: string; folder: string }[];
  
  // Multi-application installations
  appInstallations: Record<ApplicationType, AppInstallation[]>;
  
  totalProgress: number;
  totalEstimatedTime: number;
  previewImage: string | null;
  previewPath: string | null;
  
  // Queue file state
  currentQueueFile: string | null;
  hasUnsavedChanges: boolean;
  
  // Selection state
  selectedJobId: string | null;
  isSequencePlayback: boolean;
  sequencePlaybackFrame: number;
  selectedExrLayer: string | null;
}

export const useRenderQueueStore = defineStore('renderQueue', {
  state: (): RenderQueueState => ({
    jobs: [],
    currentJobIndex: -1,
    isRendering: false,
    isPaused: false,
    
    // Legacy
    blenderPath: '',
    blenderInstallations: [],
    
    // Multi-app installations
    appInstallations: {
      [ApplicationType.BLENDER]: [],
      [ApplicationType.CINEMA4D]: [],
      [ApplicationType.HOUDINI]: [],
      [ApplicationType.AFTER_EFFECTS]: [],
      [ApplicationType.NUKE]: [],
    },
    
    totalProgress: 0,
    totalEstimatedTime: 0,
    previewImage: null,
    previewPath: null,
    
    // Queue file
    currentQueueFile: null,
    hasUnsavedChanges: false,
    
    // Selection
    selectedJobId: null,
    isSequencePlayback: false,
    sequencePlaybackFrame: 0,
    selectedExrLayer: null,
  }),

  getters: {
    hasJobs: (state) => state.jobs.length > 0,
    
    currentJob: (state): RenderJob | null => {
      if (state.currentJobIndex >= 0 && state.currentJobIndex < state.jobs.length) {
        return state.jobs[state.currentJobIndex];
      }
      return null;
    },

    // The job currently selected for preview (or current rendering job if none selected)
    selectedJob: (state): RenderJob | null => {
      if (state.selectedJobId) {
        return state.jobs.find(j => j.id === state.selectedJobId) || null;
      }
      // Default to current rendering job
      if (state.currentJobIndex >= 0 && state.currentJobIndex < state.jobs.length) {
        return state.jobs[state.currentJobIndex];
      }
      return null;
    },

    // The job whose preview should be shown
    previewJob: (state): RenderJob | null => {
      // If a job is selected, show its preview
      if (state.selectedJobId) {
        const job = state.jobs.find(j => j.id === state.selectedJobId);
        if (job) return job;
      }
      // Otherwise show the currently rendering job
      if (state.currentJobIndex >= 0 && state.currentJobIndex < state.jobs.length) {
        return state.jobs[state.currentJobIndex];
      }
      // Or the last completed job
      const completedJobs = state.jobs.filter(j => j.status === 'complete');
      if (completedJobs.length > 0) {
        return completedJobs[completedJobs.length - 1];
      }
      return null;
    },

    pendingJobs: (state) => state.jobs.filter(j => j.status === 'idle'),
    
    completedJobs: (state) => state.jobs.filter(j => j.status === 'complete'),
    
    errorJobs: (state) => state.jobs.filter(j => j.status === 'error'),
    
    missingAppJobs: (state) => state.jobs.filter(j => j.status === 'missing-app'),
    
    /**
     * Get installations for a specific application
     */
    getAppInstallations: (state) => (appType: ApplicationType): AppInstallation[] => {
      return state.appInstallations[appType] || [];
    },
    
    /**
     * Check if an application has any installations
     */
    hasAppInstallations: (state) => (appType: ApplicationType): boolean => {
      return (state.appInstallations[appType]?.length || 0) > 0;
    },
    
    /**
     * Get application info for a job
     */
    getJobAppInfo: () => (job: RenderJob) => {
      return APPLICATION_INFO[job.applicationType];
    },

    totalFramesToRender: (state) => {
      return state.jobs.reduce((total, job) => {
        // Skip jobs with missing applications
        if (job.status === 'missing-app') return total;
        const frames = parseFrameRanges(job.useCustomFrameRange ? job.frameRanges : `${job.originalFrameStart}-${job.originalFrameEnd}`);
        return total + frames.length;
      }, 0);
    },

    totalFramesRendered: (state) => {
      return state.jobs.reduce((total, job) => {
        // Skip jobs with missing applications
        if (job.status === 'missing-app') return total;
        if (job.status === 'complete') {
          const frames = parseFrameRanges(job.useCustomFrameRange ? job.frameRanges : `${job.originalFrameStart}-${job.originalFrameEnd}`);
          return total + frames.length;
        } else if (job.status === 'rendering' || job.status === 'paused') {
          return total + job.currentFrame;
        }
        return total;
      }, 0);
    },
  },

  actions: {
    generateId(): string {
      return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    addJob(jobData: Partial<RenderJob>) {
      const job: RenderJob = {
        id: jobData.id || this.generateId(),
        filePath: '',
        fileName: '',
        applicationType: ApplicationType.BLENDER, // Default, should be overridden
        frameRanges: '',
        useCustomFrameRange: false,
        originalFrameStart: 1,
        originalFrameEnd: 250,
        outputPath: '',
        outputDir: '',
        renderEngine: 'CYCLES',
        format: 'PNG',
        resolution: { x: 1920, y: 1080, percentage: 100 },
        fps: 24,
        status: 'idle',
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        elapsedTime: 0,
        estimatedTimeRemaining: 0,
        lastRenderedFrame: null,
        error: null,
        renderStartTime: null,
        frameTimes: [],
        isVideoOutput: false,
        renderedFramePaths: [],
        exrLayers: [],
        ...jobData,
      };

      // Calculate total frames
      const frameRange = job.useCustomFrameRange ? job.frameRanges : `${job.originalFrameStart}-${job.originalFrameEnd}`;
      const frames = parseFrameRanges(frameRange);
      job.totalFrames = frames.length;

      this.jobs.push(job);
      this.hasUnsavedChanges = true;
      this.autoSave();
    },

    removeJob(id: string) {
      const index = this.jobs.findIndex(j => j.id === id);
      if (index !== -1) {
        this.jobs.splice(index, 1);
        this.hasUnsavedChanges = true;
        this.autoSave();
      }
    },

    updateJob(id: string, updates: Partial<RenderJob>) {
      const job = this.jobs.find(j => j.id === id);
      if (job) {
        Object.assign(job, updates);
        
        // Recalculate total frames if frame range changed
        if (updates.frameRanges !== undefined || updates.useCustomFrameRange !== undefined) {
          const frameRange = job.useCustomFrameRange ? job.frameRanges : `${job.originalFrameStart}-${job.originalFrameEnd}`;
          const frames = parseFrameRanges(frameRange);
          job.totalFrames = frames.length;
        }
        
        this.autoSave();
      }
    },

    moveJob(fromIndex: number, toIndex: number) {
      const job = this.jobs.splice(fromIndex, 1)[0];
      this.jobs.splice(toIndex, 0, job);
      this.autoSave();
    },

    clearCompleted() {
      this.jobs = this.jobs.filter(j => j.status !== 'complete');
      this.autoSave();
    },

    clearAll() {
      this.jobs = [];
      this.currentJobIndex = -1;
      this.autoSave();
    },

    setBlenderPath(path: string) {
      this.blenderPath = path;
    },

    /**
     * Set installations for a specific application type
     */
    setAppInstallations(appType: ApplicationType, installations: AppInstallation[]) {
      this.appInstallations[appType] = installations;
      
      // Keep legacy blenderInstallations in sync
      if (appType === ApplicationType.BLENDER) {
        this.blenderInstallations = installations.map(i => ({
          version: i.version,
          path: i.path,
          folder: i.folder,
        }));
      }
    },
    
    /**
     * Update job status to missing-app if no installation found
     */
    validateJobApplications() {
      for (const job of this.jobs) {
        const hasInstallations = (this.appInstallations[job.applicationType]?.length || 0) > 0;
        const hasOverridePath = !!job.appExecutablePath;
        
        if (!hasInstallations && !hasOverridePath && job.status === 'idle') {
          job.status = 'missing-app';
          job.error = `${APPLICATION_INFO[job.applicationType].name} is not installed or not found`;
        } else if ((hasInstallations || hasOverridePath) && job.status === 'missing-app') {
          // Restore to idle if app is now available
          job.status = 'idle';
          job.error = null;
        }
      }
    },

    setBlenderInstallations(installations: { version: string; path: string; folder: string }[]) {
      this.blenderInstallations = installations;
      if (installations.length > 0 && !this.blenderPath) {
        this.blenderPath = installations[0].path;
      }
    },

    setPreview(imagePath: string | null, imageData: string | null) {
      this.previewPath = imagePath;
      this.previewImage = imageData;
    },

    selectJob(jobId: string | null) {
      // Exit sequence playback when selecting a different job
      if (this.selectedJobId !== jobId) {
        this.isSequencePlayback = false;
        this.sequencePlaybackFrame = 0;
      }
      this.selectedJobId = jobId;
      this.selectedExrLayer = null; // Reset layer selection
    },

    setSequencePlayback(isPlaying: boolean) {
      this.isSequencePlayback = isPlaying;
      if (!isPlaying) {
        this.sequencePlaybackFrame = 0;
      }
    },

    setSequenceFrame(frame: number) {
      this.sequencePlaybackFrame = frame;
    },

    setSelectedExrLayer(layer: string | null) {
      this.selectedExrLayer = layer;
    },

    addRenderedFrame(jobId: string, framePath: string) {
      const job = this.jobs.find(j => j.id === jobId);
      if (job) {
        if (!job.renderedFramePaths) {
          job.renderedFramePaths = [];
        }
        if (!job.renderedFramePaths.includes(framePath)) {
          job.renderedFramePaths.push(framePath);
        }
      }
    },

    setJobExrLayers(jobId: string, layers: string[]) {
      const job = this.jobs.find(j => j.id === jobId);
      if (job) {
        job.exrLayers = layers;
      }
    },

    updateTotalProgress() {
      const totalFrames = this.totalFramesToRender;
      const renderedFrames = this.totalFramesRendered;
      this.totalProgress = totalFrames > 0 ? (renderedFrames / totalFrames) * 100 : 0;

      // Calculate total estimated time
      let totalAvgFrameTime = 0;
      let frameTimeCount = 0;
      
      for (const job of this.jobs) {
        if (job.frameTimes.length > 0) {
          const avg = job.frameTimes.reduce((a, b) => a + b, 0) / job.frameTimes.length;
          totalAvgFrameTime += avg;
          frameTimeCount++;
        }
      }

      if (frameTimeCount > 0) {
        const avgFrameTime = totalAvgFrameTime / frameTimeCount;
        const remainingFrames = totalFrames - renderedFrames;
        this.totalEstimatedTime = remainingFrames * avgFrameTime;
      }
    },

    async autoSave() {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        // Filter out jobs that are still loading (incomplete)
        const queueData = this.jobs
          .filter(job => job.status !== 'loading')
          .map(job => ({
          id: job.id,
          filePath: job.filePath,
          fileName: job.fileName,
          applicationType: job.applicationType,
          appExecutablePath: job.appExecutablePath,
          frameRanges: job.frameRanges,
          useCustomFrameRange: job.useCustomFrameRange,
          originalFrameStart: job.originalFrameStart,
          originalFrameEnd: job.originalFrameEnd,
          outputPath: job.outputPath,
          outputDir: job.outputDir,
          renderEngine: job.renderEngine,
          format: job.format,
          resolution: {
            x: job.resolution.x,
            y: job.resolution.y,
            percentage: job.resolution.percentage,
          },
          fps: job.fps,
          status: job.status === 'rendering' || job.status === 'paused' || job.status === 'loading' ? 'idle' : job.status,
          progress: job.status === 'complete' ? 100 : 0,
          currentFrame: 0,
          totalFrames: job.totalFrames,
          elapsedTime: 0,
          estimatedTimeRemaining: 0,
          lastRenderedFrame: job.status === 'complete' ? job.lastRenderedFrame : null,
          error: job.status === 'missing-app' ? job.error : null,
          renderStartTime: null,
          frameTimes: [],
          isVideoOutput: job.isVideoOutput ?? false,
          renderedFramePaths: job.status === 'complete' ? (job.renderedFramePaths ?? []) : [],
          exrLayers: job.exrLayers ?? [],
          // App-specific settings
          appSettings: job.appSettings,
          takeName: job.takeName,
          renderNode: job.renderNode,
          composition: job.composition,
          renderSettingsTemplate: job.renderSettingsTemplate,
          outputModuleTemplate: job.outputModuleTemplate,
          writeNode: job.writeNode,
        }));
        
        try {
          // Convert reactive objects to plain objects for IPC serialization
          const plainQueueData = JSON.parse(JSON.stringify(queueData));
          await (window as any).electronAPI.autoSaveQueue(plainQueueData);
        } catch (error) {
          console.error('Failed to auto-save queue:', error);
        }
      }
    },

    async loadAutoSaved() {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const result = await (window as any).electronAPI.loadAutoSavedQueue();
        if (result.success && result.queue && result.queue.length > 0) {
          // Ensure all jobs have the new properties with defaults
          this.jobs = result.queue.map((job: any) => ({
            ...job,
            // Ensure application type exists (default to Blender for legacy files)
            applicationType: job.applicationType ?? ApplicationType.BLENDER,
            // New properties
            isVideoOutput: job.isVideoOutput ?? false,
            renderedFramePaths: job.renderedFramePaths ?? [],
            exrLayers: job.exrLayers ?? [],
            // App-specific fields
            appExecutablePath: job.appExecutablePath,
            appSettings: job.appSettings,
            takeName: job.takeName,
            renderNode: job.renderNode,
            composition: job.composition,
            renderSettingsTemplate: job.renderSettingsTemplate,
            outputModuleTemplate: job.outputModuleTemplate,
            writeNode: job.writeNode,
          }));
          
          // Validate that applications are available
          this.validateJobApplications();
        }
      }
    },

    startRendering() {
      this.isRendering = true;
      this.isPaused = false;
      
      // Find first pending job (skip missing-app jobs)
      const pendingIndex = this.jobs.findIndex(j => j.status === 'idle');
      if (pendingIndex !== -1) {
        this.currentJobIndex = pendingIndex;
      }
    },

    pauseRendering() {
      this.isPaused = true;
      if (this.currentJob) {
        this.updateJob(this.currentJob.id, { status: 'paused' });
      }
    },

    resumeRendering() {
      this.isPaused = false;
      if (this.currentJob && this.currentJob.status === 'paused') {
        this.updateJob(this.currentJob.id, { status: 'rendering' });
      }
    },

    stopRendering() {
      this.isRendering = false;
      this.isPaused = false;
      if (this.currentJob) {
        this.updateJob(this.currentJob.id, { status: 'idle', progress: 0, currentFrame: 0 });
      }
      this.currentJobIndex = -1;
    },

    completeCurrentJob() {
      if (this.currentJob) {
        this.updateJob(this.currentJob.id, { 
          status: 'complete', 
          progress: 100,
          elapsedTime: this.currentJob.renderStartTime 
            ? Date.now() - this.currentJob.renderStartTime 
            : 0
        });
      }

      // Move to next job
      const nextPendingIndex = this.jobs.findIndex((j, i) => i > this.currentJobIndex && j.status === 'idle');
      if (nextPendingIndex !== -1) {
        this.currentJobIndex = nextPendingIndex;
      } else {
        this.isRendering = false;
        this.currentJobIndex = -1;
      }

      this.updateTotalProgress();
    },

    errorCurrentJob(error: string) {
      if (this.currentJob) {
        this.updateJob(this.currentJob.id, { status: 'error', error });
      }
      this.isRendering = false;
      this.currentJobIndex = -1;
    },
  },
});

// Helper function to parse frame ranges
function parseFrameRanges(rangeString: string): number[] {
  if (!rangeString || rangeString.trim() === '') {
    return [];
  }
  
  const frames: number[] = [];
  const parts = rangeString.split(',').map(s => s.trim());
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = parseInt(startStr);
      const end = parseInt(endStr);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (!frames.includes(i)) {
            frames.push(i);
          }
        }
      }
    } else {
      const frame = parseInt(part);
      if (!isNaN(frame) && !frames.includes(frame)) {
        frames.push(frame);
      }
    }
  }
  
  return frames.sort((a, b) => a - b);
}
