const { ipcRenderer } = require('electron');

// Expose IPC functions to renderer
window.electronAPI = {
  // ============================================================
  // MULTI-APPLICATION SUPPORT
  // ============================================================
  
  // App Detection (unified)
  findAppInstallations: (appType) => ipcRenderer.invoke('find-app-installations', appType),
  findAllAppInstallations: () => ipcRenderer.invoke('find-all-app-installations'),
  
  // App-specific detection (legacy + direct)
  findBlenderInstallations: () => ipcRenderer.invoke('find-blender-installations'),
  findCinema4DInstallations: () => ipcRenderer.invoke('find-cinema4d-installations'),
  findHoudiniInstallations: () => ipcRenderer.invoke('find-houdini-installations'),
  findAfterEffectsInstallations: () => ipcRenderer.invoke('find-aftereffects-installations'),
  findNukeInstallations: () => ipcRenderer.invoke('find-nuke-installations'),
  findMayaInstallations: () => ipcRenderer.invoke('find-maya-installations'),
  
  // Browse (unified)
  browseAppPath: (appType) => ipcRenderer.invoke('browse-app-path', appType),
  browseSceneFiles: (appTypes) => ipcRenderer.invoke('browse-scene-files', appTypes),
  
  // Scene Info (unified)
  getSceneInfo: (params) => ipcRenderer.invoke('get-scene-info', params),
  
  // Rendering (unified)
  startAppRender: (params) => ipcRenderer.invoke('start-app-render', params),
  
  // ============================================================
  // LEGACY BLENDER-SPECIFIC (for backwards compatibility)
  // ============================================================
  browseBlenderPath: () => ipcRenderer.invoke('browse-blender-path'),
  browseBlendFiles: () => ipcRenderer.invoke('browse-blend-files'),
  getBlendInfo: (params) => ipcRenderer.invoke('get-blend-info', params),
  checkExistingFrames: (params) => ipcRenderer.invoke('check-existing-frames', params),
  startRender: (params) => ipcRenderer.invoke('start-render', params),
  
  // ============================================================
  // RENDER CONTROL
  // ============================================================
  pauseRender: () => ipcRenderer.invoke('pause-render'),
  resumeRender: () => ipcRenderer.invoke('resume-render'),
  stopRender: () => ipcRenderer.invoke('stop-render'),
  
  // ============================================================
  // SYSTEM
  // ============================================================
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getGpuCapabilities: () => ipcRenderer.invoke('get-gpu-capabilities'),
  setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),
  setTaskbarProgress: (progress) => ipcRenderer.invoke('set-taskbar-progress', progress),
  
  // ============================================================
  // QUEUE PERSISTENCE
  // ============================================================
  saveQueue: (params) => ipcRenderer.invoke('save-queue', params),
  loadQueue: () => ipcRenderer.invoke('load-queue'),
  autoSaveQueue: (queue) => ipcRenderer.invoke('auto-save-queue', queue),
  loadAutoSavedQueue: () => ipcRenderer.invoke('load-auto-saved-queue'),
  
  // ============================================================
  // SETTINGS
  // ============================================================
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // ============================================================
  // AUTO-UPDATE
  // ============================================================
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // ============================================================
  // NOTIFICATIONS
  // ============================================================
  showNotification: (params) => ipcRenderer.invoke('show-notification', params),
  
  // ============================================================
  // FILES
  // ============================================================
  watchOutputDir: (outputDir) => ipcRenderer.invoke('watch-output-dir', outputDir),
  readImage: (imagePath) => ipcRenderer.invoke('read-image', imagePath),
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),
  openFileWithDefaultApp: (filePath) => ipcRenderer.invoke('open-file-with-default-app', filePath),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  
  // ============================================================
  // EXR LAYERS
  // ============================================================
  getExrLayers: (params) => ipcRenderer.invoke('get-exr-layers', params),
  readExrLayer: (params) => ipcRenderer.invoke('read-exr-layer', params),
  
  // ============================================================
  // VIDEO
  // ============================================================
  isVideoFile: (filePath) => ipcRenderer.invoke('is-video-file', filePath),
  readVideo: (videoPath) => ipcRenderer.invoke('read-video', videoPath),
  
  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  onRenderProgress: (callback) => ipcRenderer.on('render-progress', (event, data) => callback(data)),
  onRenderComplete: (callback) => ipcRenderer.on('render-complete', (event, data) => callback(data)),
  onRenderError: (callback) => ipcRenderer.on('render-error', (event, data) => callback(data)),
  onRenderPaused: (callback) => ipcRenderer.on('render-paused', (event, data) => callback(data)),
  onRenderOutput: (callback) => ipcRenderer.on('render-output', (event, data) => callback(data)),
  onFrameRendered: (callback) => ipcRenderer.on('frame-rendered', (event, data) => callback(data)),
  onFramePreview: (callback) => ipcRenderer.on('frame-preview', (event, data) => callback(data)),
  onNewFrameAvailable: (callback) => ipcRenderer.on('new-frame-available', (event, data) => callback(data)),

  // Process + log monitoring
  getSpawnedProcesses: () => ipcRenderer.invoke('get-spawned-processes'),
  getSpawnedProcessLog: (processId) => ipcRenderer.invoke('get-spawned-process-log', processId),
  discardSpawnedProcess: (processId) => ipcRenderer.invoke('discard-spawned-process', processId),
  getAppLog: () => ipcRenderer.invoke('get-app-log'),
  onProcessUpdate: (callback) => ipcRenderer.on('process-update', (event, data) => callback(data)),
  onAppLog: (callback) => ipcRenderer.on('app-log', (event, data) => callback(data)),
  
  // Menu events
  onMenuSaveQueue: (callback) => ipcRenderer.on('menu-save-queue', (event, saveAs) => callback(saveAs)),
  onMenuLoadQueue: (callback) => ipcRenderer.on('menu-load-queue', () => callback()),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
};
