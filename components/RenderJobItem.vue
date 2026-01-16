<template>
  <div 
    class="job-item" 
    :class="[`job-item--${job.status}`, { 'job-item--dragging': isDragging, 'job-item--selected': isSelected }]"
    :draggable="draggable && job.status !== 'rendering'"
    @click="handleClick"
    @contextmenu.prevent="handleContextMenu"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Context Menu -->
    <div 
      v-if="showContextMenu" 
      ref="contextMenuEl"
      class="context-menu" 
      :style="contextMenuPosition"
      @click.stop
    >
      <button class="context-menu__item" @click="openOutputFolder">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
        <span>Open Output Folder</span>
      </button>
      <button class="context-menu__item" @click="openProjectFolder">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z"/>
        </svg>
        <span>Open Project Folder</span>
      </button>
      <button class="context-menu__item" @click="openProject">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
        </svg>
        <span>Open Project in {{ appLabel }}</span>
      </button>
      <div class="context-menu__divider"></div>
      <button 
        class="context-menu__item" 
        @click="resetJob"
        :disabled="job.status === 'rendering' || job.status === 'idle'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
        <span>Reset to Pending</span>
      </button>
    </div>

    <div class="job-item__header">
      <div 
        class="job-item__drag-handle" 
        v-if="draggable && job.status !== 'rendering'"
        title="Drag to reorder"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>
      </div>
      <div class="job-item__info">
        <div class="job-item__status">
          <span class="badge" :class="[`badge--${job.status}`]">
            {{ statusLabel }}
          </span>
          <span 
            v-if="job.applicationType"
            class="badge badge--app"
            :class="[`badge--app-${job.applicationType}`]"
            :style="{ backgroundColor: appColor, color: appTextColor }"
          >
            {{ appLabel }}
          </span>
          <span class="job-item__index">#{{ index + 1 }}</span>
        </div>
        <h4 class="job-item__name">{{ job.fileName }}</h4>
        <p class="job-item__path">{{ job.filePath }}</p>
      </div>
      
      <div class="job-item__actions">
        <button 
          class="btn btn--ghost btn--icon btn--sm" 
          @click="expanded = !expanded"
          :title="expanded ? 'Collapse' : 'Expand'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path v-if="expanded" d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
            <path v-else d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
          </svg>
        </button>
        <button 
          class="btn btn--ghost btn--icon btn--sm text-error" 
          @click="$emit('remove')"
          :disabled="job.status === 'rendering'"
          title="Remove"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="job-item__progress">
      <div class="progress-bar">
        <div 
          class="progress-bar__fill" 
          :class="[`progress-bar__fill--${job.status}`]"
          :style="{ width: job.status === 'loading' ? '100%' : `${job.progress}%` }"
        />
      </div>
      <div class="job-item__progress-info">
        <span class="job-item__progress-text">
          <template v-if="job.status === 'loading'">
            Loading...
          </template>
          <template v-else>
            {{ Math.round(job.progress) }}%
            <template v-if="job.status === 'rendering' || job.status === 'paused'">
              • Frame {{ job.currentFrame }} / {{ job.totalFrames }}
              <template v-if="job.totalSamples > 0">
                • Sample {{ job.currentSample }} / {{ job.totalSamples }}
              </template>
            </template>
          </template>
        </span>
        <span v-if="job.estimatedTimeRemaining > 0 && job.status !== 'loading'" class="job-item__eta">
          ETA: {{ formatTime(job.estimatedTimeRemaining) }}
        </span>
      </div>
    </div>

    <!-- Expanded details -->
    <div v-if="expanded" class="job-item__details">
      <!-- Blender-specific settings -->
      <div v-if="job.applicationType === ApplicationType.BLENDER" class="job-item__section">
        <h5 class="job-item__section-title">Render Settings</h5>
        <div class="job-item__detail-grid">
          <div class="job-item__detail job-item__detail--editable">
            <label>Render Engine</label>
            <select 
              class="form-input form-input--sm"
              :value="job.appSettings?.engine || job.renderEngine"
              @change="updateBlenderEngine($event)"
              :disabled="job.status === 'rendering'"
            >
              <option value="">Use file setting ({{ job.renderEngine }})</option>
              <option value="CYCLES">Cycles</option>
              <option value="BLENDER_EEVEE">EEVEE</option>
              <option value="BLENDER_EEVEE_NEXT">EEVEE Next</option>
              <option value="BLENDER_WORKBENCH">Workbench</option>
            </select>
          </div>
          <div class="job-item__detail job-item__detail--editable">
            <label>Compute Device</label>
            <select 
              class="form-input form-input--sm"
              :value="job.appSettings?.cyclesDevice || ''"
              @change="updateCyclesDevice($event)"
              :disabled="job.status === 'rendering' || (job.appSettings?.engine && job.appSettings.engine !== 'CYCLES')"
            >
              <option value="">Use file setting</option>
              <option v-for="backend in gpuCapabilities.supportedBackends" :key="backend" :value="backend">
                {{ backend }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Maya-specific settings -->
      <div v-else-if="job.applicationType === ApplicationType.MAYA" class="job-item__section">
        <h5 class="job-item__section-title">Render Settings</h5>
        <div class="job-item__detail-grid">
          <div class="job-item__detail job-item__detail--editable">
            <label>Renderer</label>
            <select 
              class="form-input form-input--sm"
              :value="job.appSettings?.renderer || ''"
              @change="updateMayaRenderer($event)"
              :disabled="job.status === 'rendering'"
            >
              <option value="">Use file setting</option>
              <option value="arnold">Arnold</option>
              <option value="vray">V-Ray</option>
              <option value="renderman">RenderMan</option>
              <option value="redshift">Redshift</option>
              <option value="mayaSoftware">Maya Software</option>
              <option value="mayaHardware2">Maya Hardware 2.0</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Common info section -->
      <div class="job-item__detail-grid">
        <div class="job-item__detail">
          <label>Output Format</label>
          <span>{{ job.format }}</span>
        </div>
        <div class="job-item__detail">
          <label>FPS</label>
          <span>{{ job.fps }}</span>
        </div>
      </div>

      <!-- Resolution override -->
      <div class="job-item__section">
        <div class="job-item__frame-toggle">
          <label class="checkbox">
            <input 
              type="checkbox" 
              :checked="useCustomResolution"
              @change="toggleCustomResolution"
              :disabled="job.status === 'rendering'"
            />
            <span>Custom Resolution</span>
          </label>
        </div>
        
        <div v-if="!useCustomResolution" class="job-item__detail">
          <label>Resolution (from file)</label>
          <span>{{ job.resolution.x }}×{{ job.resolution.y }} @ {{ job.resolution.percentage }}%</span>
        </div>
        
        <div v-else class="job-item__resolution-input">
          <div class="job-item__resolution-fields">
            <div class="form-group form-group--inline">
              <label>Width</label>
              <input 
                type="number" 
                class="form-input form-input--sm"
                :value="customResolution.x"
                @input="updateCustomResolutionX($event)"
                :disabled="job.status === 'rendering'"
                min="1"
                max="16384"
              />
            </div>
            <span class="job-item__resolution-x">×</span>
            <div class="form-group form-group--inline">
              <label>Height</label>
              <input 
                type="number" 
                class="form-input form-input--sm"
                :value="customResolution.y"
                @input="updateCustomResolutionY($event)"
                :disabled="job.status === 'rendering'"
                min="1"
                max="16384"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="job-item__frame-range">
        <div class="job-item__frame-toggle">
          <label class="checkbox">
            <input 
              type="checkbox" 
              :checked="job.useCustomFrameRange"
              @change="toggleCustomFrameRange"
            />
            <span>Custom Frame Range</span>
          </label>
        </div>
        
        <div v-if="!job.useCustomFrameRange" class="job-item__detail">
          <label>Frame Range (from file)</label>
          <span class="font-mono">{{ job.originalFrameStart }} - {{ job.originalFrameEnd }}</span>
        </div>
        
        <div v-else class="job-item__frame-input">
          <label>Frame Range</label>
          <input 
            type="text" 
            class="form-input form-input--mono"
            :value="job.frameRanges"
            @input="updateFrameRanges($event)"
            placeholder="e.g., 1-100, 150-200, 250"
          />
          <p class="job-item__frame-hint">
            Supports multiple ranges: "1-10, 50-60, 100"
          </p>
        </div>
      </div>

      <!-- Output path override -->
      <div class="job-item__section">
        <div class="job-item__frame-toggle">
          <label class="checkbox">
            <input 
              type="checkbox" 
              :checked="useCustomOutputPath"
              @change="toggleCustomOutputPath"
              :disabled="job.status === 'rendering'"
            />
            <span>Custom Output Path</span>
          </label>
        </div>
        
        <div class="job-item__output">
          <label>Output Path {{ useCustomOutputPath ? '' : '(from file)' }}</label>
          <div class="job-item__output-path">
            <input 
              v-if="useCustomOutputPath"
              type="text"
              class="form-input form-input--sm form-input--mono"
              :value="customOutputPath"
              @input="updateCustomOutputPath($event)"
              :disabled="job.status === 'rendering'"
              placeholder="e.g., C:\renders\output_####"
            />
            <span v-else class="font-mono">{{ job.outputPath }}</span>
            <button 
              class="btn btn--ghost btn--icon btn--sm"
              @click="openOutputFolder"
              title="Open in Explorer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Error message -->
      <div v-if="job.error" class="job-item__error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span>{{ job.error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { RenderJob } from '~/stores/renderQueue';
import { ApplicationType, APPLICATION_INFO } from '~/types/applications';
import type { GpuCapabilities } from '~/types/electron';

// Legacy type alias
type BlendJob = RenderJob;

const props = defineProps<{
  job: RenderJob;
  index: number;
  draggable?: boolean;
  isSelected?: boolean;
}>();

const emit = defineEmits<{
  (e: 'remove'): void;
  (e: 'update', updates: Partial<RenderJob>): void;
  (e: 'dragstart', event: DragEvent): void;
  (e: 'dragend', event: DragEvent): void;
  (e: 'select'): void;
  (e: 'reset'): void;
}>();

const expanded = ref(false);
const isDragging = ref(false);
const showContextMenu = ref(false);
const contextMenuPosition = ref({ top: '0px', left: '0px' });
const contextMenuEl = ref<HTMLElement | null>(null);
let contextMenuListenersAttached = false;

// GPU capabilities for Blender device selection
const gpuCapabilities = ref<GpuCapabilities>({
  hasGpu: false,
  devices: [],
  supportedBackends: ['CPU'],
});

// Fetch GPU capabilities on mount
onMounted(async () => {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.getGpuCapabilities) {
    try {
      gpuCapabilities.value = await (window as any).electronAPI.getGpuCapabilities();
    } catch (e) {
      console.error('Failed to get GPU capabilities:', e);
    }
  }
});

