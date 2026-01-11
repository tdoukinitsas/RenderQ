import { defineStore } from 'pinia';
import { 
  ApplicationType, 
  DEFAULT_APPLICATION_PATHS,
  type ApplicationPaths,
  type BlenderRenderSettings,
  type Cinema4DRenderSettings,
  type HoudiniRenderSettings,
  type AfterEffectsRenderSettings,
  type NukeRenderSettings,
} from '~/types/applications';

/**
 * Application-specific default settings
 */
export interface AppSpecificSettings {
  blender: BlenderRenderSettings;
  cinema4d: Cinema4DRenderSettings;
  houdini: HoudiniRenderSettings;
  aftereffects: AfterEffectsRenderSettings;
  nuke: NukeRenderSettings;
}

export interface SettingsState {
  // Legacy - kept for backwards compatibility
  blenderPath: string;
  
  // Multi-application paths
  applicationPaths: ApplicationPaths;
  
  // General settings
  autoSave: boolean;
  notifications: boolean;
  showPreview: boolean;
  previewScale: number;
  
  // Application-specific default settings
  appSettings: AppSpecificSettings;
}

const DEFAULT_APP_SETTINGS: AppSpecificSettings = {
  blender: {
    engine: 'CYCLES',
    device: 'GPU',
    threads: 0, // 0 = auto
  },
  cinema4d: {
    noGui: true,
    threads: 0,
  },
  houdini: {
    useHbatch: true,
    verbose: 1,
    threads: 0,
  },
  aftereffects: {
    multiFrameRendering: true,
    maxCpuPercent: 100,
    memoryUsage: {
      imageCachePercent: 50,
      maxMemPercent: 100,
    },
  },
  nuke: {
    continueOnError: false,
    verbose: 1,
    threads: 0,
  },
};

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    // Legacy
    blenderPath: '',
    
    // Multi-app paths
    applicationPaths: { ...DEFAULT_APPLICATION_PATHS },
    
    // General
    autoSave: true,
    notifications: true,
    showPreview: true,
    previewScale: 100,
    
    // App-specific
    appSettings: { ...DEFAULT_APP_SETTINGS },
  }),

  getters: {
    /**
     * Get the executable path for a specific application
     */
    getAppPath: (state) => (appType: ApplicationType): string => {
      return state.applicationPaths[appType] || '';
    },
    
    /**
     * Check if an application is configured
     */
    isAppConfigured: (state) => (appType: ApplicationType): boolean => {
      return !!state.applicationPaths[appType];
    },
    
    /**
     * Get app-specific settings
     */
    getAppSettings: (state) => (appType: ApplicationType) => {
      switch (appType) {
        case ApplicationType.BLENDER:
          return state.appSettings.blender;
        case ApplicationType.CINEMA4D:
          return state.appSettings.cinema4d;
        case ApplicationType.HOUDINI:
          return state.appSettings.houdini;
        case ApplicationType.AFTER_EFFECTS:
          return state.appSettings.aftereffects;
        case ApplicationType.NUKE:
          return state.appSettings.nuke;
        default:
          return {};
      }
    },
  },

  actions: {
    async loadSettings() {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const settings = await (window as any).electronAPI.getSettings();
        if (settings) {
          // Legacy support
          this.blenderPath = settings.blenderPath || '';
          
          // Multi-app paths - migrate from legacy if needed
          if (settings.applicationPaths) {
            this.applicationPaths = {
              ...DEFAULT_APPLICATION_PATHS,
              ...settings.applicationPaths,
            };
          } else if (settings.blenderPath) {
            // Migrate legacy blender path
            this.applicationPaths = {
              ...DEFAULT_APPLICATION_PATHS,
              [ApplicationType.BLENDER]: settings.blenderPath,
            };
          }
          
          // General settings
          this.autoSave = settings.autoSave !== false;
          this.notifications = settings.notifications !== false;
          this.showPreview = settings.showPreview !== false;
          this.previewScale = settings.previewScale || 100;
          
          // App-specific settings
          if (settings.appSettings) {
            this.appSettings = {
              ...DEFAULT_APP_SETTINGS,
              ...settings.appSettings,
            };
          }
        }
      }
    },

    async saveSettings() {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.saveSettings({
          // Legacy
          blenderPath: this.blenderPath,
          
          // Multi-app
          applicationPaths: this.applicationPaths,
          
          // General
          autoSave: this.autoSave,
          notifications: this.notifications,
          showPreview: this.showPreview,
          previewScale: this.previewScale,
          
          // App-specific
          appSettings: this.appSettings,
        });
      }
    },

    /**
     * Set path for a specific application
     */
    setAppPath(appType: ApplicationType, path: string) {
      this.applicationPaths[appType] = path;
      
      // Keep legacy blenderPath in sync
      if (appType === ApplicationType.BLENDER) {
        this.blenderPath = path;
      }
      
      this.saveSettings();
    },

    /**
     * Legacy method - kept for backwards compatibility
     */
    setBlenderPath(path: string) {
      this.blenderPath = path;
      this.applicationPaths[ApplicationType.BLENDER] = path;
      this.saveSettings();
    },

    /**
     * Update app-specific settings
     */
    updateAppSettings<T extends keyof AppSpecificSettings>(
      appType: T,
      settings: Partial<AppSpecificSettings[T]>
    ) {
      this.appSettings[appType] = {
        ...this.appSettings[appType],
        ...settings,
      } as AppSpecificSettings[T];
      this.saveSettings();
    },

    /**
     * Update Blender-specific settings
     */
    updateBlenderSettings(settings: Partial<BlenderRenderSettings>) {
      this.appSettings.blender = { ...this.appSettings.blender, ...settings };
      this.saveSettings();
    },

    /**
     * Update Cinema 4D-specific settings
     */
    updateCinema4DSettings(settings: Partial<Cinema4DRenderSettings>) {
      this.appSettings.cinema4d = { ...this.appSettings.cinema4d, ...settings };
      this.saveSettings();
    },

    /**
     * Update Houdini-specific settings
     */
    updateHoudiniSettings(settings: Partial<HoudiniRenderSettings>) {
      this.appSettings.houdini = { ...this.appSettings.houdini, ...settings };
      this.saveSettings();
    },

    /**
     * Update After Effects-specific settings
     */
    updateAfterEffectsSettings(settings: Partial<AfterEffectsRenderSettings>) {
      this.appSettings.aftereffects = { ...this.appSettings.aftereffects, ...settings };
      this.saveSettings();
    },

    /**
     * Update Nuke-specific settings
     */
    updateNukeSettings(settings: Partial<NukeRenderSettings>) {
      this.appSettings.nuke = { ...this.appSettings.nuke, ...settings };
      this.saveSettings();
    },

    toggleAutoSave() {
      this.autoSave = !this.autoSave;
      this.saveSettings();
    },

    toggleNotifications() {
      this.notifications = !this.notifications;
      this.saveSettings();
    },

    togglePreview() {
      this.showPreview = !this.showPreview;
      this.saveSettings();
    },

    setPreviewScale(scale: number) {
      this.previewScale = scale;
      this.saveSettings();
    },
  },
});
