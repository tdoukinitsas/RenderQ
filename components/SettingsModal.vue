<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal settings-modal">
      <div class="modal__header">
        <h2>Settings</h2>
        <button class="btn btn--ghost btn--icon" @click="$emit('close')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      
      <!-- Tabs -->
      <div class="settings-tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          class="settings-tab"
          :class="{ 'settings-tab--active': activeTab === tab.id }"
          :style="getTabStyle(tab)"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      
      <div class="modal__body">
        <!-- General Tab -->
        <div v-if="activeTab === 'general'" class="tab-content">
          <div class="settings-section">
            <h3>Auto-Save & Notifications</h3>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                :checked="settings.autoSave"
                @change="settings.toggleAutoSave()"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Auto-save queue</span>
                <span class="setting-toggle__desc">Automatically save queue state to recover from crashes</span>
              </span>
            </label>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                :checked="settings.notifications"
                @change="settings.toggleNotifications()"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Desktop notifications</span>
                <span class="setting-toggle__desc">Show notifications when renders complete or encounter errors</span>
              </span>
            </label>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                :checked="settings.showPreview"
                @change="settings.togglePreview()"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Show preview</span>
                <span class="setting-toggle__desc">Display the latest rendered frame in the preview panel</span>
              </span>
            </label>
          </div>
        </div>
        
        <!-- Blender Tab -->
        <div v-if="activeTab === 'blender'" class="tab-content">
          <div class="settings-section">
            <h3>Blender Installation</h3>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in blenderInstallations" 
                  :key="install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.blender === install.path }"
                  @click="selectAppInstallation('blender', install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">Blender {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.blender === install.path" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="blenderInstallations.length === 0" class="installation-empty">
                  No Blender installations found in default locations
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.blender"
                  placeholder="Path to blender executable"
                />
                <button class="btn btn--secondary" @click="browseAppPath('blender')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.blender && customPaths.blender !== settings.applicationPaths?.blender"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('blender')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
        </div>
        
        <!-- Cinema 4D Tab -->
        <div v-if="activeTab === 'cinema4d'" class="tab-content">
          <div class="settings-section">
            <h3>Cinema 4D Installation</h3>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in cinema4dInstallations" 
                  :key="install.commandLinePath || install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.cinema4d === (install.commandLinePath || install.path) }"
                  @click="selectAppInstallation('cinema4d', install.commandLinePath || install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">Cinema 4D {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.commandLinePath || install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.cinema4d === (install.commandLinePath || install.path)" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="cinema4dInstallations.length === 0" class="installation-empty">
                  No Cinema 4D installations found
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.cinema4d"
                  placeholder="Path to Commandline.exe"
                />
                <button class="btn btn--secondary" @click="browseAppPath('cinema4d')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.cinema4d && customPaths.cinema4d !== settings.applicationPaths?.cinema4d"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('cinema4d')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
          
          <div class="settings-section">
            <h3>Render Settings</h3>
            
            <div class="form-group">
              <label class="form-label">Default Take (optional)</label>
              <input 
                type="text" 
                class="form-input"
                v-model="appSettings.cinema4d.take"
                placeholder="Main"
                @change="saveAppSettings('cinema4d')"
              />
              <span class="form-hint">Leave empty to use the scene's active take</span>
            </div>
            
            <div class="form-group">
              <label class="form-label">Threads</label>
              <input 
                type="number" 
                class="form-input"
                v-model.number="appSettings.cinema4d.threads"
                placeholder="0 (auto)"
                min="0"
                @change="saveAppSettings('cinema4d')"
              />
              <span class="form-hint">0 = automatic (use all available cores)</span>
            </div>
          </div>
        </div>
        
        <!-- Houdini Tab -->
        <div v-if="activeTab === 'houdini'" class="tab-content">
          <div class="settings-section">
            <h3>Houdini Installation</h3>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in houdiniInstallations" 
                  :key="install.commandLinePath || install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.houdini === (install.commandLinePath || install.path) }"
                  @click="selectAppInstallation('houdini', install.commandLinePath || install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">Houdini {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.commandLinePath || install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.houdini === (install.commandLinePath || install.path)" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="houdiniInstallations.length === 0" class="installation-empty">
                  No Houdini installations found
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.houdini"
                  placeholder="Path to hbatch executable"
                />
                <button class="btn btn--secondary" @click="browseAppPath('houdini')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.houdini && customPaths.houdini !== settings.applicationPaths?.houdini"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('houdini')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
          
          <div class="settings-section">
            <h3>Render Settings</h3>
            
            <div class="form-group">
              <label class="form-label">Default Render Node</label>
              <input 
                type="text" 
                class="form-input form-input--mono"
                v-model="appSettings.houdini.renderNode"
                placeholder="/out/mantra1"
                @change="saveAppSettings('houdini')"
              />
              <span class="form-hint">The ROP node path to render (e.g., /out/mantra1, /out/karma1)</span>
            </div>
          </div>
        </div>
        
        <!-- After Effects Tab -->
        <div v-if="activeTab === 'aftereffects'" class="tab-content">
          <div class="settings-section">
            <h3>After Effects Installation</h3>
            <p class="form-hint" style="margin-bottom: 12px;">
              RenderQ uses aerender for command-line rendering. The GUI application (AfterFX.exe) is not used.
            </p>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in aftereffectsInstallations" 
                  :key="install.commandLinePath || install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.aftereffects === (install.commandLinePath || install.path) }"
                  @click="selectAppInstallation('aftereffects', install.commandLinePath || install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">After Effects {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.commandLinePath || install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.aftereffects === (install.commandLinePath || install.path)" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="aftereffectsInstallations.length === 0" class="installation-empty">
                  No After Effects installations found
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.aftereffects"
                  placeholder="Path to aerender executable"
                />
                <button class="btn btn--secondary" @click="browseAppPath('aftereffects')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.aftereffects && customPaths.aftereffects !== settings.applicationPaths?.aftereffects"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('aftereffects')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
          
          <div class="settings-section">
            <h3>Render Settings</h3>
            
            <div class="form-group">
              <label class="form-label">Default Composition (optional)</label>
              <input 
                type="text" 
                class="form-input"
                v-model="appSettings.aftereffects.composition"
                placeholder="Main Comp"
                @change="saveAppSettings('aftereffects')"
              />
              <span class="form-hint">Leave empty to render all render queue items</span>
            </div>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                v-model="appSettings.aftereffects.multiFrameRendering"
                @change="saveAppSettings('aftereffects')"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Multi-Frame Rendering</span>
                <span class="setting-toggle__desc">Enable parallel frame rendering for better performance</span>
              </span>
            </label>
          </div>
        </div>
        
        <!-- Nuke Tab -->
        <div v-if="activeTab === 'nuke'" class="tab-content">
          <div class="settings-section">
            <h3>Nuke Installation</h3>
            
            <div class="form-group">
              <label class="form-label">Detected Installations</label>
              <div class="installation-list">
                <div 
                  v-for="install in nukeInstallations" 
                  :key="install.commandLinePath || install.path"
                  class="installation-item"
                  :class="{ 'installation-item--selected': settings.applicationPaths?.nuke === (install.commandLinePath || install.path) }"
                  @click="selectAppInstallation('nuke', install.commandLinePath || install.path)"
                >
                  <div class="installation-item__info">
                    <span class="installation-item__version">Nuke {{ install.version }}</span>
                    <span class="installation-item__path">{{ install.commandLinePath || install.path }}</span>
                  </div>
                  <svg v-if="settings.applicationPaths?.nuke === (install.commandLinePath || install.path)" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="installation-item__check">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                
                <div v-if="nukeInstallations.length === 0" class="installation-empty">
                  No Nuke installations found
                </div>
              </div>
            </div>
            
            <div class="form-group">
              <label class="form-label">Custom Path</label>
              <div class="input-with-button">
                <input 
                  type="text" 
                  class="form-input form-input--mono"
                  v-model="customPaths.nuke"
                  placeholder="Path to Nuke executable"
                />
                <button class="btn btn--secondary" @click="browseAppPath('nuke')">
                  Browse
                </button>
              </div>
              <button 
                v-if="customPaths.nuke && customPaths.nuke !== settings.applicationPaths?.nuke"
                class="btn btn--primary btn--sm"
                style="margin-top: 8px;"
                @click="applyCustomPath('nuke')"
              >
                Use Custom Path
              </button>
            </div>
          </div>
          
          <div class="settings-section">
            <h3>Render Settings</h3>
            
            <div class="form-group">
              <label class="form-label">Default Write Node (optional)</label>
              <input 
                type="text" 
                class="form-input form-input--mono"
                v-model="appSettings.nuke.writeNode"
                placeholder="Write1"
                @change="saveAppSettings('nuke')"
              />
              <span class="form-hint">Leave empty to render all Write nodes</span>
            </div>
            
            <div class="form-group">
              <label class="form-label">Threads</label>
              <input 
                type="number" 
                class="form-input"
                v-model.number="appSettings.nuke.threads"
                placeholder="0 (auto)"
                min="0"
                @change="saveAppSettings('nuke')"
              />
            </div>
            
            <label class="setting-toggle">
              <input 
                type="checkbox" 
                v-model="appSettings.nuke.continueOnError"
                @change="saveAppSettings('nuke')"
              />
              <span class="setting-toggle__label">
                <span class="setting-toggle__title">Continue on Error</span>
                <span class="setting-toggle__desc">Continue rendering subsequent frames if one frame fails</span>
              </span>
            </label>
          </div>
        </div>
      </div>
      
      <div class="modal__footer">
        <button class="btn btn--secondary" @click="$emit('close')">
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRenderQueueStore } from '~/stores/renderQueue';
import { useSettingsStore } from '~/stores/settings';
import { ApplicationType } from '~/types/applications';

const renderQueue = useRenderQueueStore();
const settings = useSettingsStore();

defineEmits<{
  (e: 'close'): void;
}>();

// Tab configuration
const tabs = [
  { id: 'general', label: 'General', color: null },
  { id: 'blender', label: 'Blender', color: '#ff9966' },
  { id: 'cinema4d', label: 'Cinema 4D', color: '#3b82f6' },
  { id: 'houdini', label: 'Houdini', color: '#ff6b35' },
  { id: 'aftereffects', label: 'After Effects', color: '#9d4edd' },
  { id: 'nuke', label: 'Nuke', color: '#fbbf24' },
];

const activeTab = ref('general');

// Installation lists
const blenderInstallations = ref<any[]>([]);
const cinema4dInstallations = ref<any[]>([]);
const houdiniInstallations = ref<any[]>([]);
const aftereffectsInstallations = ref<any[]>([]);
const nukeInstallations = ref<any[]>([]);

// Custom paths
const customPaths = reactive({
  blender: '',
  cinema4d: '',
  houdini: '',
  aftereffects: '',
  nuke: '',
});

// App-specific settings
const appSettings = reactive({
  cinema4d: {
    take: '',
    threads: 0,
  },
  houdini: {
    renderNode: '/out/mantra1',
  },
  aftereffects: {
    composition: '',
    multiFrameRendering: false,
  },
  nuke: {
    writeNode: '',
    threads: 0,
    continueOnError: false,
  },
});

function getTabStyle(tab: typeof tabs[0]) {
  if (activeTab.value === tab.id && tab.color) {
    return {
      borderBottomColor: tab.color,
      color: tab.color,
    };
  }
  return {};
}

async function loadInstallations() {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    try {
      // Load all installations in parallel
      const [blender, cinema4d, houdini, aftereffects, nuke] = await Promise.all([
        (window as any).electronAPI.findBlenderInstallations(),
        (window as any).electronAPI.findCinema4DInstallations?.() || [],
        (window as any).electronAPI.findHoudiniInstallations?.() || [],
        (window as any).electronAPI.findAfterEffectsInstallations?.() || [],
        (window as any).electronAPI.findNukeInstallations?.() || [],
      ]);
      
      blenderInstallations.value = blender || [];
      cinema4dInstallations.value = cinema4d || [];
      houdiniInstallations.value = houdini || [];
      aftereffectsInstallations.value = aftereffects || [];
      nukeInstallations.value = nuke || [];
    } catch (error) {
      console.error('Failed to load installations:', error);
    }
  }
}

function loadSettings() {
  // Load custom paths from settings
  customPaths.blender = settings.applicationPaths?.blender || '';
  customPaths.cinema4d = settings.applicationPaths?.cinema4d || '';
  customPaths.houdini = settings.applicationPaths?.houdini || '';
  customPaths.aftereffects = settings.applicationPaths?.aftereffects || '';
  customPaths.nuke = settings.applicationPaths?.nuke || '';
  
  // Load app-specific settings
  if (settings.appSettings?.cinema4d) {
    Object.assign(appSettings.cinema4d, settings.appSettings.cinema4d);
  }
  if (settings.appSettings?.houdini) {
    Object.assign(appSettings.houdini, settings.appSettings.houdini);
  }
  if (settings.appSettings?.aftereffects) {
    Object.assign(appSettings.aftereffects, settings.appSettings.aftereffects);
  }
  if (settings.appSettings?.nuke) {
    Object.assign(appSettings.nuke, settings.appSettings.nuke);
  }
}

onMounted(() => {
  loadInstallations();
  loadSettings();
});

function selectAppInstallation(appType: string, path: string) {
  settings.setAppPath(appType as ApplicationType, path);
  (customPaths as any)[appType] = path;
  
  // Legacy: also update blenderPath in renderQueue for backwards compat
  if (appType === 'blender') {
    renderQueue.setBlenderPath(path);
  }
  
  // Re-validate jobs to update missing-app status
  renderQueue.validateJobApplications();
}

async function browseAppPath(appType: string) {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const path = await (window as any).electronAPI.browseAppPath?.(appType);
    if (path) {
      (customPaths as any)[appType] = path;
    }
  }
}

function applyCustomPath(appType: string) {
  const customPath = (customPaths as any)[appType];
  if (customPath) {
    settings.setAppPath(appType as ApplicationType, customPath);
    
    // Add a fake installation entry so the app is considered "found"
    // This helps with the missing-app status check
    const appTypeEnum = appType as ApplicationType;
    renderQueue.setAppInstallations(appTypeEnum, [
      ...renderQueue.getAppInstallations(appTypeEnum),
      {
        type: appTypeEnum,
        version: 'Custom',
        path: customPath,
        folder: 'Custom Installation',
      }
    ]);
    
    // Legacy: also update blenderPath in renderQueue
    if (appType === 'blender') {
      renderQueue.setBlenderPath(customPath);
    }
    
    // Re-validate jobs to update missing-app status
    renderQueue.validateJobApplications();
  }
}

function saveAppSettings(appType: string) {
  const appSettingsData = (appSettings as any)[appType];
  if (appSettingsData && settings.updateAppSettings) {
    settings.updateAppSettings(appType as ApplicationType, appSettingsData);
  }
}
</script>

<style lang="scss">
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: $z-modal;
}