// Computed properties for custom settings
const useCustomResolution = computed(() => {
  return !!(props.job.appSettings?.resolution);
});

const customResolution = computed(() => {
  return props.job.appSettings?.resolution || {
    x: props.job.resolution.x,
    y: props.job.resolution.y,
    percentage: props.job.resolution.percentage || 100,
  };
});

const useCustomOutputPath = computed(() => {
  return !!(props.job.appSettings?.outputPath);
});

const customOutputPath = computed(() => {
  return props.job.appSettings?.outputPath || props.job.outputPath;
});

// Methods for updating Blender settings
function updateBlenderEngine(event: Event) {
  const target = event.target as HTMLSelectElement;
  const value = target.value;
  const currentSettings = props.job.appSettings || {};
  emit('update', {
    appSettings: {
      ...currentSettings,
      engine: value || undefined,
    },
  });
}

function updateCyclesDevice(event: Event) {
  const target = event.target as HTMLSelectElement;
  const value = target.value;
  const currentSettings = props.job.appSettings || {};
  emit('update', {
    appSettings: {
      ...currentSettings,
      cyclesDevice: value || undefined,
    },
  });
}

function updateMayaRenderer(event: Event) {
  const target = event.target as HTMLSelectElement;
  const value = target.value;
  const currentSettings = props.job.appSettings || {};
  emit('update', {
    appSettings: {
      ...currentSettings,
      renderer: value || undefined,
    },
  });
}

