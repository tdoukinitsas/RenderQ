const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const { spawn, exec, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const sharp = require('sharp');
const { autoUpdater } = require('electron-updater');

// Application type constants (mirroring types/applications.ts)
const ApplicationType = {
  BLENDER: 'blender',
  CINEMA4D: 'cinema4d',
  HOUDINI: 'houdini',
  AFTER_EFFECTS: 'aftereffects',
  NUKE: 'nuke',
};

// File extensions for each application
const APP_FILE_EXTENSIONS = {
  [ApplicationType.BLENDER]: ['.blend'],
  [ApplicationType.CINEMA4D]: ['.c4d'],
  [ApplicationType.HOUDINI]: ['.hip', '.hiplc', '.hipnc'],
  [ApplicationType.AFTER_EFFECTS]: ['.aep', '.aepx'],
  [ApplicationType.NUKE]: ['.nk', '.nknc'],
};

// Get all supported file extensions
const ALL_SUPPORTED_EXTENSIONS = Object.values(APP_FILE_EXTENSIONS).flat();

// Platform detection
const platform = process.platform; // 'win32', 'darwin', 'linux'

// Initialize persistent storage
const store = new Store({
  name: 'blender-render-queue',
  defaults: {
    blenderPath: '',
    applicationPaths: {
      [ApplicationType.BLENDER]: '',
      [ApplicationType.CINEMA4D]: '',
      [ApplicationType.HOUDINI]: '',
      [ApplicationType.AFTER_EFFECTS]: '',
      [ApplicationType.NUKE]: '',
    },
    queue: [],
    settings: {
      autoSave: true,
      notifications: true
    }
  }
});

// Temp file path for auto-save
const tempQueuePath = path.join(os.tmpdir(), 'renderq-temp.json');

let mainWindow;
let currentRenderProcess = null;
let isPaused = false;

// ============================================================
// SYSTEM MONITOR - Throttling and caching to prevent spawning multiple processes
// ============================================================

let systemInfoInProgress = false;
let cachedGpuInfo = null;
let cachedCpuModel = null;
let lastNvidiaSmiResult = null;
let nvidiaSmiPath = null; // Cache the path to nvidia-smi

// ============================================================
// PROCESS + APP LOG CAPTURE (for System Monitor tabs)
// ============================================================

const APP_LOG_MAX_LINES = 2000;
const appLogLines = [];

function appendAppLogLine(line) {
  if (!line) return;
  appLogLines.push(line);
  if (appLogLines.length > APP_LOG_MAX_LINES) {
    appLogLines.splice(0, appLogLines.length - APP_LOG_MAX_LINES);
  }
  mainWindow?.webContents?.send('app-log', { line });
}

// Wrap console so we can show logs in the UI (without breaking existing logging).
const _consoleLog = console.log.bind(console);
const _consoleWarn = console.warn.bind(console);
const _consoleError = console.error.bind(console);
console.log = (...args) => {
  try { appendAppLogLine(`[LOG] ${args.map(String).join(' ')}`); } catch (e) {}
  _consoleLog(...args);
};
console.warn = (...args) => {
  try { appendAppLogLine(`[WARN] ${args.map(String).join(' ')}`); } catch (e) {}
  _consoleWarn(...args);
};
console.error = (...args) => {
  try { appendAppLogLine(`[ERROR] ${args.map(String).join(' ')}`); } catch (e) {}
  _consoleError(...args);
};

const SPAWNED_PROC_LOG_MAX_CHARS = 200_000;
const spawnedProcesses = new Map();

function appendProcessLog(procId, chunk, stream) {
  const entry = spawnedProcesses.get(procId);
  if (!entry) return;
  const text = String(chunk || '');
  if (!text) return;
  entry.log += text;
  if (entry.log.length > SPAWNED_PROC_LOG_MAX_CHARS) {
    entry.log = entry.log.slice(entry.log.length - SPAWNED_PROC_LOG_MAX_CHARS);
  }
  entry.lastUpdate = Date.now();
  mainWindow?.webContents?.send('process-update', {
    id: entry.id,
    pid: entry.pid,
    name: entry.name,
    commandLine: entry.commandLine,
    status: entry.status,
    exitCode: entry.exitCode,
    signal: entry.signal,
    lastUpdate: entry.lastUpdate,
    logTail: entry.log.slice(-4000),
    stream,
  });
}

function spawnTracked(command, args, options, meta) {
  const id = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const commandLine = [command, ...(args || [])].join(' ');
  const entry = {
    id,
    pid: null,
    name: meta?.name || 'process',
    command,
    args: args || [],
    commandLine,
    cwd: options?.cwd || null,
    startedAt: Date.now(),
    endedAt: null,
    status: 'running',
    exitCode: null,
    signal: null,
    log: '',
    lastUpdate: Date.now(),
  };
  spawnedProcesses.set(id, entry);

  const proc = spawn(command, args, options);
  entry.pid = proc.pid;

  // Emit an initial update so the UI shows the process even if it produces no output.
  mainWindow?.webContents?.send('process-update', {
    id: entry.id,
    pid: entry.pid,
    name: entry.name,
    commandLine: entry.commandLine,
    status: entry.status,
    exitCode: entry.exitCode,
    signal: entry.signal,
    lastUpdate: entry.lastUpdate,
    logTail: entry.log.slice(-4000),
  });

  proc.stdout?.on('data', (d) => appendProcessLog(id, d, 'stdout'));
  proc.stderr?.on('data', (d) => appendProcessLog(id, d, 'stderr'));

  proc.on('close', (code, signal) => {
    const e = spawnedProcesses.get(id);
    if (!e) return;
    e.status = 'exited';
    e.exitCode = code;
    e.signal = signal;
    e.endedAt = Date.now();
    e.lastUpdate = Date.now();
    mainWindow?.webContents?.send('process-update', {
      id: e.id,
      pid: e.pid,
      name: e.name,
      commandLine: e.commandLine,
      status: e.status,
      exitCode: e.exitCode,
      signal: e.signal,
      lastUpdate: e.lastUpdate,
      logTail: e.log.slice(-4000),
    });
  });

  proc.on('error', (err) => {
    appendProcessLog(id, `\n[spawn error] ${err?.message || String(err)}\n`, 'stderr');
  });

  return proc;
}

function ensureDirSync(dirPath) {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeRmSync(targetPath) {
  if (!targetPath) return;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (e) {
    // ignore
  }
}

function makeTempDirSync(prefix) {
  const base = os.tmpdir();
  const safePrefix = String(prefix || 'renderq').replace(/[^a-z0-9_\-]/gi, '_');
  return fs.mkdtempSync(path.join(base, `${safePrefix}_`));
}

async function waitForStableFile(filePath, { timeoutMs = 3000, intervalMs = 150, stableIterations = 2 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  let stableCount = 0;
 
  while (Date.now() < deadline) {
    try {
      const stat = fs.statSync(filePath);
      const size = stat.size;
      if (size > 0 && size === lastSize) {
        stableCount += 1;
        if (stableCount >= stableIterations) return;
      } else {
        stableCount = 0;
      }
      lastSize = size;
    } catch (e) {
      // file may not exist yet
      stableCount = 0;
      lastSize = -1;
    }
 
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Check if we're in development mode
// Use ELECTRON_IS_DEV env var or check if we have .output/public
const isDev = process.env.ELECTRON_IS_DEV === '1' || 
  (process.env.NODE_ENV === 'development' && !fs.existsSync(path.join(__dirname, '../.output/public/index.html')));

console.log('Is Development:', isDev);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('app.isPackaged:', app.isPackaged);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'RenderQ',
    backgroundColor: '#161616',
    frame: true,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Load the generated static files
    let indexPath;
    if (app.isPackaged) {
      indexPath = path.join(process.resourcesPath, 'app', '.output', 'public', 'index.html');
    } else {
      indexPath = path.join(__dirname, '..', '.output', 'public', 'index.html');
    }
    
    console.log('Loading index from:', indexPath);
    console.log('File exists:', fs.existsSync(indexPath));
    
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      console.error('Index file not found at:', indexPath);
      mainWindow.loadURL(`data:text/html,<h1>Error: Build files not found</h1><p>Expected at: ${indexPath.replace(/\\/g, '/')}</p><p>Run npm run generate:electron first.</p>`);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Create native application menu
  createApplicationMenu();
}

function createApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            console.log('[Menu] Save');
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('menu-save-queue', false);
            } else {
              console.warn('[Menu] Save ignored: mainWindow not ready');
            }
          }
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            console.log('[Menu] Save As');
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('menu-save-queue', true);
            } else {
              console.warn('[Menu] Save As ignored: mainWindow not ready');
            }
          }
        },
        {
          label: 'Load...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            console.log('[Menu] Load');
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('menu-load-queue');
            } else {
              console.warn('[Menu] Load ignored: mainWindow not ready');
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================================
// AUTO-UPDATER SETUP
// ============================================================

function setupAutoUpdater() {
  // Configure auto-updater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    
    // Show dialog to ask user if they want to download
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail: 'Would you like to download and install it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available');
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`Download progress: ${Math.round(progressObj.percent)}%`);
    
    // Update taskbar progress on Windows
    if (mainWindow && process.platform === 'win32') {
      mainWindow.setProgressBar(progressObj.percent / 100);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    
    // Reset taskbar progress
    if (mainWindow && process.platform === 'win32') {
      mainWindow.setProgressBar(-1);
    }
    
    // Show dialog to ask user if they want to install now
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'The update will be installed when you quit the application. Would you like to restart now?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
  });

  // Check for updates (only in production)
  if (!isDev && app.isPackaged) {
    // Delay update check to not interfere with app startup
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Failed to check for updates:', err);
      });
    }, 5000);
  }
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

ipcMain.handle('get-app-log', async () => {
  return { success: true, lines: appLogLines.slice() };
});

ipcMain.handle('get-spawned-processes', async () => {
  const list = Array.from(spawnedProcesses.values()).map((p) => ({
    id: p.id,
    pid: p.pid,
    name: p.name,
    commandLine: p.commandLine,
    cwd: p.cwd,
    status: p.status,
    exitCode: p.exitCode,
    signal: p.signal,
    startedAt: p.startedAt,
    endedAt: p.endedAt,
    lastUpdate: p.lastUpdate,
    logTail: p.log.slice(-4000),
  }));
  return { success: true, processes: list };
});

ipcMain.handle('get-spawned-process-log', async (event, processId) => {
  const p = spawnedProcesses.get(processId);
  if (!p) return { success: false, error: 'Process not found' };
  return { success: true, log: p.log };
});

ipcMain.handle('discard-spawned-process', async (event, processId) => {
  spawnedProcesses.delete(processId);
  return { success: true };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ============================================================
// APPLICATION DETECTION CONFIGURATIONS
// ============================================================

/**
 * Installation search paths for each application per platform
 */
const APP_INSTALL_PATHS = {
  [ApplicationType.BLENDER]: {
    win32: [
      'C:\\Program Files\\Blender Foundation',
      'C:\\Program Files (x86)\\Blender Foundation',
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Blender Foundation` : null,
    ].filter(Boolean),
    darwin: [
      '/Applications',
      `${os.homedir()}/Applications`,
    ],
    linux: [
      '/usr/bin',
      '/usr/local/bin',
      '/opt',
      '/snap/bin',
      `${os.homedir()}/blender`,
    ],
  },
  [ApplicationType.CINEMA4D]: {
    win32: [
      'C:\\Program Files\\Maxon',
      'C:\\Program Files',
      'C:\\Program Files (x86)\\Maxon',
    ],
    darwin: [
      '/Applications',
      '/Applications/Maxon',
    ],
    linux: [], // Cinema 4D doesn't officially support Linux
  },
  [ApplicationType.HOUDINI]: {
    win32: [
      'C:\\Program Files\\Side Effects Software',
    ],
    darwin: [
      '/Applications',
    ],
    linux: [
      '/opt',
      '/usr/local',
    ],
  },
  [ApplicationType.AFTER_EFFECTS]: {
    win32: [
      'C:\\Program Files\\Adobe',
      'C:\\Program Files (x86)\\Adobe',
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Adobe` : null,
    ].filter(Boolean),
    darwin: [
      '/Applications',
      '/Applications/Adobe',
    ],
    linux: [], // After Effects doesn't support Linux
  },
  [ApplicationType.NUKE]: {
    win32: [
      'C:\\Program Files',
      'C:\\Program Files (x86)',
      'C:\\Program Files\\The Foundry',
      'C:\\Program Files (x86)\\The Foundry',
    ],
    darwin: [
      '/Applications',
    ],
    linux: [
      '/usr/local',
      '/opt',
      '/usr/local/Nuke',
    ],
  },
  [ApplicationType.MAYA]: {
    win32: [
      'C:\\Program Files\\Autodesk',
      'C:\\Program Files (x86)\\Autodesk',
    ],
    darwin: [
      '/Applications/Autodesk',
      '/Applications',
    ],
    linux: [
      '/usr/autodesk',
      '/opt/autodesk',
    ],
  },
};

/**
 * Get application type from file extension
 */
function getAppTypeFromExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [appType, extensions] of Object.entries(APP_FILE_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return appType;
    }
  }
  return null;
}