.modal {
  background-color: $bg-secondary;
  border: 1px solid $border-subtle;
  border-radius: $radius-lg;
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: $shadow-lg;
  
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-05;
    border-bottom: 1px solid $border-subtle;
    
    h2 {
      margin: 0;
      font-size: $font-size-lg;
    }
  }
  
  &__body {
    flex: 1;
    overflow-y: auto;
    padding: $spacing-05;
  }
  
  &__footer {
    padding: $spacing-04 $spacing-05;
    border-top: 1px solid $border-subtle;
    display: flex;
    justify-content: flex-end;
    gap: $spacing-03;
  }
}

// Settings Tabs
.settings-tabs {
  display: flex;
  border-bottom: 1px solid $border-subtle;
  padding: 0 $spacing-05;
  overflow-x: auto;
  flex-shrink: 0;
  
  &::-webkit-scrollbar {
    height: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: $border-subtle;
    border-radius: 2px;
  }
}

.settings-tab {
  padding: $spacing-03 $spacing-04;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: $text-secondary;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  cursor: pointer;
  transition: all $transition-fast ease;
  white-space: nowrap;
  
  &:hover {
    color: $text-primary;
    background-color: $bg-hover;
  }
  
  &--active {
    color: $text-primary;
    border-bottom-color: $accent-primary;
  }
}