function toggleCustomResolution() {
  const currentSettings = props.job.appSettings || {};
  if (useCustomResolution.value) {
    // Disable custom resolution
    const { resolution, ...rest } = currentSettings as any;
    emit('update', {
      appSettings: Object.keys(rest).length > 0 ? rest : undefined,
    });
  } else {
    // Enable custom resolution with current file values
    emit('update', {
      appSettings: {
        ...currentSettings,
        resolution: {
          x: props.job.resolution.x,
          y: props.job.resolution.y,
          percentage: props.job.resolution.percentage || 100,
        },
      },
    });
  }
}

function updateCustomResolutionX(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = parseInt(target.value) || props.job.resolution.x;
  const currentSettings = props.job.appSettings || {};
  emit('update', {
    appSettings: {
      ...currentSettings,
      resolution: {
        ...customResolution.value,
        x: value,
      },
    },
  });
}

function updateCustomResolutionY(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = parseInt(target.value) || props.job.resolution.y;
  const currentSettings = props.job.appSettings || {};
  emit('update', {
    appSettings: {
      ...currentSettings,
      resolution: {
        ...customResolution.value,
        y: value,
      },
    },
  });
}

function toggleCustomOutputPath() {
  const currentSettings = props.job.appSettings || {};
  if (useCustomOutputPath.value) {
    // Disable custom output path
    const { outputPath, ...rest } = currentSettings as any;
    emit('update', {
      appSettings: Object.keys(rest).length > 0 ? rest : undefined,
    });
  } else {
    // Enable custom output path with current file value
    emit('update', {
      appSettings: {
        ...currentSettings,
        outputPath: props.job.outputPath,
      },
    });
  }
}

