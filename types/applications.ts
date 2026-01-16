// Application type definitions and constants for multi-application render queue

/**
 * Supported render applications
 */
export enum ApplicationType {
  BLENDER = 'blender',
  CINEMA4D = 'cinema4d',
  HOUDINI = 'houdini',
  AFTER_EFFECTS = 'aftereffects',
  NUKE = 'nuke',
  MAYA = 'maya',
}

/**
 * Application display information
 */
export interface ApplicationInfo {
  type: ApplicationType;
  name: string;
  label: string; // Alias for name, for convenience
  shortName: string;
  fileExtensions: string[];
  color: string;
  colorName: string;
}

/**
 * Map of application types to their display info
 */
export const APPLICATION_INFO: Record<ApplicationType, ApplicationInfo> = {
  [ApplicationType.BLENDER]: {
    type: ApplicationType.BLENDER,
    name: 'Blender',
    label: 'Blender',
    shortName: 'Blender',
    fileExtensions: ['.blend'],
    color: '#ff9966', // Baby orange
    colorName: 'baby-orange',
  },
  [ApplicationType.CINEMA4D]: {
    type: ApplicationType.CINEMA4D,
    name: 'Cinema 4D',
    label: 'Cinema 4D',
    shortName: 'C4D',
    fileExtensions: ['.c4d'],
    color: '#3b82f6', // Bright blue
    colorName: 'bright-blue',
  },
  [ApplicationType.HOUDINI]: {
    type: ApplicationType.HOUDINI,
    name: 'Houdini',
    label: 'Houdini',
    shortName: 'Houdini',
    fileExtensions: ['.hip', '.hiplc', '.hipnc'],
    color: '#ff6b35', // Orange
    colorName: 'orange',
  },
  [ApplicationType.AFTER_EFFECTS]: {
    type: ApplicationType.AFTER_EFFECTS,
    name: 'After Effects',
    label: 'After Effects',
    shortName: 'AE',
    fileExtensions: ['.aep', '.aepx'],
    color: '#9d4edd', // Purple
    colorName: 'purple',
  },
  [ApplicationType.NUKE]: {
    type: ApplicationType.NUKE,
    name: 'Nuke',
    label: 'Nuke',
    shortName: 'Nuke',
    fileExtensions: ['.nk', '.nknc'],
    color: '#fbbf24', // Yellow
    colorName: 'yellow',
  },
  [ApplicationType.MAYA]: {
    type: ApplicationType.MAYA,
    name: 'Maya',
    label: 'Maya',
    shortName: 'Maya',
    fileExtensions: ['.ma', '.mb'],
    color: '#00B4B4', // Teal
    colorName: 'teal',
  },
};

/**
 * Mapping of file extensions to application types (for quick lookup)
 */
export const APPLICATION_FILE_EXTENSIONS: Record<string, ApplicationType> = {
  '.blend': ApplicationType.BLENDER,
  '.c4d': ApplicationType.CINEMA4D,
  '.hip': ApplicationType.HOUDINI,
  '.hiplc': ApplicationType.HOUDINI,
  '.hipnc': ApplicationType.HOUDINI,
  '.aep': ApplicationType.AFTER_EFFECTS,
  '.aepx': ApplicationType.AFTER_EFFECTS,
  '.nk': ApplicationType.NUKE,
  '.nknc': ApplicationType.NUKE,
  '.ma': ApplicationType.MAYA,
  '.mb': ApplicationType.MAYA,
};

/**
 * Get all supported file extensions
 */
export function getAllSupportedExtensions(): string[] {
  return Object.values(APPLICATION_INFO).flatMap(info => info.fileExtensions);
}

/**
 * Get application type from file extension
 */
export function getApplicationTypeFromExtension(filePath: string): ApplicationType | null {
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  for (const [type, info] of Object.entries(APPLICATION_INFO)) {
    if (info.fileExtensions.includes(ext)) {
      return type as ApplicationType;
    }
  }
  return null;
}

/**
 * Alias for getApplicationTypeFromExtension (shorter name)
 */
export const getAppTypeFromExtension = getApplicationTypeFromExtension;

/**
 * Get application info from file extension
 */
export function getApplicationInfoFromExtension(filePath: string): ApplicationInfo | null {
  const appType = getApplicationTypeFromExtension(filePath);
  if (appType) {
    return APPLICATION_INFO[appType];
  }
  return null;
}

/**
 * Platform type
 */
export type Platform = 'win32' | 'darwin' | 'linux';

/**
 * Installation search paths per platform and application
 */
export interface InstallationPaths {
  win32: string[];
  darwin: string[];
  linux: string[];
}

/**
 * Executable names per platform
 */
export interface ExecutableNames {
  win32: string | string[];
  darwin: string | string[];
  linux: string | string[];
}

/**
 * Application installation configuration
 */
export interface ApplicationInstallConfig {
  type: ApplicationType;
  paths: InstallationPaths;
  executables: ExecutableNames;
  versionPattern: RegExp;
  /**
   * For applications where the command line tool is different from the GUI
   * (e.g., C4D's Commandline.exe vs Cinema 4D.exe)
   */
  commandLineExecutable?: ExecutableNames;
}