/**
 * Compare version strings
 */
function compareVersions(a, b) {
  const vA = a.split(/[.\-v]/).filter(s => /^\d+$/.test(s)).map(Number);
  const vB = b.split(/[.\-v]/).filter(s => /^\d+$/.test(s)).map(Number);
  for (let i = 0; i < Math.max(vA.length, vB.length); i++) {
    if ((vA[i] || 0) !== (vB[i] || 0)) {
      return (vB[i] || 0) - (vA[i] || 0);
    }
  }
  return 0;
}

// IPC Handlers

// ============================================================
// APPLICATION DETECTION HANDLERS
// ============================================================

/**
 * Find Blender installations (cross-platform)
 */
async function findBlenderInstallations() {
  const installations = [];
  const searchPaths = APP_INSTALL_PATHS[ApplicationType.BLENDER][platform] || [];
  
  console.log('[Blender Detection] Platform:', platform);
  console.log('[Blender Detection] Search paths:', searchPaths);
  
  for (const basePath of searchPaths) {
    try {
      if (!fs.existsSync(basePath)) {
        console.log('[Blender Detection] Path does not exist:', basePath);
        continue;
      }
      
      console.log('[Blender Detection] Scanning:', basePath);
      
      if (platform === 'win32') {
        // Windows: Look for Blender Foundation folder structure
        const dirs = fs.readdirSync(basePath);
        console.log('[Blender Detection] Found directories:', dirs);
        for (const dir of dirs) {
          const blenderExe = path.join(basePath, dir, 'blender.exe');
          console.log('[Blender Detection] Checking for:', blenderExe);
          if (fs.existsSync(blenderExe)) {
            const versionMatch = dir.match(/Blender\s*([\d.]+)/i);
            console.log('[Blender Detection] Found Blender:', blenderExe, 'Version:', versionMatch ? versionMatch[1] : dir);
            installations.push({
              type: ApplicationType.BLENDER,
              version: versionMatch ? versionMatch[1] : dir,
              path: blenderExe,
              folder: dir,
            });
          }
        }
      } else if (platform === 'darwin') {
        // macOS: Look for Blender.app
        const dirs = fs.readdirSync(basePath);
        for (const dir of dirs) {
          if (dir.toLowerCase().includes('blender') && dir.endsWith('.app')) {
            const blenderExe = path.join(basePath, dir, 'Contents/MacOS/Blender');
            if (fs.existsSync(blenderExe)) {
              const versionMatch = dir.match(/Blender\s*([\d.]+)/i);
              installations.push({
                type: ApplicationType.BLENDER,
                version: versionMatch ? versionMatch[1] : dir,
                path: blenderExe,
                folder: dir,
              });
            }
          }
        }
      } else if (platform === 'linux') {
        // Linux: Check for blender binary
        const blenderExe = path.join(basePath, 'blender');
        if (fs.existsSync(blenderExe)) {
          // Try to get version by running blender --version
          try {
            const { execSync } = require('child_process');
            const output = execSync(`"${blenderExe}" --version 2>/dev/null`, { encoding: 'utf8', timeout: 5000 });
            const versionMatch = output.match(/Blender\s*([\d.]+)/i);
            installations.push({
              type: ApplicationType.BLENDER,
              version: versionMatch ? versionMatch[1] : 'Unknown',
              path: blenderExe,
              folder: basePath,
            });
          } catch (e) {
            installations.push({
              type: ApplicationType.BLENDER,
              version: 'Unknown',
              path: blenderExe,
              folder: basePath,
            });
          }
        }
        // Also check for versioned folders
        if (basePath === '/opt' || basePath.includes('blender')) {
          try {
            const dirs = fs.readdirSync(basePath);
            for (const dir of dirs) {
              if (dir.toLowerCase().includes('blender')) {
                const exePath = path.join(basePath, dir, 'blender');
                if (fs.existsSync(exePath)) {
                  const versionMatch = dir.match(/blender[\-_]?([\d.]+)/i);
                  installations.push({
                    type: ApplicationType.BLENDER,
                    version: versionMatch ? versionMatch[1] : dir,
                    path: exePath,
                    folder: dir,
                  });
                }
              }
            }
          } catch (e) {}
        }
      }
    } catch (error) {
      console.error(`Error searching ${basePath} for Blender:`, error);
    }
  }
  
  // Sort by version descending
  installations.sort((a, b) => compareVersions(a.version, b.version));
  return installations;
}

/**
 * Find Cinema 4D installations (cross-platform)
 */