.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.settings-section {
  margin-bottom: $spacing-06;
  
  &:last-child {
    margin-bottom: 0;
  }
  
  h3 {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-secondary;
    margin-bottom: $spacing-04;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.installation-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-02;
  max-height: 200px;
  overflow-y: auto;
}

.installation-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-03 $spacing-04;
  background-color: $bg-tertiary;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  cursor: pointer;
  transition: all $transition-fast ease;
  
  &:hover {
    border-color: $accent-primary;
  }
  
  &--selected {
    border-color: $accent-primary;
    background-color: rgba($accent-primary, 0.1);
  }
  
  &__info {
    display: flex;
    flex-direction: column;
    gap: $spacing-01;
    overflow: hidden;
  }
  
  &__version {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }
  
  &__path {
    font-size: $font-size-xs;
    color: $text-tertiary;
    font-family: $font-family-mono;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  &__check {
    color: $accent-primary;
    flex-shrink: 0;
  }
}

.installation-empty {
  padding: $spacing-04;
  text-align: center;
  color: $text-tertiary;
  font-size: $font-size-sm;
}

.form-group {
  margin-bottom: $spacing-04;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-secondary;
  margin-bottom: $spacing-02;
}

.form-hint {
  display: block;
  font-size: $font-size-xs;
  color: $text-tertiary;
  margin-top: $spacing-02;
}

.input-with-button {
  display: flex;
  gap: $spacing-03;
  
  input {
    flex: 1;
    min-width: 0;
  }
}

.setting-toggle {
  display: flex;
  align-items: flex-start;
  gap: $spacing-03;
  padding: $spacing-03;
  margin-bottom: $spacing-02;
  background-color: $bg-tertiary;
  border-radius: $radius-md;
  cursor: pointer;
  transition: background-color $transition-fast ease;
  
  &:hover {
    background-color: $bg-hover;
  }
  
  input {
    width: 18px;
    height: 18px;
    margin-top: 2px;
    accent-color: $accent-primary;
  }
  
  &__label {
    display: flex;
    flex-direction: column;
    gap: $spacing-01;
  }
  
  &__title {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }
  
  &__desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}
</style>