/**
 * Installation search configurations for each application
 */
export const APPLICATION_INSTALL_CONFIGS: Record<ApplicationType, ApplicationInstallConfig> = {
  [ApplicationType.BLENDER]: {
    type: ApplicationType.BLENDER,
    paths: {
      win32: [
        'C:\\Program Files\\Blender Foundation',
        'C:\\Program Files (x86)\\Blender Foundation',
        process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Blender Foundation` : '',
      ].filter(Boolean),
      darwin: [
        '/Applications',
        `${process.env.HOME}/Applications`,
      ].filter(Boolean) as string[],
      linux: [
        '/usr/bin',
        '/usr/local/bin',
        '/opt',
        '/snap/bin',
        `${process.env.HOME}/blender`,
      ].filter(Boolean) as string[],
    },
    executables: {
      win32: 'blender.exe',
      darwin: 'Blender.app/Contents/MacOS/Blender',
      linux: 'blender',
    },
    versionPattern: /[Bb]lender[- ]?([\d.]+)/,
  },

  [ApplicationType.CINEMA4D]: {
    type: ApplicationType.CINEMA4D,
    paths: {
      win32: [
        'C:\\Program Files\\Maxon Cinema 4D',
        'C:\\Program Files\\Maxon',
        'C:\\Program Files (x86)\\Maxon Cinema 4D',
      ],
      darwin: [
        '/Applications',
        '/Applications/Maxon',
      ],
      linux: [
        // Cinema 4D doesn't officially support Linux
      ],
    },
    executables: {
      win32: 'Cinema 4D.exe',
      darwin: 'Cinema 4D.app/Contents/MacOS/Cinema 4D',
      linux: '',
    },
    commandLineExecutable: {
      win32: 'Commandline.exe',
      darwin: 'Cinema 4D.app/Contents/MacOS/Commandline',
      linux: '',
    },
    versionPattern: /Cinema\s*4D\s*(?:R|S|)(\d+(?:\.\d+)?)/i,
  },

  [ApplicationType.HOUDINI]: {
    type: ApplicationType.HOUDINI,
    paths: {
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
    executables: {
      win32: 'bin\\houdini.exe',
      darwin: 'Houdini/Current/Frameworks/Houdini.framework/Versions/Current/Resources/bin/houdini',
      linux: 'bin/houdini',
    },
    commandLineExecutable: {
      win32: ['bin\\hbatch.exe', 'bin\\mantra.exe'],
      darwin: [
        'Houdini/Current/Frameworks/Houdini.framework/Versions/Current/Resources/bin/hbatch',
        'Houdini/Current/Frameworks/Houdini.framework/Versions/Current/Resources/bin/mantra',
      ],
      linux: ['bin/hbatch', 'bin/mantra'],
    },
    versionPattern: /Houdini\s*([\d.]+)/i,
  },

  [ApplicationType.AFTER_EFFECTS]: {
    type: ApplicationType.AFTER_EFFECTS,
    paths: {
      win32: [
        'C:\\Program Files\\Adobe',
        'C:\\Program Files (x86)\\Adobe',
      ],
      darwin: [
        '/Applications/Adobe After Effects',
        '/Applications',
      ],
      linux: [
        // After Effects doesn't support Linux
      ],
    },
    executables: {
      win32: 'Support Files\\AfterFX.exe',
      darwin: 'Adobe After Effects/Contents/MacOS/AfterFX',
      linux: '',
    },
    commandLineExecutable: {
      win32: 'Support Files\\aerender.exe',
      darwin: 'Adobe After Effects/Contents/aerender',
      linux: '',
    },
    versionPattern: /After\s*Effects\s*(?:CC\s*)?(\d{4}|\d+(?:\.\d+)?)/i,
  },

  [ApplicationType.NUKE]: {
    type: ApplicationType.NUKE,
    paths: {
      win32: [
        'C:\\Program Files\\Nuke',
        'C:\\Program Files (x86)\\Nuke',
      ],
      darwin: [
        '/Applications',
      ],
      linux: [
        '/usr/local',
        '/opt',
      ],
    },
    executables: {
      win32: 'Nuke*.exe',
      darwin: 'Nuke*/Nuke*.app/Contents/MacOS/Nuke*',
      linux: 'Nuke*/Nuke*',
    },
    versionPattern: /Nuke\s*([\d.]+(?:v\d+)?)/i,
  },

  [ApplicationType.MAYA]: {
    type: ApplicationType.MAYA,
    paths: {
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
    executables: {
      win32: 'bin\\maya.exe',
      darwin: 'Maya.app/Contents/MacOS/Maya',
      linux: 'bin/maya',
    },
    commandLineExecutable: {
      win32: 'bin\\Render.exe',
      darwin: 'Maya.app/Contents/bin/Render',
      linux: 'bin/Render',
    },
    versionPattern: /Maya\s*(\d{4}(?:\.\d+)?)/i,
  },
};

/**
 * Application installation info returned from detection
 */
export interface AppInstallation {
  type: ApplicationType;
  version: string;
  path: string;
  commandLinePath?: string;
  folder: string;
}

/**
 * Render job scene info - generic interface for all applications
 */
export interface SceneInfo {
  applicationType: ApplicationType;
  frameStart: number;
  frameEnd: number;
  fps: number;
  outputPath: string;
  outputDir: string;
  outputPattern: string;
  renderEngine?: string;
  resolution?: {
    x: number;
    y: number;
    percentage?: number;
  };
  format?: string;
  isVideoOutput?: boolean;
  // Application-specific info
  takeName?: string;       // Cinema 4D
  renderNode?: string;     // Houdini, Nuke
  composition?: string;    // After Effects
}

/**
 * Application-specific render settings
 */
export interface BlenderRenderSettings {
  engine?: 'CYCLES' | 'BLENDER_EEVEE' | 'BLENDER_EEVEE_NEXT' | 'BLENDER_WORKBENCH';
  device?: 'CPU' | 'GPU' | 'HYBRID';
  cyclesDevice?: 'CPU' | 'CUDA' | 'OPTIX' | 'HIP' | 'ONEAPI' | 'METAL';
  samples?: number;
  threads?: number;
  outputPath?: string;
  resolution?: {
    x: number;
    y: number;
    percentage?: number;
  };
}

export interface Cinema4DRenderSettings {
  take?: string;
  threads?: number;
  noGui?: boolean;
}

export interface HoudiniRenderSettings {
  renderNode?: string;
  useHbatch?: boolean;
  useMantra?: boolean;
  verbose?: number;
  threads?: number;
}

export interface AfterEffectsRenderSettings {
  composition?: string;
  renderSettings?: string;
  outputModule?: string;
  multiFrameRendering?: boolean;
  maxCpuPercent?: number;
  memoryUsage?: {
    imageCachePercent?: number;
    maxMemPercent?: number;
  };
}

export interface NukeRenderSettings {
  writeNode?: string;
  useNukeX?: boolean;
  useNukeStudio?: boolean;
  continueOnError?: boolean;
  verbose?: number;
  threads?: number;
  cacheSize?: string;
}

export interface MayaRenderSettings {
  renderer?: 'arnold' | 'vray' | 'renderman' | 'redshift' | 'mayaSoftware' | 'mayaHardware' | 'mayaHardware2' | 'mayaVector';
  camera?: string;
  renderLayer?: string;
  verbose?: number;
  threads?: number;
}

/**
 * Union type for all application-specific render settings
 */
export type ApplicationRenderSettings =
  | BlenderRenderSettings
  | Cinema4DRenderSettings
  | HoudiniRenderSettings
  | AfterEffectsRenderSettings
  | NukeRenderSettings
  | MayaRenderSettings;

/**
 * Per-application path configuration
 */
export interface ApplicationPaths {
  [ApplicationType.BLENDER]: string;
  [ApplicationType.CINEMA4D]: string;
  [ApplicationType.HOUDINI]: string;
  [ApplicationType.AFTER_EFFECTS]: string;
  [ApplicationType.NUKE]: string;
  [ApplicationType.MAYA]: string;
}

/**
 * Default empty application paths
 */
export const DEFAULT_APPLICATION_PATHS: ApplicationPaths = {
  [ApplicationType.BLENDER]: '',
  [ApplicationType.CINEMA4D]: '',
  [ApplicationType.HOUDINI]: '',
  [ApplicationType.AFTER_EFFECTS]: '',
  [ApplicationType.NUKE]: '',
  [ApplicationType.MAYA]: '',
};

/**
 * Output formats supported by each application
 */
export const APPLICATION_OUTPUT_FORMATS: Record<ApplicationType, string[]> = {
  [ApplicationType.BLENDER]: [
    'PNG', 'JPEG', 'TIFF', 'OPEN_EXR', 'OPEN_EXR_MULTILAYER', 'HDR', 
    'TARGA', 'BMP', 'IRIS', 'WEBP', 'FFMPEG', 'AVI_JPEG', 'AVI_RAW'
  ],
  [ApplicationType.CINEMA4D]: [
    'BMP', 'IFF', 'JPEG', 'PICT', 'PNG', 'PSD', 'RLA', 'RPF', 
    'TARGA', 'TIFF', 'DPX', 'EXR', 'HDR'
  ],
  [ApplicationType.HOUDINI]: [
    'pic', 'tif', 'tiff', 'png', 'jpg', 'jpeg', 'exr', 'hdr', 'tga', 'bmp'
  ],
  [ApplicationType.AFTER_EFFECTS]: [
    'PNG', 'JPEG', 'TIFF', 'Photoshop', 'OpenEXR', 'TARGA', 
    'QuickTime', 'H.264', 'MPEG-4', 'AVI'
  ],
  [ApplicationType.NUKE]: [
    'exr', 'dpx', 'tiff', 'tif', 'png', 'jpg', 'jpeg', 'tga', 'hdr', 'sgi', 'pic'
  ],
  [ApplicationType.MAYA]: [
    'iff', 'exr', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'tga', 'bmp', 'hdr', 'psd', 'dds'
  ],
};