function updateCustomOutputPath(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = target.value;
  const currentSettings = props.job.appSettings || {};
  emit('update', {
    appSettings: {
      ...currentSettings,
      outputPath: value,
    },
  });
}

const statusLabel = computed(() => {
  switch (props.job.status) {
    case 'idle': return 'Pending';
    case 'rendering': return 'Rendering';
    case 'paused': return 'Paused';
    case 'complete': return 'Complete';
    case 'error': return 'Error';
    case 'missing-app': return 'Missing App';
    case 'loading': return loadingLabel.value;
    default: return props.job.status;
  }
});

// Loading label - different text for After Effects/Nuke (comp) vs others (scene)
const loadingLabel = computed(() => {
  const appType = props.job.applicationType || ApplicationType.BLENDER;
  if (appType === ApplicationType.AFTER_EFFECTS || appType === ApplicationType.NUKE) {
    return 'Fetching comp metadata...';
  }
  return 'Fetching scene metadata...';
});

// Application type display
const appLabel = computed(() => {
  const appType = props.job.applicationType || ApplicationType.BLENDER;
  const info = APPLICATION_INFO[appType];
  return info?.label || 'Blender';
});

const appColor = computed(() => {
  const appType = props.job.applicationType || ApplicationType.BLENDER;
  const info = APPLICATION_INFO[appType];
  return info?.color || '#ff9966';
});

// Calculate perceived brightness for text contrast
// Uses formula: (R*299 + G*587 + B*114) / 1000
function getPerceivedBrightness(hexColor: string): number {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

const appTextColor = computed(() => {
  const bgColor = appColor.value;
  const brightness = getPerceivedBrightness(bgColor);
  // Use dark text on light backgrounds, white text on dark backgrounds
  return brightness > 128 ? '#1a1a1a' : '#ffffff';
});

function handleClick(e: MouseEvent) {
  // Don't trigger select if clicking on buttons or drag handle
  const target = e.target as HTMLElement;
  if (target.closest('button') || target.closest('.job-item__drag-handle')) {
    return;
  }
  emit('select');
}

function handleDragStart(e: DragEvent) {
  isDragging.value = true;
  emit('dragstart', e);
}

function handleDragEnd(e: DragEvent) {
  isDragging.value = false;
  emit('dragend', e);
}

function toggleCustomFrameRange() {
  emit('update', { 
    useCustomFrameRange: !props.job.useCustomFrameRange,
    frameRanges: props.job.useCustomFrameRange 
      ? `${props.job.originalFrameStart}-${props.job.originalFrameEnd}`
      : props.job.frameRanges
  });
}

function updateFrameRanges(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update', { frameRanges: target.value });
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function openOutputFolder() {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    (window as any).electronAPI.openInExplorer(props.job.outputDir);
  }
  closeContextMenu();
}

function onGlobalPointerDown(e: MouseEvent) {
  const target = e.target as Node | null;
  if (!target) {
    closeContextMenu();
    return;
  }

  const menu = contextMenuEl.value;
  if (menu && !menu.contains(target)) {
    closeContextMenu();
  }
}

function onGlobalContextMenu(e: MouseEvent) {
  const target = e.target as Node | null;
  const menu = contextMenuEl.value;

  // If the right-click happens outside the menu, close it.
  if (menu && target && !menu.contains(target)) {
    closeContextMenu();
  }
}

function attachContextMenuListeners() {
  if (contextMenuListenersAttached) return;
  // Capture phase so we can close the menu before other handlers run.
  document.addEventListener('click', onGlobalPointerDown, true);
  document.addEventListener('contextmenu', onGlobalContextMenu, true);
  window.addEventListener('resize', closeContextMenu);
  contextMenuListenersAttached = true;
}

function detachContextMenuListeners() {
  if (!contextMenuListenersAttached) return;
  document.removeEventListener('click', onGlobalPointerDown, true);
  document.removeEventListener('contextmenu', onGlobalContextMenu, true);
  window.removeEventListener('resize', closeContextMenu);
  contextMenuListenersAttached = false;
}

// Context menu handlers
function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();

  // Reset in case previous listeners/menu state is still around
  closeContextMenu();
  
  // Get the bounding rect of the job item to position the menu
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  
  // Position the menu at the click point, but relative to the item
  contextMenuPosition.value = {
    top: `${e.clientY - rect.top}px`,
    left: `${e.clientX - rect.left}px`
  };
  
  showContextMenu.value = true;
  
  // Attach global listeners after this event finishes bubbling.
  setTimeout(() => {
    attachContextMenuListeners();
  }, 0);
}

