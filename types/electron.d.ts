// Type definitions for the Electron API exposed to the renderer

import type { ApplicationType, AppInstallation } from './applications';

// Re-export for convenience
export type { ApplicationType, AppInstallation };

export interface BlenderInstallation {
  version: string;
  path: string;
  folder: string;
}

export interface BlendInfo {
  frameStart: number;
  frameEnd: number;
  fps: number;
  outputPath: string;
  outputDir: string;
  outputPattern: string;
  renderEngine: string;
  resolution: {
    x: number;
    y: number;
    percentage: number;
  };
  format: string;
}

// ============================================================
// MULTI-APPLICATION SCENE INFO
// ============================================================

export interface SceneInfo {
  success: boolean;
  applicationType?: ApplicationType;
  frameStart?: number;
  frameEnd?: number;
  fps?: number;
  outputPath?: string;
  outputDir?: string;
  outputPattern?: string;
  format?: string;
  isVideoOutput?: boolean;
  isDefaults?: boolean; // True if values are defaults (non-Blender)
  renderEngine?: string;
  resolution?: {
    x: number;
    y: number;
    percentage: number;
  };
  error?: string;
}

// ============================================================
// MULTI-APPLICATION RENDER PARAMS
// ============================================================

export interface AppRenderParams {
  appPath: string;
  sceneFile: string;
  frameRanges: string;
  jobId: string;
  appType?: ApplicationType;
  appSettings?: {
    // Cinema 4D
    take?: string;
    threads?: number;
    noGui?: boolean;
    // Houdini
    renderNode?: string;
    // After Effects
    composition?: string;
    renderSettings?: string;
    outputModule?: string;
    multiFrameRendering?: boolean;
    maxCpuPercent?: number;
    // Nuke
    writeNode?: string;
    continueOnError?: boolean;
    verbose?: number;
    cacheSize?: string;
  };
}

export interface ExistingFramesResult {
  exists: boolean;
  frames: Array<{
    frame: number;
    file: string;
  }>;
  error?: string;
}

export interface RenderParams {
  blenderPath: string;
  blendFile: string;
  frameRanges: string;
  jobId: string;
}

export interface RenderProgressData {
  jobId: string;
  frame: number;
  currentSample?: number;
  totalSamples?: number;
  currentTile?: number;
  totalTiles?: number;
  currentFrameIndex: number;
  totalFrames: number;
}

export interface FrameRenderedData {
  jobId: string;
  frame: number;
  outputPath: string;
  currentFrameIndex: number;
  totalFrames: number;
}

export interface RenderCompleteData {
  jobId: string;
}

export interface RenderErrorData {
  jobId: string;
  frame: number;
  error: string;
}

export interface SystemInfo {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  gpu: {
    name: string;
    usage: number;
    vram: {
      used: number;
      total: number;
      percentage: number;
    };
  };
}

export interface SaveQueueResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

export interface LoadQueueResult {
  success: boolean;
  queue?: any[];
  filePath?: string;
  canceled?: boolean;
  error?: string;
}

export interface ImageReadResult {
  success: boolean;
  data?: string;
  path?: string;
  error?: string;
}

export interface ElectronAPI {
  // ============================================================
  // MULTI-APPLICATION SUPPORT
  // ============================================================
  
  // App Detection (unified)
  findAppInstallations(appType: ApplicationType): Promise<AppInstallation[]>;
  findAllAppInstallations(): Promise<Record<ApplicationType, AppInstallation[]>>;
  
  // App-specific detection
  findBlenderInstallations(): Promise<BlenderInstallation[]>;
  findCinema4DInstallations(): Promise<AppInstallation[]>;
  findHoudiniInstallations(): Promise<AppInstallation[]>;
  findAfterEffectsInstallations(): Promise<AppInstallation[]>;
  findNukeInstallations(): Promise<AppInstallation[]>;
  
  // Browse (unified)
  browseAppPath(appType?: ApplicationType): Promise<string | null>;
  browseSceneFiles(appTypes?: ApplicationType[]): Promise<string[]>;
  
  // Scene Info (unified)
  getSceneInfo(params: { appPath: string; sceneFile: string; appType?: ApplicationType }): Promise<SceneInfo>;
  
  // Rendering (unified)
  startAppRender(params: AppRenderParams): Promise<{ success: boolean; error?: string }>;
  
  // ============================================================
  // LEGACY BLENDER-SPECIFIC
  // ============================================================
  browseBlenderPath(): Promise<string | null>;
  browseBlendFiles(): Promise<string[]>;
  getBlendInfo(params: { blenderPath: string; blendFile: string }): Promise<BlendInfo>;
  checkExistingFrames(params: {
    outputDir: string;
    outputPattern: string;
    frameStart: number;
    frameEnd: number;
  }): Promise<ExistingFramesResult>;
  startRender(params: RenderParams): Promise<{ success: boolean; error?: string }>;
  
  // ============================================================
  // RENDER CONTROL
  // ============================================================
  pauseRender(): Promise<{ success: boolean }>;
  resumeRender(): Promise<{ success: boolean }>;
  stopRender(): Promise<{ success: boolean }>;
  
  // ============================================================
  // SYSTEM
  // ============================================================
  getSystemInfo(): Promise<SystemInfo | null>;
  
  // ============================================================
  // QUEUE PERSISTENCE
  // ============================================================
  saveQueue(params: { queue: any[]; filePath?: string }): Promise<SaveQueueResult>;
  loadQueue(): Promise<LoadQueueResult>;
  autoSaveQueue(queue: any[]): Promise<{ success: boolean; error?: string }>;
  loadAutoSavedQueue(): Promise<{ success: boolean; queue: any[]; error?: string }>;
  
  // ============================================================
  // SETTINGS
  // ============================================================
  getSettings(): Promise<any>;
  saveSettings(settings: any): Promise<{ success: boolean }>;
  
  // ============================================================
  // NOTIFICATIONS
  // ============================================================
  showNotification(params: { title: string; message: string }): Promise<{ success: boolean }>;
  
  // ============================================================
  // FILES
  // ============================================================
  watchOutputDir(outputDir: string): Promise<{ success: boolean; error?: string }>;
  readImage(imagePath: string): Promise<ImageReadResult>;
  openInExplorer(filePath: string): Promise<{ success: boolean }>;
  
  // ============================================================
  // EXR LAYERS
  // ============================================================
  getExrLayers(params: { blenderPath?: string; exrPath: string }): Promise<{ success: boolean; layers?: string[]; error?: string }>;
  readExrLayer(params: { blenderPath?: string; exrPath: string; layer?: string }): Promise<ImageReadResult>;
  
  // ============================================================
  // VIDEO
  // ============================================================
  isVideoFile(filePath: string): Promise<boolean>;
  readVideo(videoPath: string): Promise<{ success: boolean; data?: string; error?: string }>;
  
  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  onRenderProgress(callback: (data: RenderProgressData) => void): void;
  onRenderComplete(callback: (data: RenderCompleteData) => void): void;
  onRenderError(callback: (data: RenderErrorData) => void): void;
  onRenderPaused(callback: (data: { jobId: string }) => void): void;
  onRenderOutput(callback: (data: { jobId: string; output: string }) => void): void;
  onFrameRendered(callback: (data: FrameRenderedData) => void): void;
  onNewFrameAvailable(callback: (data: { path: string; filename: string }) => void): void;
  
  // Remove listeners
  removeAllListeners(channel: string): void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
