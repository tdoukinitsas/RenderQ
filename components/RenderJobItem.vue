<template>
  <div 
    class="job-item" 
    :class="[`job-item--${job.status}`, { 'job-item--dragging': isDragging, 'job-item--selected': isSelected }]"
    :draggable="draggable && job.status !== 'rendering'"
    :data-job-id="job.id"
    role="listitem"
    tabindex="0"
    :aria-label="ariaLabel"
    @click="handleClick"
    @dblclick="handleDoubleClick"
    @contextmenu.prevent="handleContextMenu"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <!-- Context Menu -->
    <div
      v-if="showContextMenu"
      ref="contextMenuEl"
      class="context-menu"
      role="menu"
      :aria-label="`Actions for ${job.fileName}`"
      :style="contextMenuPosition"
      @click.stop
      @keydown="handleMenuKeydown"
    >
      <template v-if="bulkCount <= 1">
        <button class="context-menu__item" role="menuitem" @click="openOutputFolder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
          <span>Open Output Folder</span>
        </button>
        <button class="context-menu__item" role="menuitem" @click="openProjectFolder">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z"/>
          </svg>
          <span>Open Project Folder</span>
        </button>
        <button class="context-menu__item" role="menuitem" @click="openProject">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
          </svg>
          <span>Open Project in {{ appLabel }}</span>
        </button>
        <div class="context-menu__divider" role="separator"></div>
        <button class="context-menu__item" role="menuitem" @click="menuAction('duplicate')" :disabled="job.status === 'loading'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
          </svg>
          <span>Duplicate</span>
        </button>
      </template>
      <button class="context-menu__item" role="menuitem" @click="menuAction('moveTop')" :disabled="bulkCount <= 1 && index === 0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 11h3v10h2V11h3l-4-4-4 4zM4 3v2h16V3H4z"/>
        </svg>
        <span>Move to Top{{ bulkSuffix }}</span>
      </button>
      <button class="context-menu__item" role="menuitem" @click="menuAction('moveBottom')" :disabled="bulkCount <= 1 && index === total - 1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16 13h-3V3h-2v10H8l4 4 4-4zM4 19v2h16v-2H4z"/>
        </svg>
        <span>Move to Bottom{{ bulkSuffix }}</span>
      </button>
      <div class="context-menu__divider" role="separator"></div>
      <button
        class="context-menu__item"
        role="menuitem"
        @click="menuAction('reset')"
        :disabled="bulkCount <= 1 && !canReset"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
        <span>Reset to Pending{{ bulkSuffix }}</span>
      </button>
      <button
        class="context-menu__item context-menu__item--danger"
        role="menuitem"
        @click="menuAction('remove')"
        :disabled="bulkCount <= 1 && (job.status === 'rendering' || job.status === 'paused')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
        <span>Remove{{ bulkSuffix }}</span>
      </button>
    </div>

    <div class="job-item__header">
      <div 
        class="job-item__drag-handle" 
        v-if="draggable && job.status !== 'rendering'"
        title="Drag to reorder (or Alt+↑/↓)"
        aria-hidden="true"
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
          @click="$emit('toggle-expand')"
          :title="expanded ? 'Hide settings' : 'Show settings'"
          :aria-label="`${expanded ? 'Hide' : 'Show'} settings for ${job.fileName}`"
          :aria-expanded="expanded"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path v-if="expanded" d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
            <path v-else d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
          </svg>
        </button>
        <button 
          class="btn btn--ghost btn--icon btn--sm text-error" 
          @click="$emit('remove')"
          :disabled="job.status === 'rendering' || job.status === 'paused'"
          title="Remove"
          :aria-label="`Remove ${job.fileName}`"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="job-item__progress">
      <div
        class="progress-bar"
        role="progressbar"
        :aria-label="`${job.fileName} progress`"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="job.status === 'loading' ? undefined : Math.round(job.progress)"
      >
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
            <template v-if="job.status === 'rendering' && job.renderPhase === 'probe'">
              • Checking for already rendered frames…
            </template>
            <template v-else-if="job.status === 'rendering' || job.status === 'paused'">
              • Frame {{ job.currentFrame }} / {{ job.totalFrames }}
              <template v-if="job.status === 'rendering' && (job.currentLayer || job.currentFrameNumber)">
                ({{ job.currentLayer ? `${job.currentLayer} ` : '' }}{{ job.currentFrameNumber ? `f${job.currentFrameNumber}` : '' }})
              </template>
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
              :value="job.appSettings?.engine || ''"
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

        <!-- View layers -->
        <div v-if="(job.viewLayers?.length || 0) > 1" class="job-item__subsection">
          <label class="job-item__sublabel">View Layers</label>
          <div class="job-item__layer-list">
            <label v-for="vl in job.viewLayers" :key="vl.name" class="checkbox">
              <input
                type="checkbox"
                :checked="selectedViewLayers.includes(vl.name)"
                @change="toggleViewLayer(vl.name, ($event.target as HTMLInputElement).checked)"
                :disabled="job.status === 'rendering'"
              />
              <span>{{ vl.name }}</span>
            </label>
          </div>
          <label class="checkbox" :title="'Renders every view layer in its own Blender process (much less memory). ' +
            'Use it when each view layer writes its own outputs (e.g. File Output nodes per layer). ' +
            'Each layer\'s main output goes to a sub-folder named after the layer.'">
            <input
              type="checkbox"
              :checked="!!blenderSettings.splitViewLayers"
              @change="updateBlenderSetting('splitViewLayers', ($event.target as HTMLInputElement).checked || undefined)"
              :disabled="job.status === 'rendering' || selectedViewLayers.length < 2"
            />
            <span>Render view layers separately</span>
          </label>
        </div>

        <div class="job-item__detail-grid">
          <div class="job-item__detail job-item__detail--editable">
            <label>Frames per Blender process</label>
            <input
              type="number"
              class="form-input form-input--sm"
              :value="blenderSettings.chunkSize || ''"
              @change="updateBlenderSetting('chunkSize', parseInt(($event.target as HTMLInputElement).value) || undefined)"
              :disabled="job.status === 'rendering' || movieOnly"
              min="1"
              :placeholder="blenderSettings.splitViewLayers ? 'Auto (100)' : 'Auto (whole range)'"
              title="Blender reloads the file once per process. Smaller chunks spread the frames of split view layers evenly (complete frames arrive sooner); movies are always written in one go."
            />
          </div>
        </div>

        <div class="job-item__subsection">
          <label class="checkbox" title="Frames whose output file already exists are not rendered again. Stop and start at any time: the render continues where it left off.">
            <input
              type="checkbox"
              :checked="blenderSettings.skipExisting !== false"
              @change="updateBlenderSetting('skipExisting', ($event.target as HTMLInputElement).checked ? undefined : false)"
              :disabled="job.status === 'rendering' || movieOnly"
            />
            <span>Skip frames that are already rendered{{ movieOnly ? ' (not for movie output)' : '' }}</span>
          </label>
          <label class="checkbox" title="Python drivers and scripts stored in the file run, as when you open it in Blender and allow auto-run.">
            <input
              type="checkbox"
              :checked="blenderSettings.allowPythonScripts !== false"
              @change="updateBlenderSetting('allowPythonScripts', ($event.target as HTMLInputElement).checked ? undefined : false)"
              :disabled="job.status === 'rendering'"
            />
            <span>Allow Python drivers &amp; scripts</span>
          </label>
          <p v-if="blenderSettings.allowPythonScripts === false && (job.pythonDriverCount || 0) > 0" class="job-item__warning">
            This file has {{ job.pythonDriverCount }} Python driver(s); they will not evaluate with scripts disabled.
          </p>
          <label class="checkbox" title="Start Blender with factory settings: ignores your preferences and add-ons (GPU devices then come only from 'Compute Device').">
            <input
              type="checkbox"
              :checked="!!blenderSettings.factoryStartup"
              @change="updateBlenderSetting('factoryStartup', ($event.target as HTMLInputElement).checked || undefined)"
              :disabled="job.status === 'rendering'"
            />
            <span>Factory startup (no preferences / add-ons)</span>
          </label>
        </div>

        <details class="job-item__advanced" :open="!!blenderSettings.preRenderPython">
          <summary>Pre-render Python</summary>
          <textarea
            class="form-input form-input--mono job-item__code"
            rows="4"
            :value="blenderSettings.preRenderPython || ''"
            @change="updateBlenderSetting('preRenderPython', ($event.target as HTMLTextAreaElement).value.trim() || undefined)"
            :disabled="job.status === 'rendering'"
            placeholder="# runs inside Blender before rendering&#10;# available: bpy, scene, layer (view layer of a split render, else None)"
            spellcheck="false"
          ></textarea>
        </details>
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

      <!-- Nuke-specific settings -->
      <div v-else-if="job.applicationType === ApplicationType.NUKE" class="job-item__section">
        <h5 class="job-item__section-title">Render Settings</h5>
        <div v-if="job.nukeVersion" class="job-item__detail">
          <label>Nuke</label>
          <span>{{ job.nukeVersion }}{{ nukeLicenseLabel ? ` · ${nukeLicenseLabel}` : '' }}{{ job.nukeGuiMode ? ' · GUI mode (hidden)' : '' }}</span>
        </div>
        <p v-if="job.nukeGuiMode && job.nukeGuiReason" class="job-item__muted" :title="'Nuke renders this comp in its GUI mode, without a window, because ' + job.nukeGuiReason">
          GUI mode: {{ job.nukeGuiReason }}
        </p>

        <!-- Write nodes -->
        <div v-if="(job.writeNodes?.length || 0) > 0" class="job-item__subsection">
          <label class="job-item__sublabel">Write Nodes</label>
          <div class="job-item__layer-list">
            <label
              v-for="w in job.writeNodes"
              :key="w.name"
              class="checkbox"
              :title="w.connected ? w.file : `${w.file} (no input: nothing to render)`"
            >
              <input
                type="checkbox"
                :checked="selectedWrites.includes(w.name)"
                @change="toggleWrite(w.name, ($event.target as HTMLInputElement).checked)"
                :disabled="job.status === 'rendering' || !w.connected"
              />
              <span>{{ w.name }} <span class="job-item__muted">{{ writeSummary(w) }}</span></span>
            </label>
          </div>
          <p v-for="w in writesWithoutFrameNumber" :key="`nf-${w.name}`" class="job-item__warning">
            {{ w.name }} writes "{{ baseName(w.file) }}": there is no frame number (####) in the file name, so every frame overwrites the same file.
          </p>
        </div>
        <p v-else class="job-item__warning">No Write nodes found in this comp.</p>

        <div class="job-item__detail-grid">
          <div class="job-item__detail job-item__detail--editable">
            <label>Frames per Nuke process</label>
            <input
              type="number"
              class="form-input form-input--sm"
              :value="nukeSettings.chunkSize || ''"
              @change="updateJobSetting('chunkSize', parseInt(($event.target as HTMLInputElement).value) || undefined)"
              :disabled="job.status === 'rendering'"
              min="1"
              placeholder="Auto (all in one process)"
              title="Nuke loads the comp once per process. Smaller chunks restart Nuke now and then (frees memory on long renders)."
            />
          </div>
        </div>

        <div class="job-item__subsection">
          <label class="checkbox" title="Frames whose output files already exist are not rendered again. Stop and start at any time: the render continues where it left off.">
            <input
              type="checkbox"
              :checked="nukeSettings.skipExisting !== false"
              @change="updateJobSetting('skipExisting', ($event.target as HTMLInputElement).checked ? undefined : false)"
              :disabled="job.status === 'rendering' || nukeMovieSelected"
            />
            <span>Skip frames that are already rendered{{ nukeMovieSelected ? ' (not for movie output)' : '' }}</span>
          </label>
          <label class="checkbox" title="Render even if Nuke reports errors while loading the comp (e.g. a gizmo knob expression), as the Nuke GUI does. Off: such errors stop the job.">
            <input
              type="checkbox"
              :checked="nukeSettings.ignoreLoadErrors !== false"
              @change="updateJobSetting('ignoreLoadErrors', ($event.target as HTMLInputElement).checked ? undefined : false)"
              :disabled="job.status === 'rendering'"
            />
            <span>Ignore errors while loading the comp (like the Nuke GUI)</span>
          </label>
          <p v-if="(job.loadErrors?.length || 0) > 0" class="job-item__warning">
            Loading the comp reported: {{ (job.loadErrors || []).join('; ') }}
          </p>
        </div>

        <details class="job-item__advanced" :open="!!nukeSettings.preRenderPython">
          <summary>Pre-render Python</summary>
          <textarea
            class="form-input form-input--mono job-item__code"
            rows="4"
            :value="nukeSettings.preRenderPython || ''"
            @change="updateJobSetting('preRenderPython', ($event.target as HTMLTextAreaElement).value.trim() || undefined)"
            :disabled="job.status === 'rendering'"
            placeholder="# runs inside Nuke after the comp is loaded&#10;# available: nuke, tcl(cmd) - e.g. tcl('knob Grade1.white 1.2')&#10;# Nuke Indie: use tcl(), it allows only 10 Python Node objects"
            spellcheck="false"
          ></textarea>
        </details>
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

      <!-- Resolution override (Nuke jobs render their Write nodes as set up in the comp) -->
      <div v-if="job.applicationType !== ApplicationType.NUKE" class="job-item__section">
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

      <!-- Output path override (Nuke: the Write nodes' paths, listed above) -->
      <div v-if="job.applicationType !== ApplicationType.NUKE" class="job-item__section">
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
              aria-label="Open output folder"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Error message -->
      <div v-if="job.error" class="job-item__error" role="alert">
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
import type { RenderJob, JobMenuAction } from '~/stores/renderQueue';
import {
  ApplicationType, APPLICATION_INFO, type BlenderRenderSettings, type NukeRenderSettings, type NukeWriteNodeInfo,
} from '~/types/applications';
import type { GpuCapabilities } from '~/types/electron';

// Legacy type alias
type BlendJob = RenderJob;

const props = defineProps<{
  job: RenderJob;
  index: number;
  total?: number;          // jobs in the queue
  draggable?: boolean;
  isSelected?: boolean;
  expanded?: boolean;
  selectionCount?: number; // selected jobs: context-menu actions apply to all of them when this one is selected
}>();

const emit = defineEmits<{
  (e: 'remove'): void;
  (e: 'update', updates: Partial<RenderJob>): void;
  (e: 'dragstart', event: DragEvent): void;
  (e: 'dragend', event: DragEvent): void;
  (e: 'select', modifiers: { ctrl: boolean; shift: boolean; context?: boolean }): void;
  (e: 'toggle-expand'): void;
  (e: 'action', action: JobMenuAction): void;
}>();

const total = computed(() => props.total ?? props.index + 1);
const bulkCount = computed(() => (props.isSelected ? props.selectionCount || 1 : 1));
const bulkSuffix = computed(() => (bulkCount.value > 1 ? ` (${bulkCount.value} jobs)` : ''));
const canReset = computed(() => !['rendering', 'idle', 'loading', 'missing-app'].includes(props.job.status));
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

// Blender job options (unset keys = defaults: file's view layers, auto chunks, skip existing, scripts allowed)
const blenderSettings = computed<BlenderRenderSettings>(() => (props.job.appSettings || {}) as BlenderRenderSettings);

// The file writes a movie and no pre-render script could switch it to images: no chunks, no skipping
const movieOnly = computed(() => !!props.job.isVideoOutput && !blenderSettings.value.preRenderPython);

const selectedViewLayers = computed<string[]>(() => {
  const chosen = blenderSettings.value.viewLayers;
  if (chosen?.length) return chosen;
  return (props.job.viewLayers || []).filter(vl => vl.use).map(vl => vl.name);
});

function updateBlenderSetting<K extends keyof BlenderRenderSettings>(key: K, value: BlenderRenderSettings[K] | undefined) {
  const next: any = { ...(props.job.appSettings || {}) };
  if (value === undefined) delete next[key];
  else next[key] = value;
  emit('update', { appSettings: Object.keys(next).length > 0 ? next : undefined });
}

function toggleViewLayer(name: string, checked: boolean) {
  const all = (props.job.viewLayers || []).map(vl => vl.name);
  const set = new Set(selectedViewLayers.value);
  if (checked) set.add(name);
  else set.delete(name);
  if (set.size === 0) return;   // at least one layer
  const chosen = all.filter(n => set.has(n));
  const fileDefault = (props.job.viewLayers || []).filter(vl => vl.use).map(vl => vl.name);
  const same = chosen.length === fileDefault.length && chosen.every((n, i) => n === fileDefault[i]);
  updateBlenderSetting('viewLayers', same ? undefined : chosen);
}

// Nuke job options (unset keys = defaults: the comp's enabled Write nodes, one process, skip existing)
const nukeSettings = computed<NukeRenderSettings>(() => (props.job.appSettings || {}) as NukeRenderSettings);

const NUKE_LICENSE_LABELS: Record<string, string> = {
  nuke: 'Nuke', 'nuke-interactive': 'Nuke (interactive licence)', nukex: 'NukeX',
  'nukex-interactive': 'NukeX (interactive licence)', indie: 'Indie', nc: 'Non-commercial',
};
const nukeLicenseLabel = computed(() => NUKE_LICENSE_LABELS[props.job.nukeLicense || ''] || '');

const selectedWrites = computed<string[]>(() => {
  const chosen = nukeSettings.value.writes;
  if (chosen?.length) return chosen;
  return (props.job.writeNodes || []).filter(w => !w.disabled && w.connected).map(w => w.name);
});

const selectedWriteInfos = computed(() => (props.job.writeNodes || []).filter(w => selectedWrites.value.includes(w.name)));
const writesWithoutFrameNumber = computed(() => selectedWriteInfos.value.filter(w => !w.movie && !w.hasFrameNumber));
const nukeMovieSelected = computed(() => selectedWriteInfos.value.some(w => w.movie));

function writeSummary(w: NukeWriteNodeInfo) {
  const parts = [w.fileType || w.class];
  if (w.disabled) parts.push('disabled in comp');
  if (!w.connected) parts.push('no input');
  if (w.useLimit) parts.push(`frames ${w.first}-${w.last}`);
  return parts.join(' · ');
}

function baseName(p: string) {
  return String(p || '').split(/[\\/]/).pop() || p;
}

function updateJobSetting(key: string, value: any) {
  const next: any = { ...(props.job.appSettings || {}) };
  if (value === undefined) delete next[key];
  else next[key] = value;
  emit('update', { appSettings: Object.keys(next).length > 0 ? next : undefined });
}

function toggleWrite(name: string, checked: boolean) {
  const all = (props.job.writeNodes || []).map(w => w.name);
  const set = new Set(selectedWrites.value);
  if (checked) set.add(name);
  else set.delete(name);
  if (set.size === 0) return;   // at least one Write node
  const chosen = all.filter(n => set.has(n));
  const compDefault = (props.job.writeNodes || []).filter(w => !w.disabled && w.connected).map(w => w.name);
  const same = chosen.length === compDefault.length && chosen.every((n, i) => n === compDefault[i]);
  updateJobSetting('writes', same ? undefined : chosen);
}

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

const ariaLabel = computed(() => {
  const parts = [props.job.fileName, appLabel.value, statusLabel.value];
  if (props.job.status !== 'loading') parts.push(`${Math.round(props.job.progress)}%`);
  if (props.isSelected) parts.push('selected');
  return parts.join(', ');
});

// Clicks on the controls and settings inside the card don't change the selection
function isInteractive(target: HTMLElement) {
  return !!target.closest('button, input, select, textarea, label, summary, a, .job-item__drag-handle, .job-item__details, .context-menu');
}

function handleClick(e: MouseEvent) {
  // the second click of a double-click (which expands the job) must not deselect it
  if (e.detail > 1 || isInteractive(e.target as HTMLElement)) return;
  emit('select', { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
}

function handleDoubleClick(e: MouseEvent) {
  if (isInteractive(e.target as HTMLElement)) return;
  emit('toggle-expand');
}

function menuAction(action: JobMenuAction) {
  closeContextMenu();
  emit('action', action);
}

// Arrow keys move between menu items; Escape or Tab closes the menu
function handleMenuKeydown(e: KeyboardEvent) {
  const menu = contextMenuEl.value;
  const items = Array.from(menu?.querySelectorAll<HTMLButtonElement>('.context-menu__item:not(:disabled)') || []);
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  let next: HTMLButtonElement | undefined;
  if (e.key === 'ArrowDown') next = items[(current + 1) % items.length];
  else if (e.key === 'ArrowUp') next = items[(current - 1 + items.length) % items.length];
  else if (e.key === 'Home') next = items[0];
  else if (e.key === 'End') next = items[items.length - 1];
  else if (e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault();
    e.stopPropagation();
    const card = menu?.closest('.job-item') as HTMLElement | null;
    closeContextMenu();
    card?.focus();
    return;
  } else return;
  e.preventDefault();
  e.stopPropagation();
  next?.focus();
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
  
  // Right-clicking a job outside the selection selects it first
  emit('select', { ctrl: false, shift: false, context: true });

  // Get the bounding rect of the job item to position the menu
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

  // Position the menu at the click point, but relative to the item
  // (opened from the keyboard with Shift+F10 / the Menu key there is no pointer position)
  const fromKeyboard = e.clientX === 0 && e.clientY === 0;
  contextMenuPosition.value = {
    top: fromKeyboard ? '16px' : `${e.clientY - rect.top}px`,
    left: fromKeyboard ? '16px' : `${e.clientX - rect.left}px`
  };

  showContextMenu.value = true;

  // Attach global listeners after this event finishes bubbling, and focus the first item.
  setTimeout(() => {
    attachContextMenuListeners();
    contextMenuEl.value?.querySelector<HTMLButtonElement>('.context-menu__item:not(:disabled)')?.focus();
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

  &__subsection {
    display: flex;
    flex-direction: column;
    gap: $spacing-02;
    margin-bottom: $spacing-04;
  }

  &__sublabel {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  &__layer-list {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-02 $spacing-04;
  }

  &__warning {
    font-size: $font-size-xs;
    color: $status-paused;
    margin: 0;
  }

  &__muted {
    opacity: 0.6;
    font-size: $font-size-xs;
  }

  &__advanced {
    margin-bottom: $spacing-04;

    summary {
      cursor: pointer;
      font-size: $font-size-xs;
      color: $text-tertiary;
      margin-bottom: $spacing-02;
    }
  }

  &__code {
    width: 100%;
    resize: vertical;
    font-size: $font-size-xs;
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
    
    &:hover:not(:disabled),
    &:focus-visible {
      background-color: rgba($accent-primary, 0.1);
    }

    &:focus-visible {
      outline-offset: -2px;
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    svg {
      flex-shrink: 0;
      color: $text-secondary;
    }

    &--danger {
      color: $status-error;

      svg {
        color: $status-error;
      }
    }
  }
  
  &__divider {
    height: 1px;
    background-color: $border-subtle;
    margin: $spacing-02 0;
  }
}
</style>