function closeContextMenu() {
  if (!showContextMenu.value) return;
  showContextMenu.value = false;
  detachContextMenuListeners();
}

function openProjectFolder() {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    // Get the directory containing the project file
    const filePath = props.job.filePath;
    (window as any).electronAPI.openInExplorer(filePath);
  }
  closeContextMenu();
}

function openProject() {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    // Open the project file with its default application (like double-clicking)
    (window as any).electronAPI.openFileWithDefaultApp(props.job.filePath);
  }
  closeContextMenu();
}

function resetJob() {
  if (props.job.status !== 'rendering' && props.job.status !== 'idle') {
    emit('update', {
      status: 'idle',
      progress: 0,
      currentFrame: 0,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      lastRenderedFrame: null,
      error: null,
      renderStartTime: null,
      frameTimes: [],
      renderedFramePaths: [],
    });
  }
  closeContextMenu();
}

// Cleanup on unmount
onUnmounted(() => {
  detachContextMenuListeners();
});
</script>

<style lang="scss">
.job-item {
  position: relative;
  background-color: $bg-tertiary;
  border: 1px solid $border-subtle;
  border-radius: $radius-lg;
  overflow: visible;
  transition: border-color $transition-fast ease, opacity $transition-fast ease, transform $transition-fast ease;
  
  &:hover {
    border-color: $border-strong;
  }
  
  &--dragging {
    opacity: 0.5;
    transform: scale(0.98);
  }
  
  &--selected {
    box-shadow: 0 0 0 2px $accent-primary;
  }
  
  &[draggable="true"] {
    cursor: grab;
    
    &:active {
      cursor: grabbing;
    }
  }
  
  &--rendering {
    border-color: $status-rendering;
    cursor: default !important;
    
    .job-item__name {
      color: $status-rendering;
    }
  }
  
  &--complete {
    border-color: $status-complete;
    
    .job-item__name {
      color: $status-complete;
    }
  }
  
  &--error {
    border-color: $status-error;
    
    .job-item__name {
      color: $status-error;
    }
  }
  
  &--paused {
    border-color: $status-paused;
    
    .job-item__name {
      color: $status-paused;
    }
  }
  
  &--loading {
    border-color: $text-tertiary;
    opacity: 0.8;
    
    .job-item__name {
      color: $text-secondary;
    }
  }
  
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: $spacing-04;
  }
  
  &__drag-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 40px;
    margin-right: $spacing-03;
    color: $text-tertiary;
    cursor: grab;
    flex-shrink: 0;
    border-radius: $radius-sm;
    transition: color $transition-fast ease, background-color $transition-fast ease;
    
    &:hover {
      color: $text-secondary;
      background-color: rgba($accent-primary, 0.1);
    }
    
    &:active {
      cursor: grabbing;
    }
  }
  
  &__info {
    flex: 1;
    min-width: 0;
  }
  
  &__status {
    display: flex;
    align-items: center;
    gap: $spacing-03;
    margin-bottom: $spacing-02;
  }
  
  &__index {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
  
  &__name {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin: 0 0 $spacing-01;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  &__path {
    font-size: $font-size-xs;
    color: $text-tertiary;
    font-family: $font-family-mono;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  &__actions {
    display: flex;
    gap: $spacing-01;
    flex-shrink: 0;
  }
  
  &__progress {
    padding: 0 $spacing-04 $spacing-04;
  }
  
  &__progress-info {
    display: flex;
    justify-content: space-between;
    margin-top: $spacing-02;
  }
  
  &__progress-text {
    font-size: $font-size-xs;
    color: $text-secondary;
  }
  
  &__eta {
    font-size: $font-size-xs;
    color: $text-tertiary;
    font-family: $font-family-mono;
  }
  
  &__details {
    padding: $spacing-04;
    border-top: 1px solid $border-subtle;
    background-color: rgba($bg-primary, 0.5);
  }
  
  &__detail-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: $spacing-03;
    margin-bottom: $spacing-04;
  }
  
  &__detail {
    label {
      display: block;
      font-size: $font-size-xs;
      color: $text-tertiary;
      margin-bottom: $spacing-01;
    }
    
    span {
      font-size: $font-size-sm;
      color: $text-primary;
    }
  }
  
  &__frame-range {
    margin-bottom: $spacing-04;
    padding-top: $spacing-04;
    border-top: 1px solid $border-subtle;
  }
  
  &__frame-toggle {
    margin-bottom: $spacing-03;
  }
  
  &__frame-input {
    label {
      display: block;
      font-size: $font-size-xs;
      color: $text-tertiary;
      margin-bottom: $spacing-02;
    }
    
    input {
      margin-bottom: $spacing-02;
    }
  }
  
  &__frame-hint {
    font-size: $font-size-xs;
    color: $text-tertiary;
    margin: 0;
  }
  
  &__output {
    label {
      display: block;
      font-size: $font-size-xs;
      color: $text-tertiary;
      margin-bottom: $spacing-02;
    }
  }
  
  &__output-path {
    display: flex;
    align-items: center;
    gap: $spacing-03;
    
    span, input {
      flex: 1;
      font-size: $font-size-xs;
      color: $text-secondary;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    input {
      color: $text-primary;
    }
  }
  
  &__error {
    display: flex;
    align-items: flex-start;
    gap: $spacing-03;
    padding: $spacing-03;
    margin-top: $spacing-04;
    background-color: rgba($status-error, 0.1);
    border-radius: $radius-md;
    color: $status-error;
    
    svg {
      flex-shrink: 0;
      margin-top: 2px;
    }
    
    span {
      font-size: $font-size-xs;
      word-break: break-word;
    }
  }
  
  &__section {
    margin-bottom: $spacing-04;
    padding-top: $spacing-04;
    border-top: 1px solid $border-subtle;
    
    &:first-child {
      padding-top: 0;
      border-top: none;
    }
  }
  
  &__section-title {
    font-size: $font-size-xs;
    font-weight: 600;
    color: $text-secondary;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: $spacing-03;
  }
  
  &__detail--editable {
    select, input {
      width: 100%;
      margin-top: $spacing-01;
    }
  }
  
  &__resolution-input {
    margin-top: $spacing-03;
  }
  
  &__resolution-fields {
    display: flex;
    align-items: flex-end;
    gap: $spacing-03;
    
    .form-group--inline {
      flex: 1;
      
      label {
        display: block;
        font-size: $font-size-xs;
        color: $text-tertiary;
        margin-bottom: $spacing-01;
      }
      
      input {
        width: 100%;
      }
    }
  }
  
  &__resolution-x {
    color: $text-tertiary;
    padding-bottom: $spacing-02;
    font-size: $font-size-sm;
  }
}

.checkbox {
  display: flex;
  align-items: center;
  gap: $spacing-03;
  cursor: pointer;
  
  input {
    width: 16px;
    height: 16px;
    accent-color: $accent-primary;
  }
  
  span {
    font-size: $font-size-sm;
    color: $text-primary;
  }
}

.context-menu {
  position: absolute;
  z-index: 1000;
  min-width: 200px;
  background-color: $bg-secondary;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: $spacing-02;
  
  &__item {
    display: flex;
    align-items: center;
    gap: $spacing-03;
    width: 100%;
    padding: $spacing-03 $spacing-04;
    background: none;
    border: none;
    border-radius: $radius-sm;
    color: $text-primary;
    font-size: $font-size-sm;
    text-align: left;
    cursor: pointer;
    transition: background-color $transition-fast ease;
    
    &:hover:not(:disabled) {
      background-color: rgba($accent-primary, 0.1);
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    svg {
      flex-shrink: 0;
      color: $text-secondary;
    }
  }
  
  &__divider {
    height: 1px;
    background-color: $border-subtle;
    margin: $spacing-02 0;
  }
}
</style>
