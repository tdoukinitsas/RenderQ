const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
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
            if (mainWindow) {
              mainWindow.webContents.send('menu-save-queue', false);
            }
          }
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-save-queue', true);
            }
          }
        },
        {
          label: 'Load...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-load-queue');
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
  const searchPaths = APP_INSTALL_PATHS[ApplicationType.AFTER_EFFECTS][platform] || [];
  
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
            const versionMatch = dir.match(/After\s*Effects\s*(?:CC\s*)?(\d{4}|\d+(?:\.\d+)?)/i);
            installations.push({
              type: ApplicationType.AFTER_EFFECTS,
              version: versionMatch ? versionMatch[1] : dir,
              path: fs.existsSync(afterFxExe) ? afterFxExe : aerenderExe,
              commandLinePath: fs.existsSync(aerenderExe) ? aerenderExe : afterFxExe,
              folder: dir,
            });
          }
        } else if (platform === 'darwin') {
          // Look for Adobe After Effects app
          if (dir.endsWith('.app') || fs.existsSync(path.join(fullPath, 'Contents'))) {
            const aerender = path.join(fullPath, 'aerender');
            const afterFx = path.join(fullPath, 'Contents/MacOS/AfterFX');
            
            if (fs.existsSync(afterFx) || fs.existsSync(aerender)) {
              const versionMatch = dir.match(/After\s*Effects\s*(?:CC\s*)?(\d{4}|\d+(?:\.\d+)?)/i);
              installations.push({
                type: ApplicationType.AFTER_EFFECTS,
                version: versionMatch ? versionMatch[1] : dir,
                path: fs.existsSync(afterFx) ? afterFx : aerender,
                commandLinePath: fs.existsSync(aerender) ? aerender : afterFx,
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
    const process = spawn(blenderPath, args, { 
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
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

    process.on('error', (error) => {
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
    const proc = spawn(blenderPath, args, { 
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

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
    default:
      return { success: false, error: 'Unknown application type' };
  }
});

/**
 * Start Blender render
 */
function startBlenderRender({ appPath, sceneFile, frameRanges, jobId, appSettings }) {
  return new Promise((resolve, reject) => {
    isPaused = false;
    
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
        resolve({ success: true });
        return;
      }
      
      const frame = frames[currentFrameIndex];
      const args = ['-b', sceneFile, '-f', String(frame)];
      
      currentRenderProcess = spawn(appPath, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

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
          currentFrameIndex++;
          renderNextFrame();
        } else if (!isPaused) {
          mainWindow.webContents.send('render-error', {
            jobId,
            frame,
            error: `Render process exited with code ${code}`
          });
          currentRenderProcess = null;
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
    
    currentRenderProcess = spawn(appPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let currentFrame = frameStart;

    currentRenderProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
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
    
    currentRenderProcess = spawn(appPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
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
    const frameStart = Math.min(...frames);
    const frameEnd = Math.max(...frames);
    
    // aerender command
    const args = ['-project', sceneFile, '-s', String(frameStart), '-e', String(frameEnd)];
    
    // Add optional settings
    if (appSettings?.composition) {
      args.push('-comp', appSettings.composition);
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
    
    currentRenderProcess = spawn(appPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let currentFrame = frameStart;

    currentRenderProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Parse AE progress
      const progressMatch = output.match(/PROGRESS:\s*(\d+):(\d+):(\d+):(\d+)/);
      if (progressMatch) {
        const frameInfo = output.match(/(\d+)\s*;\s*\d+/);
        if (frameInfo) {
          currentFrame = parseInt(frameInfo[1]);
          mainWindow.webContents.send('render-progress', {
            jobId,
            frame: currentFrame,
            currentFrameIndex: currentFrame - frameStart,
            totalFrames: frames.length
          });
        }
      }
      
      const savedMatch = output.match(/Writing:\s*(.+)/i) || output.match(/Finished Composition:\s*(.+)/i);
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
    
    currentRenderProcess = spawn(appPath, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
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

// Get system info
ipcMain.handle('get-system-info', async () => {
  try {
    const si = require('systeminformation');
    
    const [cpu, mem, graphics] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.graphics()
    ]);

    const gpuInfo = graphics.controllers[0] || {};
    
    // Try to get GPU usage on Windows using nvidia-smi or similar
    let gpuUsage = 0;
    let gpuMemUsed = 0;
    let gpuMemTotal = gpuInfo.vram || 0;

    try {
      // Try nvidia-smi for NVIDIA GPUs
      const nvidiaSmi = await new Promise((resolve) => {
        exec('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits', 
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

      if (nvidiaSmi) {
        gpuUsage = nvidiaSmi.usage;
        gpuMemUsed = nvidiaSmi.memUsed;
        gpuMemTotal = nvidiaSmi.memTotal;
      }
    } catch (e) {
      // nvidia-smi not available
    }

    return {
      cpu: {
        usage: cpu.currentLoad,
        cores: cpu.cpus ? cpu.cpus.length : os.cpus().length
      },
      memory: {
        used: mem.used,
        total: mem.total,
        percentage: (mem.used / mem.total) * 100
      },
      gpu: {
        name: gpuInfo.model || 'Unknown',
        usage: gpuUsage,
        vram: {
          used: gpuMemUsed,
          total: gpuMemTotal,
          percentage: gpuMemTotal > 0 ? (gpuMemUsed / gpuMemTotal) * 100 : 0
        }
      }
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    return null;
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

// Convert EXR to PNG base64 using sharp
async function convertExrToPngBase64(exrPath) {
  // Sharp uses libvips which has native OpenEXR support
  // It automatically handles multi-layer EXR by reading the first/main layer
  const pngBuffer = await sharp(exrPath)
    .toColorspace('srgb')  // Convert from linear to sRGB
    .png()
    .toBuffer();
  
  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

// Read image file as base64
ipcMain.handle('read-image', async (event, imagePath) => {
  try {
    if (fs.existsSync(imagePath)) {
      const ext = path.extname(imagePath).toLowerCase();
      
      // For EXR files, use parse-exr to convert to PNG
      if (ext === '.exr') {
        try {
          const base64Data = await convertExrToPngBase64(imagePath);
          return {
            success: true,
            data: base64Data,
            path: imagePath
          };
        } catch (exrError) {
          console.error('EXR parsing failed:', exrError);
          // Fall through to raw read as fallback
        }
      }
      
      // Standard image formats
      const buffer = fs.readFileSync(imagePath);
      let mimeType = 'image/png';
      
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.exr') mimeType = 'image/x-exr';
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

// Get EXR layer names - parse-exr doesn't support multi-layer, so we return Combined
ipcMain.handle('get-exr-layers', async (event, { blenderPath, exrPath }) => {
  // Sharp/libvips doesn't expose EXR layer names directly
  // Just return the default "Combined" layer - sharp reads the main/composite layer automatically
  return { success: true, layers: ['Combined'] };
});

// Read EXR with specific layer - for now just reads the main data
ipcMain.handle('read-exr-layer', async (event, { blenderPath, exrPath, layer }) => {
  try {
    const base64Data = await convertExrToPngBase64(exrPath);
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