async function findCinema4DInstallations() {
  const installations = [];
  const searchPaths = APP_INSTALL_PATHS[ApplicationType.CINEMA4D][platform] || [];
  
  for (const basePath of searchPaths) {
    try {
      if (!fs.existsSync(basePath)) continue;
      
      const dirs = fs.readdirSync(basePath);
      for (const dir of dirs) {
        if (!dir.toLowerCase().includes('cinema') && !dir.toLowerCase().includes('maxon')) continue;
        
        const fullPath = path.join(basePath, dir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        
        if (platform === 'win32') {
          // Look for Commandline.exe (preferred) or Cinema 4D.exe
          const commandLineExe = path.join(fullPath, 'Commandline.exe');
          const cinema4DExe = path.join(fullPath, 'Cinema 4D.exe');
          
          if (fs.existsSync(commandLineExe) || fs.existsSync(cinema4DExe)) {
            const versionMatch = dir.match(/Cinema\s*4D\s*(?:R|S|)(\d+(?:\.\d+)?)/i);
            installations.push({
              type: ApplicationType.CINEMA4D,
              version: versionMatch ? versionMatch[1] : dir,
              path: fs.existsSync(cinema4DExe) ? cinema4DExe : commandLineExe,
              commandLinePath: fs.existsSync(commandLineExe) ? commandLineExe : cinema4DExe,
              folder: dir,
            });
          }
          
          // Also check subdirectories (Maxon folder structure)
          try {
            const subDirs = fs.readdirSync(fullPath);
            for (const subDir of subDirs) {
              if (subDir.toLowerCase().includes('cinema')) {
                const subPath = path.join(fullPath, subDir);
                const cmdExe = path.join(subPath, 'Commandline.exe');
                const c4dExe = path.join(subPath, 'Cinema 4D.exe');
                
                if (fs.existsSync(cmdExe) || fs.existsSync(c4dExe)) {
                  const versionMatch = subDir.match(/Cinema\s*4D\s*(?:R|S|)(\d+(?:\.\d+)?)/i);
                  installations.push({
                    type: ApplicationType.CINEMA4D,
                    version: versionMatch ? versionMatch[1] : subDir,
                    path: fs.existsSync(c4dExe) ? c4dExe : cmdExe,
                    commandLinePath: fs.existsSync(cmdExe) ? cmdExe : c4dExe,
                    folder: subDir,
                  });
                }
              }
            }
          } catch (e) {}
        } else if (platform === 'darwin') {
          // Look for Cinema 4D.app
          if (dir.endsWith('.app') && dir.toLowerCase().includes('cinema')) {
            const c4dExe = path.join(fullPath, 'Contents/MacOS/Cinema 4D');
            const cmdExe = path.join(fullPath, 'Contents/MacOS/Commandline');
            
            if (fs.existsSync(c4dExe)) {
              const versionMatch = dir.match(/Cinema\s*4D\s*(?:R|S|)(\d+(?:\.\d+)?)/i);
              installations.push({
                type: ApplicationType.CINEMA4D,
                version: versionMatch ? versionMatch[1] : dir,
                path: c4dExe,
                commandLinePath: fs.existsSync(cmdExe) ? cmdExe : c4dExe,
                folder: dir,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error searching ${basePath} for Cinema 4D:`, error);
    }
  }
  
  installations.sort((a, b) => compareVersions(a.version, b.version));
  return installations;
}

/**
 * Find Houdini installations (cross-platform)
 */
async function findHoudiniInstallations() {
  const installations = [];
  const searchPaths = APP_INSTALL_PATHS[ApplicationType.HOUDINI][platform] || [];
  
  for (const basePath of searchPaths) {
    try {
      if (!fs.existsSync(basePath)) continue;
      
      const dirs = fs.readdirSync(basePath);
      for (const dir of dirs) {
        if (!dir.toLowerCase().includes('houdini') && !dir.toLowerCase().includes('side effects')) continue;
        
        const fullPath = path.join(basePath, dir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        
        if (platform === 'win32') {
          // Look for hbatch.exe in bin folder
          const hbatchExe = path.join(fullPath, 'bin', 'hbatch.exe');
          const houdiniExe = path.join(fullPath, 'bin', 'houdini.exe');
          
          if (fs.existsSync(hbatchExe) || fs.existsSync(houdiniExe)) {
            const versionMatch = dir.match(/Houdini\s*([\d.]+)/i);
            installations.push({
              type: ApplicationType.HOUDINI,
              version: versionMatch ? versionMatch[1] : dir,
              path: fs.existsSync(houdiniExe) ? houdiniExe : hbatchExe,
              commandLinePath: fs.existsSync(hbatchExe) ? hbatchExe : houdiniExe,
              folder: dir,
            });
          }
          
          // Also check subdirectories (Side Effects Software folder)
          try {
            const subDirs = fs.readdirSync(fullPath);
            for (const subDir of subDirs) {
              if (subDir.toLowerCase().includes('houdini')) {
                const subPath = path.join(fullPath, subDir);
                const hbatch = path.join(subPath, 'bin', 'hbatch.exe');
                const houdini = path.join(subPath, 'bin', 'houdini.exe');
                
                if (fs.existsSync(hbatch) || fs.existsSync(houdini)) {
                  const versionMatch = subDir.match(/Houdini\s*([\d.]+)/i);
                  installations.push({
                    type: ApplicationType.HOUDINI,
                    version: versionMatch ? versionMatch[1] : subDir,
                    path: fs.existsSync(houdini) ? houdini : hbatch,
                    commandLinePath: fs.existsSync(hbatch) ? hbatch : houdini,
                    folder: subDir,
                  });
                }
              }
            }
          } catch (e) {}
        } else if (platform === 'darwin') {
          // Look for Houdini framework
          const frameworkPath = path.join(fullPath, 'Frameworks/Houdini.framework/Versions/Current/Resources/bin');
          const hbatch = path.join(frameworkPath, 'hbatch');
          
          if (fs.existsSync(hbatch)) {
            const versionMatch = dir.match(/Houdini\s*([\d.]+)/i);
            installations.push({
              type: ApplicationType.HOUDINI,
              version: versionMatch ? versionMatch[1] : dir,
              path: path.join(frameworkPath, 'houdini'),
              commandLinePath: hbatch,
              folder: dir,
            });
          }
        } else if (platform === 'linux') {
          // Look for hbatch in bin folder
          const hbatch = path.join(fullPath, 'bin', 'hbatch');
          
          if (fs.existsSync(hbatch)) {
            const versionMatch = dir.match(/houdini[\-_]?([\d.]+)/i);
            installations.push({
              type: ApplicationType.HOUDINI,
              version: versionMatch ? versionMatch[1] : dir,
              path: path.join(fullPath, 'bin', 'houdini'),
              commandLinePath: hbatch,
              folder: dir,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error searching ${basePath} for Houdini:`, error);
    }
  }
  
  installations.sort((a, b) => compareVersions(a.version, b.version));
  return installations;
}

/**
 * Find After Effects installations (cross-platform)
 */
async function findAfterEffectsInstallations() {
  const installations = [];
  const searchPaths = Array.from(new Set(APP_INSTALL_PATHS[ApplicationType.AFTER_EFFECTS][platform] || []));
  const seen = new Set();
  
  console.log('[After Effects Detection] Platform:', platform);
  console.log('[After Effects Detection] Search paths:', searchPaths);
  
  for (const basePath of searchPaths) {
    try {
      if (!fs.existsSync(basePath)) {
        console.log('[After Effects Detection] Path does not exist:', basePath);
        continue;
      }
      
      console.log('[After Effects Detection] Scanning:', basePath);
      const dirs = fs.readdirSync(basePath);
      console.log('[After Effects Detection] Found directories:', dirs.filter(d => d.toLowerCase().includes('after') || d.toLowerCase().includes('effect')));
      
      for (const dir of dirs) {
        if (!dir.toLowerCase().includes('after effects')) continue;
        
        const fullPath = path.join(basePath, dir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        
        if (platform === 'win32') {
          // Look for aerender.exe in Support Files
          const aerenderExe = path.join(fullPath, 'Support Files', 'aerender.exe');
          const afterFxExe = path.join(fullPath, 'Support Files', 'AfterFX.exe');
          
          if (fs.existsSync(aerenderExe) || fs.existsSync(afterFxExe)) {
            const commandLinePath = fs.existsSync(aerenderExe) ? aerenderExe : afterFxExe;
            const guiPath = fs.existsSync(afterFxExe) ? afterFxExe : aerenderExe;
            const key = String(commandLinePath || guiPath).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const versionMatch = dir.match(/After\s*Effects\s*(?:CC\s*)?(\d{4}|\d+(?:\.\d+)?)/i);
            installations.push({
              type: ApplicationType.AFTER_EFFECTS,
              version: versionMatch ? versionMatch[1] : dir,
              path: guiPath,
              commandLinePath,
              folder: dir,
            });
          }
        } else if (platform === 'darwin') {
          // Look for Adobe After Effects app
          if (dir.endsWith('.app') || fs.existsSync(path.join(fullPath, 'Contents'))) {
            const aerender = path.join(fullPath, 'aerender');
            const afterFx = path.join(fullPath, 'Contents/MacOS/AfterFX');
            
            if (fs.existsSync(afterFx) || fs.existsSync(aerender)) {
              const commandLinePath = fs.existsSync(aerender) ? aerender : afterFx;
              const guiPath = fs.existsSync(afterFx) ? afterFx : aerender;
              const key = String(commandLinePath || guiPath).toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);

              const versionMatch = dir.match(/After\s*Effects\s*(?:CC\s*)?(\d{4}|\d+(?:\.\d+)?)/i);
              installations.push({
                type: ApplicationType.AFTER_EFFECTS,
                version: versionMatch ? versionMatch[1] : dir,
                path: guiPath,
                commandLinePath,
                folder: dir,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error searching ${basePath} for After Effects:`, error);
    }
  }
  
  installations.sort((a, b) => compareVersions(a.version, b.version));
  return installations;
}

/**
 * Find Nuke installations (cross-platform)
 */
async function findNukeInstallations() {
  const installations = [];
  const searchPaths = APP_INSTALL_PATHS[ApplicationType.NUKE][platform] || [];
  
  console.log('[Nuke Detection] Platform:', platform);
  console.log('[Nuke Detection] Search paths:', searchPaths);
  
  for (const basePath of searchPaths) {
    try {
      if (!fs.existsSync(basePath)) {
        console.log('[Nuke Detection] Path does not exist:', basePath);
        continue;
      }
      
      console.log('[Nuke Detection] Scanning:', basePath);
      const dirs = fs.readdirSync(basePath);
      const nukeRelated = dirs.filter(d => d.toLowerCase().includes('nuke'));
      console.log('[Nuke Detection] Found Nuke-related directories:', nukeRelated);
      
      for (const dir of dirs) {
        if (!dir.toLowerCase().includes('nuke')) continue;
        
        const fullPath = path.join(basePath, dir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        
        if (platform === 'win32') {
          // Look for Nuke*.exe
          const files = fs.readdirSync(fullPath);
          for (const file of files) {
            if (file.match(/^Nuke[\d.]+\.exe$/i)) {
              const nukeExe = path.join(fullPath, file);
              const versionMatch = file.match(/Nuke([\d.]+(?:v\d+)?)/i);
              installations.push({
                type: ApplicationType.NUKE,
                version: versionMatch ? versionMatch[1] : dir,
                path: nukeExe,
                commandLinePath: nukeExe,
                folder: dir,
              });
            }
          }
        } else if (platform === 'darwin') {
          // Look for Nuke app
          if (dir.endsWith('.app')) {
            const nukeBin = path.join(fullPath, 'Contents/MacOS');
            if (fs.existsSync(nukeBin)) {
              try {
                const files = fs.readdirSync(nukeBin);
                for (const file of files) {
                  if (file.match(/^Nuke[\d.]+$/i)) {
                    const nukeExe = path.join(nukeBin, file);
                    const versionMatch = file.match(/Nuke([\d.]+(?:v\d+)?)/i);
                    installations.push({
                      type: ApplicationType.NUKE,
                      version: versionMatch ? versionMatch[1] : dir,
                      path: nukeExe,
                      commandLinePath: nukeExe,
                      folder: dir,
                    });
                  }
                }
              } catch (e) {}
            }
          }
        } else if (platform === 'linux') {
          // Look for Nuke executable
          const files = fs.readdirSync(fullPath);
          for (const file of files) {
            if (file.match(/^Nuke[\d.]+$/i)) {
              const nukeExe = path.join(fullPath, file);
              const versionMatch = file.match(/Nuke([\d.]+(?:v\d+)?)/i);
              installations.push({
                type: ApplicationType.NUKE,
                version: versionMatch ? versionMatch[1] : dir,
                path: nukeExe,
                commandLinePath: nukeExe,
                folder: dir,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error searching ${basePath} for Nuke:`, error);
    }
  }
  
  installations.sort((a, b) => compareVersions(a.version, b.version));
  return installations;
}

/**
 * Find Maya installations (cross-platform)
 */
async function findMayaInstallations() {
  const installations = [];
  const searchPaths = APP_INSTALL_PATHS[ApplicationType.MAYA][platform] || [];
  
  console.log('[Maya Detection] Platform:', platform);
  console.log('[Maya Detection] Search paths:', searchPaths);
  
  for (const basePath of searchPaths) {
    try {
      if (!fs.existsSync(basePath)) {
        console.log('[Maya Detection] Path does not exist:', basePath);
        continue;
      }
      
      console.log('[Maya Detection] Scanning:', basePath);
      const dirs = fs.readdirSync(basePath);
      const mayaRelated = dirs.filter(d => d.toLowerCase().includes('maya'));
      console.log('[Maya Detection] Found Maya-related directories:', mayaRelated);
      
      for (const dir of dirs) {
        if (!dir.toLowerCase().includes('maya')) continue;
        
        const fullPath = path.join(basePath, dir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        
        if (platform === 'win32') {
          // Look for maya.exe in bin folder
          const mayaExe = path.join(fullPath, 'bin', 'maya.exe');
          const renderExe = path.join(fullPath, 'bin', 'Render.exe');
          
          if (fs.existsSync(mayaExe)) {
            const versionMatch = dir.match(/Maya\s*(\d{4}(?:\.\d+)?)/i);
            console.log('[Maya Detection] Found Maya:', mayaExe, 'Version:', versionMatch ? versionMatch[1] : dir);
            installations.push({
              type: ApplicationType.MAYA,
              version: versionMatch ? versionMatch[1] : dir,
              path: mayaExe,
              commandLinePath: fs.existsSync(renderExe) ? renderExe : mayaExe,
              folder: dir,
            });
          }
        } else if (platform === 'darwin') {
          // Look for Maya.app
          const mayaApp = path.join(fullPath, 'Maya.app');
          if (fs.existsSync(mayaApp)) {
            const mayaBin = path.join(mayaApp, 'Contents', 'MacOS', 'Maya');
            const renderBin = path.join(mayaApp, 'Contents', 'bin', 'Render');
            
            if (fs.existsSync(mayaBin)) {
              const versionMatch = dir.match(/Maya\s*(\d{4}(?:\.\d+)?)/i);
              installations.push({
                type: ApplicationType.MAYA,
                version: versionMatch ? versionMatch[1] : dir,
                path: mayaBin,
                commandLinePath: fs.existsSync(renderBin) ? renderBin : mayaBin,
                folder: dir,
              });
            }
          }
        } else if (platform === 'linux') {
          // Look for maya in bin folder
          const mayaBin = path.join(fullPath, 'bin', 'maya');
          const renderBin = path.join(fullPath, 'bin', 'Render');
          
          if (fs.existsSync(mayaBin)) {
            const versionMatch = dir.match(/maya(\d{4}(?:\.\d+)?)/i);
            installations.push({
              type: ApplicationType.MAYA,
              version: versionMatch ? versionMatch[1] : dir,
              path: mayaBin,
              commandLinePath: fs.existsSync(renderBin) ? renderBin : mayaBin,
              folder: dir,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error searching ${basePath} for Maya:`, error);
    }
  }
  
  installations.sort((a, b) => compareVersions(a.version, b.version));
  return installations;
}

/**
 * Find all installations for a specific application type
 */
async function findAppInstallations(appType) {
  switch (appType) {
    case ApplicationType.BLENDER:
      return findBlenderInstallations();
    case ApplicationType.CINEMA4D:
      return findCinema4DInstallations();
    case ApplicationType.HOUDINI:
      return findHoudiniInstallations();
    case ApplicationType.AFTER_EFFECTS:
      return findAfterEffectsInstallations();
    case ApplicationType.NUKE:
      return findNukeInstallations();
    case ApplicationType.MAYA:
      return findMayaInstallations();
    default:
      return [];
  }
}

/**
 * Find all installations for all application types
 */
async function findAllAppInstallations() {
  const result = {};
  for (const appType of Object.values(ApplicationType)) {
    result[appType] = await findAppInstallations(appType);
  }
  return result;
}

// Legacy handler - kept for backwards compatibility
ipcMain.handle('find-blender-installations', async () => {
  return findBlenderInstallations();
});

// Individual app installation handlers
ipcMain.handle('find-cinema4d-installations', async () => {
  return findCinema4DInstallations();
});

ipcMain.handle('find-houdini-installations', async () => {
  return findHoudiniInstallations();
});

ipcMain.handle('find-aftereffects-installations', async () => {
  return findAfterEffectsInstallations();
});

ipcMain.handle('find-nuke-installations', async () => {
  return findNukeInstallations();
});

ipcMain.handle('find-maya-installations', async () => {
  return findMayaInstallations();
});

// New unified handler for finding installations
ipcMain.handle('find-app-installations', async (event, appType) => {
  if (appType) {
    return findAppInstallations(appType);
  }
  return findAllAppInstallations();
});

// Browse for custom application path (any app type)
ipcMain.handle('browse-app-path', async (event, appType) => {
  const appNames = {
    [ApplicationType.BLENDER]: 'Blender',
    [ApplicationType.CINEMA4D]: 'Cinema 4D',
    [ApplicationType.HOUDINI]: 'Houdini',
    [ApplicationType.AFTER_EFFECTS]: 'After Effects',
    [ApplicationType.NUKE]: 'Nuke',
    [ApplicationType.MAYA]: 'Maya',
  };
  
  const filters = [];
  if (platform === 'win32') {
    filters.push({ name: 'Executable', extensions: ['exe'] });
  } else if (platform === 'darwin') {
    filters.push({ name: 'Application', extensions: ['app'] });
  }
  // Linux: no filter needed
  
  const result = await dialog.showOpenDialog(mainWindow, {
    title: `Select ${appNames[appType] || 'Application'} Executable`,
    filters,
    properties: ['openFile']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Legacy: Browse for custom Blender path
ipcMain.handle('browse-blender-path', async () => {
  const filters = [];
  if (platform === 'win32') {
    filters.push({ name: 'Executable', extensions: ['exe'] });
  }
  
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Blender Executable',
    filters,
    properties: ['openFile']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Browse for scene files (supports all application types)
ipcMain.handle('browse-scene-files', async () => {
  const allExtensions = ALL_SUPPORTED_EXTENSIONS.map(e => e.replace('.', ''));
  
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Scene Files',
    filters: [
      { name: 'All Supported Files', extensions: allExtensions },
      { name: 'Blender Files', extensions: ['blend'] },
      { name: 'Cinema 4D Files', extensions: ['c4d'] },
      { name: 'Houdini Files', extensions: ['hip', 'hiplc', 'hipnc'] },
      { name: 'After Effects Files', extensions: ['aep', 'aepx'] },
      { name: 'Nuke Files', extensions: ['nk', 'nknc'] },
    ],
    properties: ['openFile', 'multiSelections']
  });
  
  if (!result.canceled) {
    return result.filePaths;
  }
  return [];
});

// Legacy: Browse for blend files
ipcMain.handle('browse-blend-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Blend Files',
    filters: [{ name: 'Blender Files', extensions: ['blend'] }],
    properties: ['openFile', 'multiSelections']
  });
  
  if (!result.canceled) {
    return result.filePaths;
  }
  return [];
});

// Get blend file info (frame range, output path, etc.)
ipcMain.handle('get-blend-info', async (event, { blenderPath, blendFile }) => {
  return new Promise((resolve, reject) => {
    const pythonScript = `
import bpy
import json
import sys

scene = bpy.context.scene
output_path = bpy.path.abspath(scene.render.filepath)

# Get output directory
import os
output_dir = os.path.dirname(output_path)
output_pattern = os.path.basename(output_path)

# Check if output format is a video format
video_formats = ['FFMPEG', 'AVI_JPEG', 'AVI_RAW']
file_format = scene.render.image_settings.file_format
is_video_output = file_format in video_formats

info = {
    "frameStart": scene.frame_start,
    "frameEnd": scene.frame_end,
    "fps": scene.render.fps,
    "outputPath": output_path,
    "outputDir": output_dir,
    "outputPattern": output_pattern,
    "renderEngine": scene.render.engine,
    "resolution": {
        "x": scene.render.resolution_x,
        "y": scene.render.resolution_y,
        "percentage": scene.render.resolution_percentage
    },
    "format": file_format,
    "isVideoOutput": is_video_output
}

print("BLEND_INFO_JSON:" + json.dumps(info))
sys.stdout.flush()
sys.exit(0)
`;

    const tempPyPath = path.join(os.tmpdir(), `get_blend_info_${Date.now()}.py`);
    fs.writeFileSync(tempPyPath, pythonScript);

    // Disable addons to avoid loading errors
    const args = ['-b', blendFile, '--python-exit-code', '1', '--python', tempPyPath];
    const proc = spawnTracked(blenderPath, args, { 
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    }, { name: 'blender-scene-info' });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      // Wait a bit before deleting temp file
      setTimeout(() => {
        try {
          fs.unlinkSync(tempPyPath);
        } catch (e) {
          console.error('Failed to delete temp file:', e);
        }
      }, 100);

      const match = stdout.match(/BLEND_INFO_JSON:(.+)/);
      if (match) {
        try {
          const info = JSON.parse(match[1]);
          resolve(info);
        } catch (e) {
          reject(new Error('Failed to parse blend info'));
        }
      } else {
        // Extract useful error info, skip addon warnings
        const errorLines = stderr.split('\n').filter(line => 
          !line.includes('addon_utils.py') && 
          !line.includes('ModuleNotFoundError') &&
          !line.includes('ImportError') &&
          line.trim().length > 0
        ).slice(-5).join('\n');
        
        reject(new Error('Failed to get blend info: ' + (errorLines || 'Unknown error')));
      }
    });

    proc.on('error', (error) => {
      try {
        fs.unlinkSync(tempPyPath);
      } catch (e) {}
      reject(error);
    });
  });
});

// Check for existing frames in output directory
ipcMain.handle('check-existing-frames', async (event, { outputDir, outputPattern, frameStart, frameEnd }) => {
  const existingFrames = [];
  
  try {
    if (!fs.existsSync(outputDir)) {
      return { exists: false, frames: [] };
    }

    const files = fs.readdirSync(outputDir);
    
    // Extract the base pattern (remove # characters and get prefix)
    const hashMatch = outputPattern.match(/(#+)/);
    const padding = hashMatch ? hashMatch[1].length : 4;
    const prefix = outputPattern.split('#')[0];
    
    for (let frame = frameStart; frame <= frameEnd; frame++) {
      const frameStr = String(frame).padStart(padding, '0');
      const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${frameStr}`);
      
      for (const file of files) {
        if (pattern.test(file)) {
          existingFrames.push({
            frame,
            file: path.join(outputDir, file)
          });
          break;
        }
      }
    }
    
    return {
      exists: existingFrames.length > 0,
      frames: existingFrames
    };
  } catch (error) {
    console.error('Error checking existing frames:', error);
    return { exists: false, frames: [], error: error.message };
  }
});

// ============================================================
// UNIFIED SCENE INFO HANDLER
// ============================================================

/**
 * Get scene info for any supported application type
 * Returns basic info for non-Blender files (since we can't easily parse them)
 */
ipcMain.handle('get-scene-info', async (event, { appPath, sceneFile, appType }) => {
  // Determine app type from file extension if not provided
  const detectedAppType = appType || getAppTypeFromExtension(sceneFile);
  
  if (!detectedAppType) {
    return {
      success: false,
      error: 'Unknown file type',
    };
  }
  
  // For Blender, use the existing detailed info extraction
  if (detectedAppType === ApplicationType.BLENDER) {
    try {
      const info = await getBlenderSceneInfo(appPath, sceneFile);
      return {
        success: true,
        applicationType: ApplicationType.BLENDER,
        ...info,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  // For Maya, try to parse the scene file
  if (detectedAppType === ApplicationType.MAYA) {
    try {
      const info = await getMayaSceneInfo(sceneFile);
      return {
        success: true,
        applicationType: ApplicationType.MAYA,
        ...info,
      };
    } catch (error) {
      console.error('Error getting Maya scene info:', error);
      // Fall through to defaults
    }
  }
  
  // For other applications, return basic info
  // These apps don't have easy command-line scene inspection
  const fileName = path.basename(sceneFile);
  const outputDir = path.dirname(sceneFile);
  
  return {
    success: true,
    applicationType: detectedAppType,
    frameStart: 1,
    frameEnd: 250, // Default frame range
    fps: 24,
    outputPath: path.join(outputDir, 'render', fileName.replace(/\.[^.]+$/, '')),
    outputDir: path.join(outputDir, 'render'),
    outputPattern: fileName.replace(/\.[^.]+$/, '_####'),
    format: detectedAppType === ApplicationType.AFTER_EFFECTS ? 'PNG' : 'exr',
    isVideoOutput: false,
    // Mark as defaults so UI can prompt user
    isDefaults: true,
  };
});

/**
 * Helper: Get Blender scene info
 */
async function getBlenderSceneInfo(blenderPath, blendFile) {
  return new Promise((resolve, reject) => {
    const pythonScript = `
import bpy
import json
import sys

scene = bpy.context.scene
output_path = bpy.path.abspath(scene.render.filepath)

import os
output_dir = os.path.dirname(output_path)
output_pattern = os.path.basename(output_path)

video_formats = ['FFMPEG', 'AVI_JPEG', 'AVI_RAW']
file_format = scene.render.image_settings.file_format
is_video_output = file_format in video_formats

info = {
    "frameStart": scene.frame_start,
    "frameEnd": scene.frame_end,
    "fps": scene.render.fps,
    "outputPath": output_path,
    "outputDir": output_dir,
    "outputPattern": output_pattern,
    "renderEngine": scene.render.engine,
    "resolution": {
        "x": scene.render.resolution_x,
        "y": scene.render.resolution_y,
        "percentage": scene.render.resolution_percentage
    },
    "format": file_format,
    "isVideoOutput": is_video_output
}

print("BLEND_INFO_JSON:" + json.dumps(info))
sys.stdout.flush()
sys.exit(0)
`;

    const tempPyPath = path.join(os.tmpdir(), `get_blend_info_${Date.now()}.py`);
    fs.writeFileSync(tempPyPath, pythonScript);

    const args = ['-b', blendFile, '--python-exit-code', '1', '--python', tempPyPath];
    const proc = spawnTracked(blenderPath, args, { 
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    }, { name: 'blender-scene-info' });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      setTimeout(() => {
        try { fs.unlinkSync(tempPyPath); } catch (e) {}
      }, 100);

      const match = stdout.match(/BLEND_INFO_JSON:(.+)/);
      if (match) {
        try {
          resolve(JSON.parse(match[1]));
        } catch (e) {
          reject(new Error('Failed to parse blend info'));
        }
      } else {
        const errorLines = stderr.split('\n').filter(line => 
          !line.includes('addon_utils.py') && 
          !line.includes('ModuleNotFoundError') &&
          !line.includes('ImportError') &&
          line.trim().length > 0
        ).slice(-5).join('\n');
        
        reject(new Error('Failed to get blend info: ' + (errorLines || 'Unknown error')));
      }
    });

    proc.on('error', (error) => {
      try { fs.unlinkSync(tempPyPath); } catch (e) {}
      reject(error);
    });
  });
}

/**
 * Helper: Get Maya scene info from .ma files (Maya ASCII)
 * For .mb files (Maya Binary), we return defaults as we can't easily parse binary
 */
async function getMayaSceneInfo(sceneFile) {
  const ext = path.extname(sceneFile).toLowerCase();
  const fileName = path.basename(sceneFile);
  const outputDir = path.dirname(sceneFile);
  
  // Default info
  const defaultInfo = {
    frameStart: 1,
    frameEnd: 250,
    fps: 24,
    outputPath: path.join(outputDir, 'images', fileName.replace(/\.[^.]+$/, '')),
    outputDir: path.join(outputDir, 'images'),
    outputPattern: fileName.replace(/\.[^.]+$/, '_####'),
    format: 'exr',
    isVideoOutput: false,
  };
  
  // For .mb files, return defaults (binary format)
  if (ext === '.mb') {
    return { ...defaultInfo, isDefaults: true };
  }
  
  // For .ma files, parse the ASCII content
  try {
    const content = await fs.promises.readFile(sceneFile, 'utf8');
    
    // Parse render settings from Maya ASCII
    let frameStart = defaultInfo.frameStart;
    let frameEnd = defaultInfo.frameEnd;
    let fps = defaultInfo.fps;
    let renderer = 'arnold';
    let resolutionX = 1920;
    let resolutionY = 1080;
    
    // Frame range: setAttr ".fs" 1; setAttr ".ef" 100;
    const frameStartMatch = content.match(/setAttr\s+"\.fs"\s+(\d+)/);
    if (frameStartMatch) frameStart = parseInt(frameStartMatch[1]);
    
    const frameEndMatch = content.match(/setAttr\s+"\.ef"\s+(\d+)/);
    if (frameEndMatch) frameEnd = parseInt(frameEndMatch[1]);
    
    // FPS: playbackOptions -fps 24
    const fpsMatch = content.match(/playbackOptions.*?-fps\s+(\d+(?:\.\d+)?)/);
    if (fpsMatch) fps = parseFloat(fpsMatch[1]);
    
    // Renderer: currentRenderer "arnold"
    const rendererMatch = content.match(/currentRenderer\s+"([^"]+)"/);
    if (rendererMatch) renderer = rendererMatch[1];
    
    // Resolution: setAttr "defaultResolution.width" 1920; setAttr "defaultResolution.height" 1080;
    const resXMatch = content.match(/setAttr\s+"defaultResolution\.width"\s+(\d+)/);
    if (resXMatch) resolutionX = parseInt(resXMatch[1]);
    
    const resYMatch = content.match(/setAttr\s+"defaultResolution\.height"\s+(\d+)/);
    if (resYMatch) resolutionY = parseInt(resYMatch[1]);
    
    return {
      frameStart,
      frameEnd,
      fps,
      outputPath: defaultInfo.outputPath,
      outputDir: defaultInfo.outputDir,
      outputPattern: defaultInfo.outputPattern,
      renderEngine: renderer,
      resolution: {
        x: resolutionX,
        y: resolutionY,
        percentage: 100,
      },
      format: 'exr',
      isVideoOutput: false,
    };
  } catch (error) {
    console.error('Error parsing Maya ASCII file:', error);
    return { ...defaultInfo, isDefaults: true };
  }
}

// ============================================================
// MULTI-APPLICATION RENDER HANDLERS
// ============================================================

/**
 * Start rendering for any application type
 */
ipcMain.handle('start-app-render', async (event, { appPath, sceneFile, frameRanges, jobId, appType, appSettings }) => {
  // Determine app type from file extension if not provided
  const detectedAppType = appType || getAppTypeFromExtension(sceneFile);
  
  switch (detectedAppType) {
    case ApplicationType.BLENDER:
      return startBlenderRender({ appPath, sceneFile, frameRanges, jobId, appSettings });
    case ApplicationType.CINEMA4D:
      return startCinema4DRender({ appPath, sceneFile, frameRanges, jobId, appSettings });
    case ApplicationType.HOUDINI:
      return startHoudiniRender({ appPath, sceneFile, frameRanges, jobId, appSettings });
    case ApplicationType.AFTER_EFFECTS:
      return startAfterEffectsRender({ appPath, sceneFile, frameRanges, jobId, appSettings });
    case ApplicationType.NUKE:
      return startNukeRender({ appPath, sceneFile, frameRanges, jobId, appSettings });
    case ApplicationType.MAYA:
      return startMayaRender({ appPath, sceneFile, frameRanges, jobId, appSettings });
    default:
      return { success: false, error: 'Unknown application type' };
  }
});

/**
 * Start Blender render
 */
function startBlenderRender({ appPath, sceneFile, frameRanges, jobId, appSettings }) {
  console.log('[Blender Render] Starting with appSettings:', JSON.stringify(appSettings, null, 2));
  return new Promise((resolve, reject) => {
    isPaused = false;

    // Dedicated temp dir for the entire job to reduce cross-process temp interference.
    const renderTempDir = makeTempDirSync(`renderq_render_${jobId || 'job'}`);
    
    const frames = parseFrameRanges(frameRanges);
    let currentFrameIndex = 0;
    
    const renderNextFrame = () => {
      if (isPaused) {
        mainWindow.webContents.send('render-paused', { jobId });
        return;
      }
      
      if (currentFrameIndex >= frames.length) {
        mainWindow.webContents.send('render-complete', { jobId });
        currentRenderProcess = null;
        safeRmSync(renderTempDir);
        resolve({ success: true });
        return;
      }
      
      const frame = frames[currentFrameIndex];
      const args = ['-b', '--factory-startup', '--disable-autoexec', sceneFile];
      
      // Add render engine if specified
      if (appSettings?.engine) {
        console.log('[Blender Render] Using engine:', appSettings.engine);
        args.push('-E', appSettings.engine);
      }
      
      // Build Python expression for settings that need to be applied
      let pythonExprParts = [];
      
      // Add cycles device configuration via Python (required because --factory-startup resets preferences)
      console.log('[Blender Render] cyclesDevice:', appSettings?.cyclesDevice, 'engine:', appSettings?.engine);
      if (appSettings?.cyclesDevice && appSettings.cyclesDevice !== 'CPU' && (!appSettings?.engine || appSettings.engine === 'CYCLES')) {
        // Enable the compute device type in preferences and activate all devices
        const deviceType = appSettings.cyclesDevice.toUpperCase();
        pythonExprParts.push(
          `import bpy`,
          `prefs = bpy.context.preferences.addons['cycles'].preferences`,
          `prefs.compute_device_type = '${deviceType}'`,
          `prefs.get_devices()`,
          `[setattr(d, 'use', True) for d in prefs.devices if d.type == '${deviceType}' or d.type == 'CPU']`,
          `bpy.context.scene.cycles.device = 'GPU'`
        );
      }
      
      // Add resolution override
      if (appSettings?.resolution?.x && appSettings?.resolution?.y) {
        if (pythonExprParts.length === 0) {
          pythonExprParts.push(`import bpy`);
        }
        pythonExprParts.push(
          `bpy.context.scene.render.resolution_x = ${appSettings.resolution.x}`,
          `bpy.context.scene.render.resolution_y = ${appSettings.resolution.y}`,
          `bpy.context.scene.render.resolution_percentage = ${appSettings.resolution?.percentage || 100}`
        );
      }
      
      // Add the Python expression if we have any parts
      if (pythonExprParts.length > 0) {
        const pythonExpr = pythonExprParts.join('; ');
        console.log('[Blender Render] Python expression:', pythonExpr);
        args.push('--python-expr', pythonExpr);
      }
      
      console.log('[Blender Render] Final args:', args);
      
      // Add output path override if specified
      if (appSettings?.outputPath) {
        args.push('-o', appSettings.outputPath);
      }
      
      // Add frame to render
      args.push('-f', String(frame));
      
      currentRenderProcess = spawnTracked(appPath, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TEMP: renderTempDir,
          TMP: renderTempDir,
        },
      }, { name: `blender-render:${jobId || 'job'}` });

      let lastOutputPath = null;

      currentRenderProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        const savedMatch = output.match(/Saved:\s*'?([^'\n]+)'?/);
        if (savedMatch) {
          lastOutputPath = savedMatch[1].trim();
          mainWindow.webContents.send('frame-rendered', {
            jobId,
            frame,
            outputPath: lastOutputPath,
            currentFrameIndex,
            totalFrames: frames.length
          });
        }

        const sampleMatch = output.match(/Sample\s+(\d+)\/(\d+)/);
        if (sampleMatch) {
          mainWindow.webContents.send('render-progress', {
            jobId,
            frame,
            currentSample: parseInt(sampleMatch[1]),
            totalSamples: parseInt(sampleMatch[2]),
            currentFrameIndex,
            totalFrames: frames.length
          });
        }

        const tileMatch = output.match(/Rendered\s+(\d+)\/(\d+)\s+Tiles/);
        if (tileMatch) {
          mainWindow.webContents.send('render-progress', {
            jobId,
            frame,
            currentTile: parseInt(tileMatch[1]),
            totalTiles: parseInt(tileMatch[2]),
            currentFrameIndex,
            totalFrames: frames.length
          });
        }

        mainWindow.webContents.send('render-output', { jobId, output });
      });

      currentRenderProcess.stderr.on('data', (data) => {
        mainWindow.webContents.send('render-output', { jobId, output: data.toString() });
      });

      currentRenderProcess.on('close', (code) => {
        if (code === 0 || code === null) {
          // Generate EXR preview *between frames* to avoid running multiple Blender instances concurrently
          // (which has been observed to crash Blender on Windows with exit code 11).
          (async () => {
            try {
              if (lastOutputPath && String(lastOutputPath).toLowerCase().endsWith('.exr')) {
                await waitForStableFile(lastOutputPath, { timeoutMs: 5000, intervalMs: 200, stableIterations: 2 });
                const previewData = await convertExrToPngBase64(lastOutputPath, appPath, 'Combined');
                mainWindow?.webContents?.send('frame-preview', {
                  jobId,
                  outputPath: lastOutputPath,
                  data: previewData
                });
              }
            } catch (e) {
              // Preview failures should not fail the render.
              console.warn('[EXR Preview] Failed to generate preview:', e?.message || e);
            } finally {
              currentFrameIndex++;
              renderNextFrame();
            }
          })();
        } else if (!isPaused) {
          mainWindow.webContents.send('render-error', {
            jobId,
            frame,
            error: `Render process exited with code ${code}`
          });
          currentRenderProcess = null;
          safeRmSync(renderTempDir);
          resolve({ success: false, error: `Exit code: ${code}` });
        }
      });

      currentRenderProcess.on('error', (error) => {
        mainWindow.webContents.send('render-error', {
          jobId,
          frame,
          error: error.message
        });
        currentRenderProcess = null;
        safeRmSync(renderTempDir);
        reject(error);
      });
    };

    renderNextFrame();
  });
}

/**
 * Start Cinema 4D render
 */
function startCinema4DRender({ appPath, sceneFile, frameRanges, jobId, appSettings }) {
  return new Promise((resolve, reject) => {
    isPaused = false;
    
    const frames = parseFrameRanges(frameRanges);
    if (!frames || frames.length === 0) {
      mainWindow.webContents.send('render-error', {
        jobId,
        frame: 0,
        error: 'No frames to render (empty frame range)'
      });
      resolve({ success: false, error: 'Empty frame range' });
      return;
    }
    const frameStart = Math.min(...frames);
    const frameEnd = Math.max(...frames);
    
    // Cinema 4D command line: Commandline.exe -render "scene.c4d" -frame start end step
    const args = ['-render', sceneFile, '-frame', String(frameStart), String(frameEnd), '1'];
    
    // Add optional settings
    if (appSettings?.noGui !== false) {
      args.unshift('-nogui');
    }
    if (appSettings?.threads) {
      args.push('-threads', String(appSettings.threads));
    }
    if (appSettings?.take) {
      args.push('-take', appSettings.take);
    }

    // Log the exact command being executed
    try {
      mainWindow?.webContents?.send('render-output', {
        jobId,
        output: `[Cinema 4D] Spawning: ${appPath} ${args.join(' ')}\n`
      });
    } catch (e) {
      // ignore
    }
    
    currentRenderProcess = spawnTracked(appPath, args, {
      windowsHide: true,
      cwd: path.dirname(sceneFile),
      stdio: ['pipe', 'pipe', 'pipe']
    }, { name: 'cinema4d-render' });
    
    let currentFrame = frameStart;
    let lastOutputLine = '';
    let lastErrorLine = '';

    currentRenderProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.trim()) {
        const lines = output.trim().split(/\r?\n/);
        lastOutputLine = lines[lines.length - 1] || lastOutputLine;
      }
      
      // Parse progress from C4D output
      const frameMatch = output.match(/Rendering frame (\d+)/i);
      if (frameMatch) {
        currentFrame = parseInt(frameMatch[1]);
        mainWindow.webContents.send('render-progress', {
          jobId,
          frame: currentFrame,
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }
      
      // Check for saved frame
      const savedMatch = output.match(/Saved:\s*(.+)/i) || output.match(/Writing:\s*(.+)/i);
      if (savedMatch) {
        sawAnyOutput = true;
        mainWindow.webContents.send('frame-rendered', {
          jobId,
          frame: currentFrame,
          outputPath: savedMatch[1].trim(),
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }

      mainWindow.webContents.send('render-output', { jobId, output });
    });

    currentRenderProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.trim()) {
        const lines = output.trim().split(/\r?\n/);
        lastErrorLine = lines[lines.length - 1] || lastErrorLine;
      }
      mainWindow.webContents.send('render-output', { jobId, output });
    });

    currentRenderProcess.on('close', (code) => {
      if (code === 0 || code === null) {
        mainWindow.webContents.send('render-complete', { jobId });
        currentRenderProcess = null;
        resolve({ success: true });
      } else if (!isPaused) {
        const detail = lastErrorLine || lastOutputLine;
        mainWindow.webContents.send('render-error', {
          jobId,
          frame: currentFrame,
          error: `Render process exited with code ${code}${detail ? `: ${detail}` : ''}`
        });
        currentRenderProcess = null;
        resolve({ success: false, error: `Exit code: ${code}` });
      }
    });

    currentRenderProcess.on('error', (error) => {
      mainWindow.webContents.send('render-error', {
        jobId,
        frame: currentFrame,
        error: error.message
      });
      currentRenderProcess = null;
      reject(error);
    });
  });
}

/**
 * Start Houdini render
 */
function startHoudiniRender({ appPath, sceneFile, frameRanges, jobId, appSettings }) {
  return new Promise((resolve, reject) => {
    isPaused = false;
    
    const frames = parseFrameRanges(frameRanges);
    const frameStart = Math.min(...frames);
    const frameEnd = Math.max(...frames);
    
    // Use hbatch to render
    // hbatch command: hbatch -c "render -f start end rop_node" scene.hip
    const renderNode = appSettings?.renderNode || '/out/mantra1';
    const renderCommand = `render -f ${frameStart} ${frameEnd} ${renderNode}`;
    
    const args = ['-c', renderCommand, sceneFile];
    
    currentRenderProcess = spawnTracked(appPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    }, { name: 'houdini-render' });
    
    let currentFrame = frameStart;

    currentRenderProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Parse Houdini/Mantra progress
      const frameMatch = output.match(/Rendering frame (\d+)/i) || output.match(/Frame\s+(\d+)/i);
      if (frameMatch) {
        currentFrame = parseInt(frameMatch[1]);
        mainWindow.webContents.send('render-progress', {
          jobId,
          frame: currentFrame,
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }
      
      const savedMatch = output.match(/Writing image to:\s*(.+)/i) || output.match(/Saving:\s*(.+)/i);
      if (savedMatch) {
        mainWindow.webContents.send('frame-rendered', {
          jobId,
          frame: currentFrame,
          outputPath: savedMatch[1].trim(),
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }

      mainWindow.webContents.send('render-output', { jobId, output });
    });

    currentRenderProcess.stderr.on('data', (data) => {
      mainWindow.webContents.send('render-output', { jobId, output: data.toString() });
    });

    currentRenderProcess.on('close', (code) => {
      if (code === 0 || code === null) {
        mainWindow.webContents.send('render-complete', { jobId });
        currentRenderProcess = null;
        resolve({ success: true });
      } else if (!isPaused) {
        mainWindow.webContents.send('render-error', {
          jobId,
          frame: currentFrame,
          error: `Render process exited with code ${code}`
        });
        currentRenderProcess = null;
        resolve({ success: false, error: `Exit code: ${code}` });
      }
    });

    currentRenderProcess.on('error', (error) => {
      mainWindow.webContents.send('render-error', {
        jobId,
        frame: currentFrame,
        error: error.message
      });
      currentRenderProcess = null;
      reject(error);
    });
  });
}

/**
 * Start After Effects render
 */
function startAfterEffectsRender({ appPath, sceneFile, frameRanges, jobId, appSettings }) {
  return new Promise((resolve, reject) => {
    isPaused = false;
    
    const frames = parseFrameRanges(frameRanges);
    if (!frames || frames.length === 0) {
      mainWindow.webContents.send('render-error', {
        jobId,
        frame: 0,
        error: 'No frames to render (empty frame range)'
      });
      resolve({ success: false, error: 'Empty frame range' });
      return;
    }
    const frameStart = Math.min(...frames);
    const frameEnd = Math.max(...frames);
    
    // aerender command
    // Note: -s/-e are only reliably honored when rendering a specific comp / rq index.
    const args = ['-project', sceneFile];
    
    // Add optional settings
    if (appSettings?.composition) {
      args.push('-comp', appSettings.composition, '-s', String(frameStart), '-e', String(frameEnd));
    } else {
      // If no comp is specified, aerender renders the project's render queue.
      try {
        mainWindow?.webContents?.send('render-output', {
          jobId,
          output: `[After Effects] No comp specified; rendering project render queue.\n`
        });
      } catch (e) {
        // ignore
      }
    }
    if (appSettings?.renderSettings) {
      args.push('-RStemplate', appSettings.renderSettings);
    }
    if (appSettings?.outputModule) {
      args.push('-OMtemplate', appSettings.outputModule);
    }
    if (appSettings?.multiFrameRendering) {
      args.push('-mfr', 'ON', String(appSettings.maxCpuPercent || 100));
    }
    
    // Add verbose output
    args.push('-v', 'ERRORS_AND_PROGRESS');

    // Log the exact command being executed (helps diagnose AfterFX vs aerender)
    try {
      mainWindow?.webContents?.send('render-output', {
        jobId,
        output: `[After Effects] Spawning: ${appPath} ${args.join(' ')}\n`
      });
    } catch (e) {
      // ignore
    }
    
    currentRenderProcess = spawnTracked(appPath, args, {
      windowsHide: true,
      cwd: path.dirname(sceneFile),
      stdio: ['pipe', 'pipe', 'pipe']
    }, { name: 'aftereffects-render' });
    
    let currentFrame = frameStart;
    let didRenderAnything = false;
    let lastErrorLine = '';

    currentRenderProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.trim()) {
        // Any progress/output indicates the render actually started.
        if (/\bPROGRESS:\b/i.test(output) || /\bWriting:\b/i.test(output) || /\bSaved:\b/i.test(output) || /\bOutput To\b/i.test(output) || /\bFinished\b/i.test(output)) {
          didRenderAnything = true;
        }
      }
      
      // Parse AE progress
      const progressMatch = output.match(/PROGRESS:\s*(\d+):(\d+):(\d+):(\d+)/);
      if (progressMatch) {
        const frameInfo = output.match(/\((\d+)\)/);
        if (frameInfo) currentFrame = parseInt(frameInfo[1]);
        mainWindow.webContents.send('render-progress', {
          jobId,
          frame: currentFrame,
          currentFrameIndex: Math.max(0, currentFrame - frameStart),
          totalFrames: frames.length
        });
      }
      
      const savedMatch = output.match(/Writing:\s*(.+)/i) || output.match(/Finished Composition:\s*(.+)/i);
      if (savedMatch) {
        didRenderAnything = true;
        mainWindow.webContents.send('frame-rendered', {
          jobId,
          frame: currentFrame,
          outputPath: savedMatch[1].trim(),
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }

      mainWindow.webContents.send('render-output', { jobId, output });
    });

    currentRenderProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.trim()) {
        didRenderAnything = true;
        const lines = output.trim().split(/\r?\n/);
        lastErrorLine = lines[lines.length - 1] || lastErrorLine;
      }
      mainWindow.webContents.send('render-output', { jobId, output });
    });

    currentRenderProcess.on('close', (code) => {
      if (code === 0 || code === null) {
        if (!didRenderAnything && !isPaused) {
          mainWindow.webContents.send('render-error', {
            jobId,
            frame: currentFrame,
            error: 'After Effects exited successfully but produced no render output. Ensure the project has Render Queue items, or set a composition name in settings.'
          });
          currentRenderProcess = null;
          resolve({ success: false, error: 'No output' });
          return;
        }

        mainWindow.webContents.send('render-complete', { jobId });
        currentRenderProcess = null;
        resolve({ success: true });
      } else if (!isPaused) {
        mainWindow.webContents.send('render-error', {
          jobId,
          frame: currentFrame,
          error: `Render process exited with code ${code}${lastErrorLine ? `: ${lastErrorLine}` : ''}`
        });
        currentRenderProcess = null;
        resolve({ success: false, error: `Exit code: ${code}` });
      }
    });

    currentRenderProcess.on('error', (error) => {
      mainWindow.webContents.send('render-error', {
        jobId,
        frame: currentFrame,
        error: error.message
      });
      currentRenderProcess = null;
      reject(error);
    });
  });
}

/**
 * Start Nuke render
 */
function startNukeRender({ appPath, sceneFile, frameRanges, jobId, appSettings }) {
  return new Promise((resolve, reject) => {
    isPaused = false;
    
    const frames = parseFrameRanges(frameRanges);
    const frameStart = Math.min(...frames);
    const frameEnd = Math.max(...frames);
    
    // Nuke command: nuke -F start-end -x script.nk
    const args = ['-F', `${frameStart}-${frameEnd}`, '-x', sceneFile];
    
    // Add optional settings
    if (appSettings?.writeNode) {
      args.splice(3, 0, '-X', appSettings.writeNode);
    }
    if (appSettings?.continueOnError) {
      args.unshift('--cont');
    }
    if (appSettings?.verbose !== undefined) {
      args.unshift('-V', String(appSettings.verbose));
    }
    if (appSettings?.threads) {
      args.unshift('-m', String(appSettings.threads));
    }
    if (appSettings?.cacheSize) {
      args.unshift('-c', appSettings.cacheSize);
    }
    
    currentRenderProcess = spawnTracked(appPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    }, { name: 'nuke-render' });
    
    let currentFrame = frameStart;

    currentRenderProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Parse Nuke progress
      const frameMatch = output.match(/Frame\s+(\d+)/i) || output.match(/Writing\s+.*?(\d+)/i);
      if (frameMatch) {
        currentFrame = parseInt(frameMatch[1]);
        mainWindow.webContents.send('render-progress', {
          jobId,
          frame: currentFrame,
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }
      
      const savedMatch = output.match(/Writing\s+(.+)/i);
      if (savedMatch) {
        mainWindow.webContents.send('frame-rendered', {
          jobId,
          frame: currentFrame,
          outputPath: savedMatch[1].trim(),
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }

      mainWindow.webContents.send('render-output', { jobId, output });
    });

    currentRenderProcess.stderr.on('data', (data) => {
      mainWindow.webContents.send('render-output', { jobId, output: data.toString() });
    });

    currentRenderProcess.on('close', (code) => {
      if (code === 0 || code === null) {
        mainWindow.webContents.send('render-complete', { jobId });
        currentRenderProcess = null;
        resolve({ success: true });
      } else if (!isPaused) {
        mainWindow.webContents.send('render-error', {
          jobId,
          frame: currentFrame,
          error: `Render process exited with code ${code}`
        });
        currentRenderProcess = null;
        resolve({ success: false, error: `Exit code: ${code}` });
      }
    });

    currentRenderProcess.on('error', (error) => {
      mainWindow.webContents.send('render-error', {
        jobId,
        frame: currentFrame,
        error: error.message
      });
      currentRenderProcess = null;
      reject(error);
    });
  });
}

/**
 * Start Maya render
 */
function startMayaRender({ appPath, sceneFile, frameRanges, jobId, appSettings }) {
  return new Promise((resolve, reject) => {
    isPaused = false;
    
    const frames = parseFrameRanges(frameRanges);
    const frameStart = Math.min(...frames);
    const frameEnd = Math.max(...frames);
    
    // Maya Render command: Render -s startFrame -e endFrame sceneFile
    const args = ['-s', String(frameStart), '-e', String(frameEnd)];
    
    // Add optional settings
    if (appSettings?.renderer) {
      args.push('-r', appSettings.renderer);
    }
    if (appSettings?.camera) {
      args.push('-cam', appSettings.camera);
    }
    if (appSettings?.renderLayer) {
      args.push('-rl', appSettings.renderLayer);
    }
    if (appSettings?.verbose !== undefined) {
      args.push('-v', String(appSettings.verbose));
    }
    if (appSettings?.threads) {
      args.push('-n', String(appSettings.threads));
    }
    
    // Add scene file at the end
    args.push(sceneFile);
    
    currentRenderProcess = spawnTracked(appPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    }, { name: 'maya-render' });
    
    let currentFrame = frameStart;

    currentRenderProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Parse Maya progress - "Rendering frame X"
      const frameMatch = output.match(/(?:Rendering|Frame)\s+(\d+)/i);
      if (frameMatch) {
        currentFrame = parseInt(frameMatch[1]);
        mainWindow.webContents.send('render-progress', {
          jobId,
          frame: currentFrame,
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }
      
      // Parse percentage progress - "X% done"
      const percentMatch = output.match(/(\d+(?:\.\d+)?)\s*%/);
      if (percentMatch) {
        mainWindow.webContents.send('render-progress', {
          jobId,
          frame: currentFrame,
          percentage: parseFloat(percentMatch[1]),
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }
      
      // Parse output file
      const savedMatch = output.match(/(?:Result|Writing|Saved).*?:\s*(.+\.\w+)/i);
      if (savedMatch) {
        mainWindow.webContents.send('frame-rendered', {
          jobId,
          frame: currentFrame,
          outputPath: savedMatch[1].trim(),
          currentFrameIndex: currentFrame - frameStart,
          totalFrames: frames.length
        });
      }

      mainWindow.webContents.send('render-output', { jobId, output });
    });

    currentRenderProcess.stderr.on('data', (data) => {
      mainWindow.webContents.send('render-output', { jobId, output: data.toString() });
    });

    currentRenderProcess.on('close', (code) => {
      if (code === 0 || code === null) {
        mainWindow.webContents.send('render-complete', { jobId });
        currentRenderProcess = null;
        resolve({ success: true });
      } else if (!isPaused) {
        mainWindow.webContents.send('render-error', {
          jobId,
          frame: currentFrame,
          error: `Render process exited with code ${code}`
        });
        currentRenderProcess = null;
        resolve({ success: false, error: `Exit code: ${code}` });
      }
    });

    currentRenderProcess.on('error', (error) => {
      mainWindow.webContents.send('render-error', {
        jobId,
        frame: currentFrame,
        error: error.message
      });
      currentRenderProcess = null;
      reject(error);
    });
  });
}

// Legacy: Start rendering (Blender only)
ipcMain.handle('start-render', async (event, { blenderPath, blendFile, frameRanges, jobId }) => {
  return startBlenderRender({
    appPath: blenderPath,
    sceneFile: blendFile,
    frameRanges,
    jobId,
    appSettings: {}
  });
});

// Pause rendering
ipcMain.handle('pause-render', async () => {
  isPaused = true;
  if (currentRenderProcess) {
    // On Windows, we need to kill the process to pause
    // The state will be preserved and can be resumed
    currentRenderProcess.kill('SIGTERM');
  }
  return { success: true };
});

// Resume rendering
ipcMain.handle('resume-render', async () => {
  isPaused = false;
  return { success: true };
});

// Stop rendering
ipcMain.handle('stop-render', async () => {
  isPaused = false;
  if (currentRenderProcess) {
    // On Windows, we need to kill the process tree
    if (process.platform === 'win32') {
      try {
        exec(`taskkill /pid ${currentRenderProcess.pid} /T /F`);
      } catch (error) {
        console.error('Error killing process:', error);
      }
    } else {
      currentRenderProcess.kill('SIGKILL');
    }
    currentRenderProcess = null;
  }
  return { success: true };
});

// Get GPU capabilities for Blender Cycles
ipcMain.handle('get-gpu-capabilities', async () => {
  try {
    const si = require('systeminformation');
    const graphics = await si.graphics();
    
    const capabilities = {
      hasGpu: false,
      devices: [],
      supportedBackends: ['CPU'], // CPU is always available
    };
    
    for (const controller of graphics.controllers) {
      const vendor = (controller.vendor || '').toLowerCase();
      const model = controller.model || 'Unknown GPU';
      const vram = controller.vram || 0;
      
      if (vendor.includes('nvidia')) {
        capabilities.hasGpu = true;
        capabilities.devices.push({
          name: model,
          vendor: 'NVIDIA',
          vram,
          backends: ['CUDA', 'OPTIX'], // Modern NVIDIA cards support both
        });
        if (!capabilities.supportedBackends.includes('CUDA')) {
          capabilities.supportedBackends.push('CUDA');
        }
        if (!capabilities.supportedBackends.includes('OPTIX')) {
          capabilities.supportedBackends.push('OPTIX');
        }
      } else if (vendor.includes('amd') || vendor.includes('advanced micro')) {
        capabilities.hasGpu = true;
        capabilities.devices.push({
          name: model,
          vendor: 'AMD',
          vram,
          backends: ['HIP'],
        });
        if (!capabilities.supportedBackends.includes('HIP')) {
          capabilities.supportedBackends.push('HIP');
        }
      } else if (vendor.includes('intel')) {
        // Intel Arc GPUs support oneAPI
        if (model.toLowerCase().includes('arc') || vram > 512) {
          capabilities.hasGpu = true;
          capabilities.devices.push({
            name: model,
            vendor: 'Intel',
            vram,
            backends: ['ONEAPI'],
          });
          if (!capabilities.supportedBackends.includes('ONEAPI')) {
            capabilities.supportedBackends.push('ONEAPI');
          }
        }
      } else if (vendor.includes('apple')) {
        capabilities.hasGpu = true;
        capabilities.devices.push({
          name: model,
          vendor: 'Apple',
          vram,
          backends: ['METAL'],
        });
        if (!capabilities.supportedBackends.includes('METAL')) {
          capabilities.supportedBackends.push('METAL');
        }
      }
    }
    
    return capabilities;
  } catch (error) {
    console.error('Error detecting GPU capabilities:', error);
    return {
      hasGpu: false,
      devices: [],
      supportedBackends: ['CPU'],
    };
  }
});

// Get system info
ipcMain.handle('get-system-info', async () => {
  // Prevent overlapping calls - if already in progress, return cached data or null
  if (systemInfoInProgress) {
    return lastNvidiaSmiResult || null;
  }
  
  systemInfoInProgress = true;
  
  try {
    const si = require('systeminformation');
    
    // Fetch CPU load and memory (these change frequently)
    // Only fetch static info (cpuData, memLayout, graphics) if not cached
    const needsStaticInfo = !cachedCpuModel || !cachedGpuInfo;
    
    const promises = [
      si.currentLoad(),
      si.mem(),
    ];
    
    if (needsStaticInfo) {
      promises.push(si.cpu(), si.memLayout(), si.graphics());
    }
    
    const results = await Promise.all(promises);
    const cpu = results[0];
    const mem = results[1];
    
    let cpuData, memLayout, graphics;
    if (needsStaticInfo) {
      cpuData = results[2];
      memLayout = results[3];
      graphics = results[4];
      
      // Cache static CPU info
      cachedCpuModel = {
        brand: cpuData.brand || 'Unknown',
        speed: cpuData.speed || 0,
        physicalCores: cpuData.physicalCores || 0,
        cores: cpuData.cores || 0
      };
      
      // Cache static GPU info
      const gpuInfo = graphics.controllers.find(c => 
        c.vendor && c.vendor.toLowerCase().includes('nvidia') || 
        c.vendor && c.vendor.toLowerCase().includes('amd') ||
        c.vendor && c.vendor.toLowerCase().includes('intel') && c.vram > 0
      ) || graphics.controllers[0] || {};
      
      cachedGpuInfo = {
        model: gpuInfo.model || 'Unknown',
        vram: gpuInfo.vram || 0,
        isNvidia: gpuInfo.vendor && gpuInfo.vendor.toLowerCase().includes('nvidia')
      };
      
      // Cache RAM layout info
      cachedGpuInfo.ramSpeed = memLayout[0]?.clockSpeed || 0;
      cachedGpuInfo.ramType = memLayout[0]?.type || 'Unknown';
      cachedGpuInfo.ramSlots = memLayout.filter(m => m.size > 0).length;
      cachedGpuInfo.totalSlots = memLayout.length;
    }
    
    // Try to get GPU usage on Windows using nvidia-smi
    let gpuUsage = 0;
    let gpuMemUsed = 0;
    let gpuMemTotal = cachedGpuInfo.vram || 0;

    // Only try nvidia-smi if we have an NVIDIA GPU
    if (cachedGpuInfo.isNvidia) {
      try {
        // Find nvidia-smi path once and cache it
        if (nvidiaSmiPath === null) {
          const defaultPath = 'C:\\Windows\\System32\\nvidia-smi.exe';
          if (fs.existsSync(defaultPath)) {
            nvidiaSmiPath = defaultPath;
          } else {
            // nvidia-smi not found, set to false to skip future attempts
            nvidiaSmiPath = false;
          }
        }
        
        if (nvidiaSmiPath) {
          // Use execFile instead of exec to avoid spawning a shell
          const nvidiaSmiData = await new Promise((resolve) => {
            execFile(nvidiaSmiPath, 
              ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
              { timeout: 5000, windowsHide: true },
              (error, stdout) => {
                if (error) {
                  resolve(null);
                } else {
                  const parts = stdout.trim().split(',').map(s => parseFloat(s.trim()));
                  resolve({
                    usage: parts[0] || 0,
                    memUsed: parts[1] || 0,
                    memTotal: parts[2] || 0
                  });
                }
              }
            );
          });

          if (nvidiaSmiData) {
            gpuUsage = nvidiaSmiData.usage;
            gpuMemUsed = nvidiaSmiData.memUsed;
            gpuMemTotal = nvidiaSmiData.memTotal;
          }
        }
      } catch (e) {
        // nvidia-smi not available
      }
    }

    // Build result
    const result = {
      cpu: {
        usage: cpu.currentLoad,
        cores: cpu.cpus ? cpu.cpus.length : os.cpus().length,
        model: cachedCpuModel.brand,
        speed: cachedCpuModel.speed,
        physicalCores: cachedCpuModel.physicalCores,
        threads: cachedCpuModel.cores
      },
      memory: {
        used: mem.used,
        total: mem.total,
        percentage: (mem.used / mem.total) * 100,
        speed: cachedGpuInfo.ramSpeed,
        type: cachedGpuInfo.ramType,
        slots: cachedGpuInfo.ramSlots,
        totalSlots: cachedGpuInfo.totalSlots
      },
      gpu: {
        name: cachedGpuInfo.model,
        usage: gpuUsage,
        vram: {
          used: gpuMemUsed,
          total: gpuMemTotal,
          percentage: gpuMemTotal > 0 ? (gpuMemUsed / gpuMemTotal) * 100 : 0
        }
      }
    };
    
    // Cache the result for use when calls overlap
    lastNvidiaSmiResult = result;
    
    return result;
  } catch (error) {
    console.error('Error getting system info:', error);
    return null;
  } finally {
    systemInfoInProgress = false;
  }
});

// Set window title
ipcMain.handle('set-window-title', async (event, title) => {
  if (mainWindow) {
    mainWindow.setTitle(title);
  }
  return { success: true };
});

// Set taskbar progress (Windows only)
ipcMain.handle('set-taskbar-progress', async (event, progress) => {
  if (mainWindow && platform === 'win32') {
    // progress should be between 0 and 1
    // -1 removes the progress bar
    if (progress <= 0) {
      mainWindow.setProgressBar(-1);
    } else {
      mainWindow.setProgressBar(progress);
    }
  }
  return { success: true };
});

// Save queue to file
ipcMain.handle('save-queue', async (event, { queue, filePath }) => {
  try {
    if (!filePath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Render Queue',
        defaultPath: 'render-queue.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });
      
      if (result.canceled) {
        return { success: false, canceled: true };
      }
      filePath = result.filePath;
    }
    
    fs.writeFileSync(filePath, JSON.stringify(queue, null, 2));
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Load queue from file
ipcMain.handle('load-queue', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Load Render Queue',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    
    if (result.canceled) {
      return { success: false, canceled: true };
    }
    
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    const queue = JSON.parse(content);
    return { success: true, queue, filePath: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Auto-save queue to temp location
ipcMain.handle('auto-save-queue', async (event, queue) => {
  try {
    fs.writeFileSync(tempQueuePath, JSON.stringify(queue, null, 2));
    store.set('queue', queue);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Load auto-saved queue
ipcMain.handle('load-auto-saved-queue', async () => {
  try {
    // Try temp file first
    if (fs.existsSync(tempQueuePath)) {
      const content = fs.readFileSync(tempQueuePath, 'utf-8');
      return { success: true, queue: JSON.parse(content) };
    }
    
    // Fall back to store
    const queue = store.get('queue', []);
    return { success: true, queue };
  } catch (error) {
    return { success: false, error: error.message, queue: [] };
  }
});

// Get stored settings
ipcMain.handle('get-settings', async () => {
  return store.get('settings', {
    blenderPath: '',
    autoSave: true,
    notifications: true
  });
});

// Save settings
ipcMain.handle('save-settings', async (event, settings) => {
  store.set('settings', settings);
  return { success: true };
});

// ============================================================
// AUTO-UPDATE IPC HANDLERS
// ============================================================

// Check for updates manually
ipcMain.handle('check-for-updates', async () => {
  if (isDev || !app.isPackaged) {
    return { success: false, error: 'Updates only available in production builds' };
  }
  
  try {
    const result = await autoUpdater.checkForUpdates();
    return { 
      success: true, 
      updateAvailable: result?.updateInfo?.version !== app.getVersion(),
      currentVersion: app.getVersion(),
      latestVersion: result?.updateInfo?.version 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Download available update
ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Install downloaded update
ipcMain.handle('install-update', async () => {
  try {
    autoUpdater.quitAndInstall();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get current app version
ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

// Show notification
ipcMain.handle('show-notification', async (event, { title, message }) => {
  const notifier = require('node-notifier');
  notifier.notify({
    title,
    message,
    icon: path.join(__dirname, '../assets/icon.png'),
    sound: true
  });
  return { success: true };
});

// Watch for new rendered frames in a directory
ipcMain.handle('watch-output-dir', async (event, outputDir) => {
  try {
    if (fs.existsSync(outputDir)) {
      const watcher = fs.watch(outputDir, (eventType, filename) => {
        if (eventType === 'rename' || eventType === 'change') {
          const filePath = path.join(outputDir, filename);
          if (fs.existsSync(filePath)) {
            mainWindow.webContents.send('new-frame-available', {
              path: filePath,
              filename
            });
          }
        }
      });
      
      // Store watcher reference for cleanup
      return { success: true };
    }
    return { success: false, error: 'Directory does not exist' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function readNullTerminatedString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end++;
  const value = buffer.toString('utf8', offset, end);
  return { value, nextOffset: Math.min(end + 1, buffer.length) };
}

function parseExrChannelNamesFromBuffer(buffer) {
  // Minimal OpenEXR header parser.
  // We only need the "channels" chlist attribute to derive pass/layer names.
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return [];

  const channelNames = [];
  let offset = 8; // magic (4) + version (4)

  const isAttrNameByte = (b) => {
    // attribute names are ASCII and often include: letters, digits, _, /, :, ., -
    return (
      (b >= 48 && b <= 57) ||
      (b >= 65 && b <= 90) ||
      (b >= 97 && b <= 122) ||
      b === 95 || // _
      b === 47 || // /
      b === 58 || // :
      b === 46 || // .
      b === 45    // -
    );
  };

  const looksLikeAttributeName = (start) => {
    if (start >= buffer.length) return false;
    if (buffer[start] === 0) return false;
    const maxLen = Math.min(start + 256, buffer.length);
    let i = start;
    while (i < maxLen && buffer[i] !== 0) {
      if (!isAttrNameByte(buffer[i])) return false;
      i++;
    }
    // require a terminating null within a reasonable distance
    return i < maxLen && buffer[i] === 0;
  };

  // Multipart EXRs contain multiple consecutive headers (one per part).
  // We read channel lists from every header until the data/offset tables begin.
  while (looksLikeAttributeName(offset)) {
    while (offset < buffer.length) {
      const nameRes = readNullTerminatedString(buffer, offset);
      const attrName = nameRes.value;
      offset = nameRes.nextOffset;

      if (!attrName) break; // end of this part's header
      if (offset >= buffer.length) return channelNames;

      const typeRes = readNullTerminatedString(buffer, offset);
      const attrType = typeRes.value;
      offset = typeRes.nextOffset;
      if (offset + 4 > buffer.length) return channelNames;

      const attrSize = buffer.readUInt32LE(offset);
      offset += 4;

      const valueStart = offset;
      const valueEnd = Math.min(offset + attrSize, buffer.length);
      offset = valueEnd;

      if (attrName === 'channels' && attrType === 'chlist') {
        let p = valueStart;
        while (p < valueEnd) {
          const chRes = readNullTerminatedString(buffer, p);
          const chName = chRes.value;
          p = chRes.nextOffset;
          if (!chName) break;
          channelNames.push(chName);

          if (p + 16 > valueEnd) break;
          p += 16;
        }
      }
    }

    // If another header starts immediately after, loop again.
    // Otherwise we've likely reached the offset tables.
  }

  return channelNames;
}

function deriveExrLayerNamesFromChannels(channelNames) {
  // Blender multipart EXRs commonly use names like: "ViewLayer.Combined.R".
  // We expose the pass name ("Combined") as the selectable "layer" in the UI.
  const layers = new Set();

  for (const channelName of channelNames) {
    const parts = String(channelName).split('.');
    if (parts.length >= 3) {
      layers.add(parts[1]);
      continue;
    }
    if (parts.length === 2) {
      layers.add(parts[0]);
      continue;
    }
    if (['R', 'G', 'B', 'A'].includes(parts[0])) {
      layers.add('Combined');
    }
  }

  const list = Array.from(layers);
  if (list.length === 0) return ['Combined'];
  list.sort((a, b) => {
    if (a === 'Combined') return -1;
    if (b === 'Combined') return 1;
    return a.localeCompare(b);
  });
  return list;
}

async function getExrLayersFromFile(exrPath) {
  const buffer = fs.readFileSync(exrPath);
  const channels = parseExrChannelNamesFromBuffer(buffer);
  return deriveExrLayerNamesFromChannels(channels);
}

async function convertExrToPngBase64(exrPath, blenderPath, layer = 'Combined') {
  // First try sharp (works on some platforms/builds).
  try {
    const pngBuffer = await sharp(exrPath)
      .toColorspace('srgb')
      .png()
      .toBuffer();

    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
  } catch (sharpError) {
    // Fall back to Blender conversion for Windows + Blender multipart EXRs.
    console.warn('Sharp EXR decode failed, falling back to Blender:', sharpError?.message || sharpError);
  }

  if (!blenderPath || !fs.existsSync(blenderPath)) {
    throw new Error('Unable to decode EXR: sharp does not support EXR on this platform and Blender path is not configured.');
  }
  if (!fs.existsSync(exrPath)) {
    throw new Error('EXR file not found');
  }

  // Dedicated temp workspace per conversion so Blender temp files do not collide.
  const tempWorkDir = makeTempDirSync('renderq_exr_convert');
  ensureDirSync(tempWorkDir);
  const tempPyPath = path.join(tempWorkDir, 'convert.py');
  const tempPngPath = path.join(tempWorkDir, 'out.png');

  const pythonScript = `
import sys
import json
import argparse
import math

def main():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []

    parser = argparse.ArgumentParser()
    parser.add_argument('--exr', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--layer', default='Combined')
    args = parser.parse_args(argv)

    exr_path = args.exr
    out_path = args.out
    layer = args.layer

    import OpenImageIO as oiio
    from OpenImageIO import ImageBufAlgo as IBA

    def clamp01(x):
      if x < 0.0:
        return 0.0
      if x > 1.0:
        return 1.0
      return x

    # Simple ACES fitted tone map (Narkowicz), good-looking highlight roll-off for previews.
    def aces_fitted(x):
      a = 2.51
      b = 0.03
      c = 2.43
      d = 0.59
      e = 0.14
      return (x*(a*x + b)) / (x*(c*x + d) + e)

    def linear_to_srgb(x):
      x = clamp01(x)
      if x <= 0.0031308:
        return 12.92 * x
      return 1.055 * (x ** (1.0/2.4)) - 0.055

    # Find a subimage that contains the requested pass/layer name (Blender multipart EXR)
    chosen = 0
    inp = oiio.ImageInput.open(exr_path)
    if not inp:
      raise RuntimeError('OpenImageIO failed to open EXR')

    for subimage in range(0, 512):
      if not inp.seek_subimage(subimage, 0):
        break
      spec = inp.spec()
      channel_names = list(spec.channelnames)
      if any(('.' + layer + '.') in n for n in channel_names):
        chosen = subimage
        break
    inp.close()

    buf = oiio.ImageBuf(exr_path, chosen, 0, oiio.ImageSpec())
    spec = buf.spec()
    cn = list(spec.channelnames)

    def find_channel(suffix):
      # Prefer channels with the selected layer in the middle: ViewLayer.<Layer>.<Suffix>
      suf = '.' + layer + '.' + suffix
      for n in cn:
        if n.endswith(suf):
          return n
      return None

    r = find_channel('R')
    g = find_channel('G')
    b = find_channel('B')
    a = find_channel('A')
    x = find_channel('X')
    y = find_channel('Y')
    z = find_channel('Z')
    w = find_channel('W')

    # Fallback to unprefixed channel names if present
    if r is None and 'R' in cn: r = 'R'
    if g is None and 'G' in cn: g = 'G'
    if b is None and 'B' in cn: b = 'B'
    if a is None and 'A' in cn: a = 'A'
    if x is None and 'X' in cn: x = 'X'
    if y is None and 'Y' in cn: y = 'Y'
    if z is None and 'Z' in cn: z = 'Z'
    if w is None and 'W' in cn: w = 'W'

    indices = []
    names = []

    if r and g and b:
      indices = [cn.index(r), cn.index(g), cn.index(b)]
      names = ['R', 'G', 'B']
      if a:
        indices.append(cn.index(a))
        names.append('A')
    elif x and y and z:
      indices = [cn.index(x), cn.index(y), cn.index(z)]
      names = ['R', 'G', 'B']
    elif z:
      # Depth/ID style single-channel output: replicate into RGB
      zi = cn.index(z)
      indices = [zi, zi, zi]
      names = ['R', 'G', 'B']
    elif len(cn) >= 3:
      indices = [0, 1, 2]
      names = ['R', 'G', 'B']
    elif len(cn) == 2:
      indices = [0, 1, 1]
      names = ['R', 'G', 'B']
    elif len(cn) == 1:
      indices = [0, 0, 0]
      names = ['R', 'G', 'B']
    else:
      raise RuntimeError('No channels found in EXR subimage')

    # IMPORTANT: OIIO expects tuples here, not lists.
    out = IBA.channels(buf, tuple(indices), tuple(names))

    # Downscale for preview speed (keep aspect, max dimension ~ 1024)
    try:
      spec0 = out.spec()
      w0 = int(spec0.width)
      h0 = int(spec0.height)
      max_dim = max(w0, h0)
      if max_dim > 1024:
        scale = 1024.0 / float(max_dim)
        w1 = max(1, int(round(w0 * scale)))
        h1 = max(1, int(round(h0 * scale)))
        out = IBA.resize(out, w1, h1)
    except Exception:
      pass

    # Apply tone mapping for display: scene-linear -> ACES-like -> sRGB
    # Best-effort: some Blender/OIIO builds may not expose get_pixels/set_pixels.
    try:
      spec = out.spec()
      nch = int(spec.nchannels)
      pix = out.get_pixels(oiio.FLOAT)
      for i in range(0, len(pix), nch):
        r = pix[i + 0] if nch > 0 else 0.0
        g = pix[i + 1] if nch > 1 else r
        b = pix[i + 2] if nch > 2 else r
        r = linear_to_srgb(aces_fitted(r))
        g = linear_to_srgb(aces_fitted(g))
        b = linear_to_srgb(aces_fitted(b))
        pix[i + 0] = r
        if nch > 1: pix[i + 1] = g
        if nch > 2: pix[i + 2] = b
      out.set_pixels(oiio.FLOAT, pix)
    except Exception:
      pass
    if not out.write(out_path):
      raise RuntimeError('Failed to write PNG via OpenImageIO')

    print('EXR_CONVERT_JSON:' + json.dumps({'out': out_path}))
    sys.stdout.flush()
    return 0

if __name__ == '__main__':
    sys.exit(main())
`;

  fs.writeFileSync(tempPyPath, pythonScript);

  const args = ['-b', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', tempPyPath, '--', '--exr', exrPath, '--out', tempPngPath, '--layer', layer || 'Combined'];

  const base64Data = await new Promise((resolve, reject) => {
    const proc = spawnTracked(blenderPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TEMP: tempWorkDir,
        TMP: tempWorkDir,
      },
    }, { name: 'blender-exr-preview' });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      try { fs.unlinkSync(tempPyPath); } catch (e) {}

      const match = stdout.match(/EXR_CONVERT_JSON:(.+)/);
      if (!match) {
        safeRmSync(tempWorkDir);
        return reject(new Error(`Blender EXR conversion failed (exit ${code}). ${stderr.split('\n').slice(-8).join('\n')}`));
      }

      let outPath;
      try {
        outPath = JSON.parse(match[1]).out;
      } catch (e) {
        return reject(new Error('Failed to parse Blender EXR conversion output'));
      }

      try {
        const pngBuffer = fs.readFileSync(outPath);
        // Re-encode via sharp just to ensure consistent PNG + sRGB.
        sharp(pngBuffer)
          .toColorspace('srgb')
          .png()
          .toBuffer()
          .then((finalPng) => {
            try { fs.unlinkSync(outPath); } catch (e) {}
            safeRmSync(tempWorkDir);
            resolve(`data:image/png;base64,${finalPng.toString('base64')}`);
          })
          .catch(() => {
            try { fs.unlinkSync(outPath); } catch (e) {}
            safeRmSync(tempWorkDir);
            resolve(`data:image/png;base64,${pngBuffer.toString('base64')}`);
          });
      } catch (e) {
        try { fs.unlinkSync(outPath); } catch (err) {}
        safeRmSync(tempWorkDir);
        reject(new Error('Blender EXR conversion produced no readable PNG'));
      }
    });

    proc.on('error', (error) => {
      try { fs.unlinkSync(tempPyPath); } catch (e) {}
      safeRmSync(tempWorkDir);
      reject(error);
    });
  });

  return base64Data;
}

// Read image file as base64
ipcMain.handle('read-image', async (event, imagePath) => {
  try {
    if (fs.existsSync(imagePath)) {
      const ext = path.extname(imagePath).toLowerCase();

      // EXR cannot be displayed by Chromium <img> tags, and sharp EXR decode is not available
      // in this Windows build. Use read-exr-layer (which returns PNG) or open in system viewer.
      if (ext === '.exr') {
        return { success: false, error: 'Unsupported preview format (EXR). Use EXR preview or open in system viewer.' };
      }
      
      // Standard image formats
      const buffer = fs.readFileSync(imagePath);
      let mimeType = 'image/png';
      
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      // NOTE: EXR is handled above.
      else if (ext === '.tiff' || ext === '.tif') mimeType = 'image/tiff';
      
      return {
        success: true,
        data: `data:${mimeType};base64,${buffer.toString('base64')}`,
        path: imagePath
      };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get EXR layer names by parsing the EXR header channel list.
ipcMain.handle('get-exr-layers', async (event, { blenderPath, exrPath }) => {
  try {
    if (!exrPath || !fs.existsSync(exrPath)) {
      return { success: false, error: 'File not found' };
    }

    const layers = await getExrLayersFromFile(exrPath);
    return { success: true, layers };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Read EXR with a selected pass/layer; uses Blender fallback for multipart EXR.
ipcMain.handle('read-exr-layer', async (event, { blenderPath, exrPath, layer }) => {
  try {
    // Safety: avoid starting a second Blender process while a render is running.
    // This prevents Blender crashes on Windows (observed as exit code 11 in the main render process).
    if (currentRenderProcess) {
      return { success: false, error: 'EXR preview is temporarily disabled while rendering is in progress.' };
    }
    const base64Data = await convertExrToPngBase64(exrPath, blenderPath, layer || 'Combined');
    return {
      success: true,
      data: base64Data,
      path: exrPath
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Check if file is a video format
ipcMain.handle('is-video-file', async (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.wmv'];
  return { isVideo: videoExtensions.includes(ext) };
});

// Get video file as base64 data URL (for small videos) or file path (for large)
ipcMain.handle('read-video', async (event, videoPath) => {
  try {
    if (fs.existsSync(videoPath)) {
      const stats = fs.statSync(videoPath);
      const ext = path.extname(videoPath).toLowerCase();
      
      let mimeType = 'video/mp4';
      if (ext === '.avi') mimeType = 'video/x-msvideo';
      else if (ext === '.mov') mimeType = 'video/quicktime';
      else if (ext === '.mkv') mimeType = 'video/x-matroska';
      else if (ext === '.webm') mimeType = 'video/webm';
      
      // For files under 50MB, return as base64
      if (stats.size < 50 * 1024 * 1024) {
        const buffer = fs.readFileSync(videoPath);
        return {
          success: true,
          type: 'data',
          data: `data:${mimeType};base64,${buffer.toString('base64')}`,
          path: videoPath
        };
      } else {
        // For larger files, return the file path for direct loading
        return {
          success: true,
          type: 'file',
          filePath: videoPath,
          mimeType,
          path: videoPath
        };
      }
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open file in explorer
ipcMain.handle('open-in-explorer', async (event, filePath) => {
  shell.showItemInFolder(filePath);
  return { success: true };
});

// Open file with default application (e.g., double-click behavior)
ipcMain.handle('open-file-with-default-app', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open folder in file explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Helper function to parse frame ranges like "1-10,20-30,50"
function parseFrameRanges(rangeString) {
  if (!rangeString || rangeString.trim() === '') {
    return [];
  }
  
  const frames = [];
  const parts = rangeString.split(',').map(s => s.trim());
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(s => parseInt(s.trim()));
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
