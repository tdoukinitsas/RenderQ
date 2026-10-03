<template>
  <div class="main-layout">
    <!-- Header -->
    <header class="header">
      <div class="header__left">
        <div class="logo">
          <img src="/icon.svg" alt="RenderQ" width="24" height="24" class="logo__icon" />
          <h1>RenderQ</h1>
          <span class="version-badge">v{{ appVersion }}</span>
        </div>
      </div>
      
      <div class="header__center">
        <div v-if="!renderQueue.isRendering && queueSummary.length" class="queue-summary" aria-label="Queue summary">
          <span v-for="item in queueSummary" :key="item.key" class="queue-summary__item" :class="`queue-summary__item--${item.key}`">
            {{ item.text }}
          </span>
        </div>
        <div v-if="renderQueue.isRendering" class="global-progress global-progress--full">
          <div class="progress-bar-wrapper">
            <div
              class="progress-bar"
              role="progressbar"
              aria-label="Queue progress"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="Math.round(renderQueue.totalProgress)"
            >
              <div 
                class="progress-bar__fill progress-bar__fill--rendering" 
                :style="{ width: `${renderQueue.totalProgress}%` }"
              />
            </div>
            <div class="progress-info">
              <span class="progress-info__text">
                {{ Math.round(renderQueue.totalProgress) }}%
              </span>
              <span v-if="renderQueue.totalEstimatedTime > 0" class="progress-info__time">
                {{ formatTime(renderQueue.totalEstimatedTime) }} remaining • Completes {{ formatCompletionTime(renderQueue.totalEstimatedTime) }}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="header__right">
        <button
          class="btn btn--ghost btn--icon"
          @click="showShortcuts = true"
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
          </svg>
        </button>
        <button class="btn btn--ghost btn--icon" @click="showSettings = true" title="Settings" aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Main content -->
    <main class="main" :class="{ 'main--resizing': isResizing || isVerticalResizing || layoutSettling }">
      <!-- Left panel: Queue -->
      <section
        id="queue-panel"
        class="panel panel--queue" 
        :class="{ 'panel--collapsed': queueCollapsed }"
        :style="queuePanelStyle"
      >
        <div class="panel__header" v-if="!queueCollapsed">
          <h2 id="queue-heading">Render Queue</h2>
          <div class="panel__actions">
            <button class="btn btn--primary btn--sm" @click="addBlendFiles" title="Add scene files (Ctrl+I)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              Add Files
            </button>
            <button 
              class="btn btn--ghost btn--sm" 
              @click="() => loadQueue()"
              title="Load Queue (Ctrl+O)"
              aria-label="Load queue"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
              </svg>
            </button>
            <button 
              class="btn btn--ghost btn--sm" 
              @click="() => saveQueue(false)"
              :disabled="!renderQueue.hasJobs"
              title="Save Queue (Ctrl+S)"
              aria-label="Save queue"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm2 16H5V5h11.17L19 7.83V19zm-7-7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zM6 6h9v4H6V6z"/>
              </svg>
            </button>
            <button 
              class="btn btn--ghost btn--sm" 
              @click="renderQueue.clearCompleted"
              :disabled="renderQueue.completedJobs.length === 0"
              title="Clear Completed"
              aria-label="Clear completed jobs"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
              </svg>
            </button>
            <button
              class="btn btn--ghost btn--sm"
              @click="collapseQueue"
              title="Hide queue"
              aria-label="Hide queue panel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Bulk actions for a multi-selection -->
        <div v-if="!queueCollapsed && renderQueue.selectedJobIds.length > 1" class="selection-bar" role="toolbar" aria-label="Selected jobs">
          <span class="selection-bar__count">{{ renderQueue.selectedJobIds.length }} selected</span>
          <button class="btn btn--ghost btn--sm" @click="renderQueue.moveJobsBy(renderQueue.selectedJobIds, -1)" title="Move up (Alt+↑)" aria-label="Move selected jobs up">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
          </button>
          <button class="btn btn--ghost btn--sm" @click="renderQueue.moveJobsBy(renderQueue.selectedJobIds, 1)" title="Move down (Alt+↓)" aria-label="Move selected jobs down">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
          </button>
          <button class="btn btn--ghost btn--sm" @click="renderQueue.resetJobs(renderQueue.selectedJobIds)">Reset</button>
          <button class="btn btn--ghost btn--sm text-error" @click="removeSelectedJobs" title="Remove (Delete)">Remove</button>
          <button class="btn btn--ghost btn--sm selection-bar__clear" @click="renderQueue.selectJob(null)" title="Clear selection (Esc)" aria-label="Clear selection">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        
        <div 
          class="panel__content"
          v-if="!queueCollapsed"
          @drop="handleDrop"
          @dragover.prevent="handleDragOver"
          @dragleave="handleDragLeave"
          :class="{ 'panel__content--drag-over': isDragOver }"
        >
          <div v-if="!renderQueue.hasJobs" class="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" class="empty-state__icon">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
            </svg>
            <h3>No files in queue</h3>
            <p>Click "Add Files" or drag & drop scene files here</p>
            <p class="empty-state__hint">.blend, .c4d, .hip, .aep, .nk, .ma, .mb</p>
          </div>
          
          <div v-else class="job-list" ref="jobListRef" role="list" aria-labelledby="queue-heading">
            <div
              v-for="(job, index) in renderQueue.jobs" 
              :key="job.id"
              class="job-wrapper"
              :class="{ 'job-wrapper--drop-before': dragOverIndex === index && dragDirection === 'before', 'job-wrapper--drop-after': dragOverIndex === index && dragDirection === 'after' }"
              @dragover.prevent="handleJobDragOver($event, index)"
              @dragleave="handleJobDragLeave"
              @drop="handleJobDrop($event, index)"
            >
              <RenderJobItem 
                :job="job"
                :index="index"
                :total="renderQueue.jobs.length"
                :draggable="job.status !== 'rendering'"
                :is-selected="renderQueue.selectedJobIds.includes(job.id)"
                :expanded="expandedJobIds.has(job.id)"
                :selection-count="renderQueue.selectedJobIds.length"
                @remove="renderQueue.removeJob(job.id)"
                @update="(updates) => renderQueue.updateJob(job.id, updates)"
                @select="(modifiers) => handleJobSelect(job.id, modifiers)"
                @toggle-expand="toggleJobExpanded(job.id)"
                @action="(action) => handleJobAction(job.id, action)"
                @dragstart="handleJobDragStart($event, index)"
                @dragend="handleJobDragEnd"
              />
            </div>
          </div>
        </div>
        
        <div class="panel__footer">
          <div class="render-controls">
            <button 
              v-if="!renderQueue.isRendering"
              class="btn btn--primary btn--lg"
              :disabled="renderQueue.pendingJobs.length === 0"
              @click="startRendering"
              title="Start rendering (Space)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Start Rendering
            </button>
            
            <template v-else>
              <button 
                v-if="!renderQueue.isPaused"
                class="btn btn--secondary btn--lg"
                @click="pauseRendering"
                title="Pause (Space)"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
                Pause
              </button>
              
              <button 
                v-else
                class="btn btn--primary btn--lg"
                @click="resumeRendering"
                title="Resume (Space)"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Resume
              </button>
              
              <button 
                class="btn btn--danger btn--lg"
                @click="stopRendering"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M6 6h12v12H6z"/>
                </svg>
                Stop
              </button>
            </template>
          </div>
        </div>
      </section>

      <!-- Resize handle -->
      <div 
        class="resize-handle"
        :class="{ 'resize-handle--dragging': isResizing, 'resize-handle--collapsed-left': queueCollapsed, 'resize-handle--collapsed-right': previewCollapsed }"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-label="Resize queue and preview panels"
        aria-controls="queue-panel info-panel"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="horizontalSplitValue"
        :aria-valuetext="`Queue ${horizontalSplitValue}% of the width`"
        title="Drag to resize · double-click to reset · Enter to hide or show the queue"
        @mousedown="startResize"
        @dblclick="resetHorizontalLayout"
        @keydown="handleHorizontalSplitterKey"
      >
        <div class="resize-handle__grip" aria-hidden="true">
          <svg width="6" height="20" viewBox="0 0 6 20" fill="currentColor">
            <circle cx="1" cy="4" r="1"/>
            <circle cx="5" cy="4" r="1"/>
            <circle cx="1" cy="10" r="1"/>
            <circle cx="5" cy="10" r="1"/>
            <circle cx="1" cy="16" r="1"/>
            <circle cx="5" cy="16" r="1"/>
          </svg>
        </div>
        <button
          v-if="queueCollapsed"
          class="resize-handle__label resize-handle__label--left"
          title="Show queue"
          aria-label="Show queue panel"
          tabindex="-1"
          @mousedown.stop
          @dblclick.stop
          @click.stop="queueCollapsed = false"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
          </svg>
        </button>
        <button
          v-if="previewCollapsed"
          class="resize-handle__label resize-handle__label--right"
          title="Show preview & system monitor"
          aria-label="Show preview and system monitor panel"
          tabindex="-1"
          @mousedown.stop
          @dblclick.stop
          @click.stop="previewCollapsed = false"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/>
          </svg>
        </button>
      </div>

      <!-- Right panel: Preview & System Monitor -->
      <section
        id="info-panel"
        class="panel panel--info"
        :class="{ 'panel--collapsed': previewCollapsed }"
        :style="infoPanelStyle"
      >
        <!-- Preview -->
        <div
          class="preview-section"
          v-if="!previewCollapsed || previewFullscreen"
          :class="{ 'preview-section--minimized': previewMinimized && !previewFullscreen, 'preview-section--fullscreen': previewFullscreen }"
          :style="previewFullscreen ? undefined : previewSectionStyle"
          :role="previewFullscreen ? 'dialog' : undefined"
          :aria-modal="previewFullscreen ? 'true' : undefined"
          aria-labelledby="preview-heading"
        >
          <div class="panel__header">
            <h2 id="preview-heading">Preview</h2>
            <div class="preview-header-controls">
              <!-- Preview Toggle -->
              <button
                class="btn btn--ghost btn--sm"
                :class="{ 'btn--active': previewEnabled }"
                @click="previewEnabled = !previewEnabled"
                title="Toggle preview (disable to save performance)"
                :aria-label="previewEnabled ? 'Turn preview off' : 'Turn preview on'"
                :aria-pressed="previewEnabled"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path v-if="previewEnabled" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  <path v-else d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                </svg>
              </button>
              <!-- EXR Layer Selector -->
              <select 
                v-if="(currentPreviewJob?.format === 'OPEN_EXR' || currentPreviewJob?.format === 'OPEN_EXR_MULTILAYER') && previewEnabled"
                class="form-select form-select--sm"
                :value="renderQueue.selectedExrLayer || 'Combined'"
                @change="handleExrLayerChange"
                aria-label="EXR layer"
              >
                <option 
                  v-for="layer in (currentPreviewJob?.exrLayers?.length ? currentPreviewJob.exrLayers : ['Combined'])" 
                  :key="layer" 
                  :value="layer"
                >
                  {{ layer }}
                </option>
              </select>
              <span v-if="previewFileName" class="preview-path" :title="previewFileName">
                {{ previewFileName }}
              </span>
            </div>
            <div class="preview-header-controls preview-header-controls--end">
              <!-- Zoom -->
              <div v-if="canZoomPreview" class="zoom-controls" role="group" aria-label="Zoom">
                <button class="btn btn--ghost btn--sm" :class="{ 'btn--active': previewZoom === null }" @click="fitPreview" title="Fit to panel (0)">Fit</button>
                <button class="btn btn--ghost btn--sm" :class="{ 'btn--active': previewZoom === 1 }" @click="setPreviewZoom(1)" title="Actual size (1)">1:1</button>
                <span class="zoom-controls__value" aria-live="polite">{{ previewZoomPercent }}%</span>
              </div>
              <button
                v-if="currentPreviewImage && previewEnabled"
                class="btn btn--ghost btn--sm"
                @click="openPreviewInExplorer"
                title="Show frame in folder"
                aria-label="Show frame in folder"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
                </svg>
              </button>
              <button
                class="btn btn--ghost btn--sm"
                @click="togglePreviewFullscreen"
                :title="previewFullscreen ? 'Exit full view (Esc)' : 'Full view (F)'"
                :aria-label="previewFullscreen ? 'Exit full view' : 'Show preview in full view'"
                :aria-pressed="previewFullscreen"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path v-if="previewFullscreen" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                  <path v-else d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                </svg>
              </button>
              <button
                v-if="!previewFullscreen"
                class="btn btn--ghost btn--sm"
                @click="minimizePreview"
                title="Hide preview"
                aria-label="Hide preview"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
                </svg>
              </button>
              <button
                v-if="!previewFullscreen"
                class="btn btn--ghost btn--sm"
                @click="collapseInfoPanel"
                title="Hide preview & system monitor"
                aria-label="Hide preview and system monitor panel"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
                </svg>
              </button>
            </div>
          </div>

          <div
            ref="previewContainerRef"
            class="preview-container"
            :class="{ 'preview-container--zoomed': previewZoom !== null, 'preview-container--panning': isPanningPreview }"
            @click="handlePreviewContainerClick"
            @dblclick="handlePreviewDoubleClick"
            @wheel="handlePreviewWheel"
            @mousedown="startPreviewPan"
          >
            <!-- Video Preview (for completed video renders) -->
            <template v-if="isVideoPreview">
              <div v-if="currentPreviewJob?.status !== 'complete'" class="empty-state empty-state--small">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" class="empty-state__icon">
                  <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                </svg>
                <p>Video preview will be available when rendering is complete</p>
              </div>
              <video 
                v-else-if="videoPreviewSrc"
                ref="videoPlayerRef"
                class="preview-video"
                :src="videoPreviewSrc"
                controls
                @click.stop
              />
            </template>
            
            <!-- Image Sequence Preview -->
            <template v-else>
              <div v-if="!currentPreviewImage || !previewEnabled" class="empty-state empty-state--small">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" class="empty-state__icon">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
                <p>{{ previewStatusMessage }}</p>
                <div v-if="previewUnsupportedPath && currentPreviewImage" class="preview-unsupported-actions">
                  <button class="btn btn--ghost btn--sm" @click.stop="openPreviewInSystemViewer">
                    Open image in system viewer
                  </button>
                </div>
              </div>
              <img
                v-else
                :src="currentPreviewImage"
                :alt="previewFileName ? `Render preview: ${previewFileName}` : 'Render preview'"
                class="preview-image"
                :style="previewImageStyle"
                draggable="false"
                @click.stop
                @load="handlePreviewImgLoad"
                @error="handlePreviewImgError"
              />
            </template>
          </div>
          
          <!-- Sequence Playback Controls -->
          <div 
            v-if="!isVideoPreview && currentPreviewJob && (currentPreviewJob.renderedFramePaths?.length ?? 0) > 1"
            class="preview-controls"
          >
            <button
              class="btn btn--ghost btn--icon btn--sm"
              @click="stepPreviewFrame(-1)"
              :disabled="previewFrameIndex <= 0"
              title="Previous frame (←)"
              aria-label="Previous frame"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>
            <button
              class="btn btn--ghost btn--icon btn--sm"
              @click="toggleSequencePlayback"
              :title="renderQueue.isSequencePlayback ? 'Stop Playback' : 'Play Sequence'"
              :aria-label="renderQueue.isSequencePlayback ? 'Stop playback' : 'Play sequence'"
            >
              <svg v-if="renderQueue.isSequencePlayback" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 6h12v12H6z"/>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
            <button
              class="btn btn--ghost btn--icon btn--sm"
              @click="stepPreviewFrame(1)"
              :disabled="previewFrameIndex >= previewFrameCount - 1"
              title="Next frame (→)"
              aria-label="Next frame"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
              </svg>
            </button>

            <input
              type="range"
              class="preview-scrubber"
              :min="0"
              :max="previewFrameCount - 1"
              :value="previewFrameIndex"
              @input="handleScrubberChange"
              :disabled="renderQueue.isSequencePlayback"
              aria-label="Rendered frames"
              :aria-valuetext="previewFrameNumber !== null ? `Frame ${previewFrameNumber}` : `${previewFrameIndex + 1} of ${previewFrameCount}`"
            />

            <span class="preview-frame-count">
              <span v-if="previewFrameNumber !== null" class="preview-frame-number">f{{ previewFrameNumber }}</span>
              {{ previewFrameIndex + 1 }} / {{ previewFrameCount }}
            </span>
            
            <span class="preview-fps">
              {{ currentPreviewJob.fps }} FPS
            </span>
          </div>
        </div>

        <!-- Vertical resize handle between Preview and Monitor -->
        <div
          v-if="!previewCollapsed"
          class="resize-handle resize-handle--vertical"
          :class="{ 'resize-handle--dragging': isVerticalResizing, 'resize-handle--collapsed-top': previewMinimized, 'resize-handle--collapsed-bottom': monitorMinimized }"
          role="separator"
          tabindex="0"
          aria-orientation="horizontal"
          aria-label="Resize preview and system monitor"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="verticalSplitValue"
          :aria-valuetext="`Preview ${verticalSplitValue}% of the height`"
          title="Drag to resize · double-click to reset · Enter to hide or show the preview"
          @mousedown="startVerticalResize"
          @dblclick="resetVerticalLayout"
          @keydown="handleVerticalSplitterKey"
        >
          <div class="resize-handle__grip" aria-hidden="true">
            <svg width="20" height="6" viewBox="0 0 20 6" fill="currentColor">
              <circle cx="4" cy="1" r="1"/>
              <circle cx="10" cy="1" r="1"/>
              <circle cx="16" cy="1" r="1"/>
              <circle cx="4" cy="5" r="1"/>
              <circle cx="10" cy="5" r="1"/>
              <circle cx="16" cy="5" r="1"/>
            </svg>
          </div>
          <button
            v-if="previewMinimized"
            class="resize-handle__label resize-handle__label--top"
            title="Show preview"
            aria-label="Show preview"
            tabindex="-1"
            @mousedown.stop
            @dblclick.stop
            @click.stop="previewMinimized = false"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
            </svg>
          </button>
          <button
            v-if="monitorMinimized"
            class="resize-handle__label resize-handle__label--bottom"
            title="Show system monitor"
            aria-label="Show system monitor"
            tabindex="-1"
            @mousedown.stop
            @dblclick.stop
            @click.stop="monitorMinimized = false"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
            </svg>
          </button>
        </div>

        <!-- System Monitor -->
        <div
          ref="monitorSectionRef"
          class="monitor-section"
          v-if="!previewCollapsed"
          :class="{ 'monitor-section--minimized': monitorMinimized }"
          :style="monitorSectionStyle"
        >
          <div class="panel__header">
            <h2>System Monitor</h2>
            <div class="monitor-tabs" role="group" aria-label="System monitor view">
              <button
                v-for="tab in MONITOR_TABS"
                :key="tab"
                class="btn btn--ghost btn--sm"
                :class="{ 'btn--active': monitorTab === tab }"
                :aria-pressed="monitorTab === tab"
                @click="monitorTab = tab"
              >{{ tab }}</button>
            </div>
            <div class="monitor-controls" v-if="monitorTab === 'Bars' || monitorTab === 'Graph'">
              <select v-if="monitorTab === 'Graph'" class="form-select form-select--sm" v-model="graphDuration" aria-label="Graph time span">
                <option :value="30">30 sec</option>
                <option :value="60">1 min</option>
                <option :value="300">5 min</option>
                <option :value="600">10 min</option>
                <option :value="1800">30 min</option>
                <option :value="3600">1 hour</option>
              </select>
              <select v-if="monitorTab === 'Bars'" class="form-select form-select--sm" :value="String(systemMonitor.updateInterval)" @change="handleMonitorIntervalChange" aria-label="Update interval">
                <option value="250">250ms</option>
                <option value="500">500ms</option>
                <option value="1000">1s</option>
                <option value="2000">2s</option>
              </select>
            </div>
            <button
              class="btn btn--ghost btn--sm monitor-minimize"
              @click="minimizeMonitor"
              title="Hide system monitor"
              aria-label="Hide system monitor"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
              </svg>
            </button>
          </div>

          <!-- Bars -->
          <div v-if="monitorTab === 'Bars'" class="monitor-bars">
            <div class="monitor-bars__item">
              <SystemMonitorGauge label="CPU" :value="systemMonitor.cpuUsage" :max="100" unit="%" :subtitle="`${systemMonitor.cpuModel} @ ${systemMonitor.cpuSpeed}GHz | ${systemMonitor.cpuCores}C/${systemMonitor.cpuThreads}T`" color="#4589ff" />
              <svg v-if="showMiniGraphs" class="monitor-mini-graph" viewBox="0 0 100 20" preserveAspectRatio="none">
                <polyline :points="miniGraphPoints(systemMonitor.history.cpu)" fill="none" stroke="#4589ff" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              </svg>
            </div>
            <div class="monitor-bars__item">
              <SystemMonitorGauge label="RAM" :value="systemMonitor.memoryUsage" :max="100" unit="%" :subtitle="`${systemMonitor.memoryUsedGB.toFixed(1)} / ${systemMonitor.memoryTotalGB.toFixed(1)} GB | ${systemMonitor.memoryType} @ ${systemMonitor.memorySpeed}MHz | ${systemMonitor.memorySlots}/${systemMonitor.memoryTotalSlots} slots`" color="#42be65" />
              <svg v-if="showMiniGraphs" class="monitor-mini-graph" viewBox="0 0 100 20" preserveAspectRatio="none">
                <polyline :points="miniGraphPoints(systemMonitor.history.memory)" fill="none" stroke="#42be65" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              </svg>
            </div>
            <div class="monitor-bars__item">
              <SystemMonitorGauge label="GPU" :value="systemMonitor.gpuUsage" :max="100" unit="%" :subtitle="systemMonitor.gpuName" color="#f1c21b" />
              <svg v-if="showMiniGraphs" class="monitor-mini-graph" viewBox="0 0 100 20" preserveAspectRatio="none">
                <polyline :points="miniGraphPoints(systemMonitor.history.gpu)" fill="none" stroke="#f1c21b" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              </svg>
            </div>
            <div class="monitor-bars__item">
              <SystemMonitorGauge label="VRAM" :value="systemMonitor.gpuVramUsage" :max="100" unit="%" :subtitle="`${systemMonitor.gpuVramUsedMB.toFixed(0)} / ${systemMonitor.gpuVramTotalMB.toFixed(0)} MB`" color="#ff832b" />
              <svg v-if="showMiniGraphs" class="monitor-mini-graph" viewBox="0 0 100 20" preserveAspectRatio="none">
                <polyline :points="miniGraphPoints(systemMonitor.history.gpuVram)" fill="none" stroke="#ff832b" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              </svg>
            </div>
          </div>

          <!-- Graph with grid and axes -->
          <div v-else-if="monitorTab === 'Graph'" class="monitor-graph">
            <div class="monitor-graph__container">
              <div class="monitor-graph__y-axis">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
              <div class="monitor-graph__main">
                <canvas ref="graphCanvasRef" class="monitor-graph__canvas"></canvas>
                <div class="monitor-graph__x-axis">
                  <span>{{ graphTimeLabel(0) }}</span>
                  <span>{{ graphTimeLabel(0.5) }}</span>
                  <span>Now</span>
                </div>
              </div>
            </div>
            <div class="monitor-graph__legend">
              <span><span class="dot" style="background:#4589ff"/>CPU</span>
              <span><span class="dot" style="background:#42be65"/>RAM</span>
              <span><span class="dot" style="background:#f1c21b"/>GPU</span>
              <span><span class="dot" style="background:#ff832b"/>VRAM</span>
            </div>
          </div>

          <!-- Processes -->
          <div v-else-if="monitorTab === 'Processes'" class="monitor-processes">
            <div class="monitor-processes__list">
              <div v-if="spawnedProcessList.length === 0" class="empty-state empty-state--small">
                <p>No spawned processes yet</p>
              </div>
              <div 
                v-else 
                class="process-row" 
                v-for="p in spawnedProcessList" 
                :key="p.id" 
                :class="{ 'process-row--selected': selectedProcessId === p.id }" 
                :style="{ borderLeftColor: getProcessColor(p.name) }"
                role="button"
                tabindex="0"
                :aria-pressed="selectedProcessId === p.id"
                :aria-label="`${p.name}, ${p.status}: show output`"
                @click="selectProcess(p.id)"
                @keydown.enter.self.prevent="selectProcess(p.id)"
                @keydown.space.self.prevent="selectProcess(p.id)"
              >
                <div class="process-row__indicator" :style="{ background: getProcessColor(p.name) }" />
                <div class="process-row__main">
                  <div class="process-row__title">{{ p.name }} <span class="process-row__status">{{ p.status }}</span></div>
                  <div class="process-row__cmd">{{ p.commandLine }}</div>
                </div>
                <button v-if="p.status === 'exited'" class="btn btn--ghost btn--sm" @click.stop="discardProcess(p.id)">Discard</button>
              </div>
            </div>
            <div class="monitor-processes__log">
              <div class="panel__header panel__header--sub">
                <h3>Output</h3>
              </div>
              <pre class="log-view">{{ selectedProcessLog }}</pre>
            </div>
          </div>

          <!-- App Log -->
          <div v-else class="monitor-log">
            <pre class="log-view">{{ appLogText }}</pre>
          </div>
        </div>
      </section>
    </main>

    <!-- Screen reader announcements (render started / finished / failed) -->
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ politeAnnouncement }}</div>
    <div class="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{{ urgentAnnouncement }}</div>

    <!-- Keyboard shortcuts -->
    <ShortcutsModal v-if="showShortcuts" @close="showShortcuts = false" />

    <!-- Settings Modal -->
    <SettingsModal
      v-if="showSettings"
      @close="showSettings = false"
    />
    
    <!-- Overwrite Warning Modal -->
    <OverwriteWarningModal 
      v-if="overwriteWarning"
      :job="overwriteWarning.job"
      :existing-frames="overwriteWarning.existingFrames"
      @overwrite="handleOverwriteConfirm"
      @adjust="handleAdjustFrames"
      @cancel="handleOverwriteCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRenderQueueStore, type RenderJob, type JobMenuAction } from '~/stores/renderQueue';
import { useSystemMonitorStore } from '~/stores/systemMonitor';
import { useSettingsStore } from '~/stores/settings';
import { ApplicationType, APPLICATION_FILE_EXTENSIONS, getAppTypeFromExtension, APPLICATION_INFO } from '~/types/applications';

// Legacy type alias
type BlendJob = RenderJob;

const renderQueue = useRenderQueueStore();
const systemMonitor = useSystemMonitorStore();
const settings = useSettingsStore();

// App version from package.json (fetched via Electron)
const appVersion = ref('2.5.0');

const showSettings = ref(false);
const overwriteWarning = ref<{ job: RenderJob; existingFrames: any[] } | null>(null);
const isDragOver = ref(false);

// Resizable panel state. Sizes are fractions of the space the panels share (as flex-grow
// factors), so every panel keeps its proportion when the window is resized.
const RESIZE_HANDLE_SIZE = 12;
const queueRatio = ref(1 / 3); // queue width / (main width - handle)
const isResizing = ref(false);
const layoutSettling = ref(true); // no transitions until the default layout is measured
const previewCollapsed = ref(false);
const queueCollapsed = ref(false);
const MIN_PANEL_WIDTH = 300;
const SNAP_THRESHOLD = 80;

// Drag-drop reordering state
const draggedJobIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const dragDirection = ref<'before' | 'after' | null>(null);
const jobListRef = ref<HTMLElement | null>(null);

// Preview state
const currentPreviewImage = ref<string | null>(null);
const videoPreviewSrc = ref<string | null>(null);
const videoPlayerRef = ref<HTMLVideoElement | null>(null);
let sequencePlaybackInterval: number | null = null;

// Vertical resize state (preview vs monitor)
const previewRatio = ref(0.6); // preview height / (info panel height - handle); fitted to the monitor bars on mount
const isVerticalResizing = ref(false);
const MIN_PREVIEW_HEIGHT = 120;
const MIN_MONITOR_HEIGHT = 100;
const VERTICAL_SNAP_THRESHOLD = 80;
const previewMinimized = ref(false);
const monitorMinimized = ref(false);

// flex-grow factors below 1 in total would leave space unused, so a panel that is alone takes all of it
function flexFor(ratio: number, collapsed: boolean, otherCollapsed: boolean) {
  if (collapsed) return { flex: '0 0 0px' };
  return { flex: otherCollapsed ? '1 1 0px' : `${ratio} 1 0px` };
}
const queuePanelStyle = computed(() => flexFor(queueRatio.value, queueCollapsed.value, previewCollapsed.value));
const infoPanelStyle = computed(() => flexFor(1 - queueRatio.value, previewCollapsed.value, queueCollapsed.value));
const previewSectionStyle = computed(() => flexFor(previewRatio.value, previewMinimized.value, monitorMinimized.value));
const monitorSectionStyle = computed(() => flexFor(1 - previewRatio.value, monitorMinimized.value, previewMinimized.value));

// Height the monitor needs to show its four bars (header + gauges, without the sparklines).
// Measured from the Bars view; the last measurement is kept for when another tab is open.
const barsFitHeight = ref(0);
const FALLBACK_BARS_FIT_HEIGHT = 365;

function measureBarsFitHeight(): number {
  const header = document.querySelector('.monitor-section > .panel__header') as HTMLElement | null;
  const bars = document.querySelector('.monitor-bars') as HTMLElement | null;
  const gauges = Array.from(document.querySelectorAll<HTMLElement>('.monitor-bars__item > .gauge'));
  if (!header || !bars || gauges.length === 0) return barsFitHeight.value;
  const style = getComputedStyle(bars);
  const gap = parseFloat(style.rowGap) || 0;
  const content = gauges.reduce((sum, g) => sum + g.getBoundingClientRect().height, 0) + gap * (gauges.length - 1);
  barsFitHeight.value = Math.ceil(header.offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + content) + 2;
  return barsFitHeight.value;
}

// Default split of the right panel: the monitor gets just the height its four bars need
function fitMonitorToBars() {
  const panel = document.querySelector('.panel--info') as HTMLElement | null;
  if (!panel) return;
  const available = panel.clientHeight - RESIZE_HANDLE_SIZE;
  if (available <= 0) return;
  const monitorHeight = Math.max(MIN_MONITOR_HEIGHT, measureBarsFitHeight() || FALLBACK_BARS_FIT_HEIGHT);
  const previewHeight = Math.max(MIN_PREVIEW_HEIGHT, available - monitorHeight);
  previewRatio.value = Math.min(1, previewHeight / available);
}

const DEFAULT_QUEUE_RATIO = 1 / 3;

function resetHorizontalLayout() {
  queueCollapsed.value = false;
  previewCollapsed.value = false;
  queueRatio.value = DEFAULT_QUEUE_RATIO;
}

async function resetVerticalLayout() {
  previewMinimized.value = false;
  monitorMinimized.value = false;
  await nextTick();
  fitMonitorToBars();
}

// Collapse buttons in the panel headers (the splitter tabs bring the panels back)
function collapseQueue() {
  previewCollapsed.value = false;
  queueCollapsed.value = true;
}
function collapseInfoPanel() {
  queueCollapsed.value = false;
  previewCollapsed.value = true;
}
function minimizePreview() {
  monitorMinimized.value = false;
  previewMinimized.value = true;
}
function minimizeMonitor() {
  previewMinimized.value = false;
  monitorMinimized.value = true;
}

// Splitter positions for assistive technology (percent of the space taken by the first panel)
const horizontalSplitValue = computed(() =>
  queueCollapsed.value ? 0 : previewCollapsed.value ? 100 : Math.round(queueRatio.value * 100));
const verticalSplitValue = computed(() =>
  previewMinimized.value ? 0 : monitorMinimized.value ? 100 : Math.round(previewRatio.value * 100));

// Keyboard resizing: arrows move the splitter (Shift: bigger steps), Home/End go to the
// minimum/maximum, Enter hides or shows the first panel (window-splitter pattern).
function splitterStep(e: KeyboardEvent) {
  return e.shiftKey ? 0.1 : 0.02;
}

function handleHorizontalSplitterKey(e: KeyboardEvent) {
  const mainEl = document.querySelector('.main') as HTMLElement | null;
  const available = (mainEl?.clientWidth ?? 0) - RESIZE_HANDLE_SIZE;
  if (available <= 0) return;
  const min = Math.min(0.5, MIN_PANEL_WIDTH / available);
  const setRatio = (r: number) => {
    queueCollapsed.value = false;
    previewCollapsed.value = false;
    queueRatio.value = Math.min(1 - min, Math.max(min, r));
  };
  switch (e.key) {
    case 'ArrowLeft': setRatio((queueCollapsed.value ? min : queueRatio.value) - splitterStep(e)); break;
    case 'ArrowRight': setRatio((previewCollapsed.value ? 1 - min : queueRatio.value) + splitterStep(e)); break;
    case 'Home': setRatio(min); break;
    case 'End': setRatio(1 - min); break;
    case 'Enter':
      if (queueCollapsed.value || previewCollapsed.value) resetCollapsedPanels();
      else collapseQueue();
      break;
    default: return;
  }
  e.preventDefault();
  e.stopPropagation();
}

function resetCollapsedPanels() {
  queueCollapsed.value = false;
  previewCollapsed.value = false;
}

function handleVerticalSplitterKey(e: KeyboardEvent) {
  const panel = document.querySelector('.panel--info') as HTMLElement | null;
  const available = (panel?.clientHeight ?? 0) - RESIZE_HANDLE_SIZE;
  if (available <= 0) return;
  const minTop = Math.min(0.5, MIN_PREVIEW_HEIGHT / available);
  const minBottom = Math.min(0.5, MIN_MONITOR_HEIGHT / available);
  const setRatio = (r: number) => {
    previewMinimized.value = false;
    monitorMinimized.value = false;
    previewRatio.value = Math.min(1 - minBottom, Math.max(minTop, r));
  };
  switch (e.key) {
    case 'ArrowUp': setRatio((previewMinimized.value ? minTop : previewRatio.value) - splitterStep(e)); break;
    case 'ArrowDown': setRatio((monitorMinimized.value ? 1 - minBottom : previewRatio.value) + splitterStep(e)); break;
    case 'Home': setRatio(minTop); break;
    case 'End': setRatio(1 - minBottom); break;
    case 'Enter':
      if (previewMinimized.value || monitorMinimized.value) {
        previewMinimized.value = false;
        monitorMinimized.value = false;
      } else {
        minimizePreview();
      }
      break;
    default: return;
  }
  e.preventDefault();
  e.stopPropagation();
}

// Unsupported preview state
const previewUnsupportedPath = ref<string | null>(null);

// Preview enabled/disabled toggle
const previewEnabled = ref(true);

function handlePreviewImgError() {
  // If the image fails to load in the browser, mark it as unsupported
  // Note: currentPreviewJob is accessed via renderQueue.previewJob here
  const job = renderQueue.previewJob;
  if (job?.lastRenderedFrame) {
    previewUnsupportedPath.value = job.lastRenderedFrame;
    currentPreviewImage.value = null;
  }
}

async function openPreviewInSystemViewer() {
  const pathToOpen = previewUnsupportedPath.value || renderQueue.previewJob?.lastRenderedFrame;
  if (!pathToOpen) return;
  const api = (window as any).electronAPI;
  if (api?.openFileWithDefaultApp) {
    await api.openFileWithDefaultApp(pathToOpen);
  }
}

function startVerticalResize(event: MouseEvent) {
  event.preventDefault();
  isVerticalResizing.value = true;
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
  
  const panel = document.querySelector('.panel--info') as HTMLElement | null;
  if (!panel) return;
  
  const onMouseMove = (e: MouseEvent) => {
    const panelRect = panel.getBoundingClientRect();
    const available = panelRect.height - RESIZE_HANDLE_SIZE;
    if (available <= 0) return;
    const newHeight = e.clientY - panelRect.top - RESIZE_HANDLE_SIZE / 2;
    const monitorHeight = available - newHeight;
    
    // Snap to minimize preview (drag up to top)
    if (newHeight < VERTICAL_SNAP_THRESHOLD) {
      previewMinimized.value = true;
      monitorMinimized.value = false;
      return;
    }
    
    // Snap to minimize monitor (drag down to bottom)
    if (monitorHeight < VERTICAL_SNAP_THRESHOLD) {
      previewMinimized.value = false;
      monitorMinimized.value = true;
      return;
    }
    
    // Normal resize within bounds
    previewMinimized.value = false;
    monitorMinimized.value = false;
    const clamped = Math.max(MIN_PREVIEW_HEIGHT, Math.min(available - MIN_MONITOR_HEIGHT, newHeight));
    previewRatio.value = Math.min(1, Math.max(0, clamped / available));
  };
  
  const onMouseUp = () => {
    isVerticalResizing.value = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// ============================================================
// SYSTEM MONITOR (Processes + Log tabs)
// ============================================================

type SpawnedProcessEntry = {
  id: string;
  pid?: number | null;
  name?: string;
  commandLine?: string;
  status?: string;
  exitCode?: number | null;
  signal?: string | null;
  lastUpdate?: number;
  startedAt?: number;
  endedAt?: number | null;
  logTail?: string;
};

const MONITOR_TABS = ['Bars', 'Graph', 'Processes', 'Log'] as const;
type MonitorTab = typeof MONITOR_TABS[number];
const monitorTab = ref<MonitorTab>('Bars');

const spawnedProcessList = ref<SpawnedProcessEntry[]>([]);
const selectedProcessId = ref<string | null>(null);
const selectedProcessLog = ref<string>('');

const appLogLines = ref<string[]>([]);
const appLogText = computed(() => appLogLines.value.join('\n'));

function upsertSpawnedProcess(update: SpawnedProcessEntry) {
  if (!update?.id) return;
  const idx = spawnedProcessList.value.findIndex((p) => p.id === update.id);
  if (idx >= 0) {
    spawnedProcessList.value[idx] = { ...spawnedProcessList.value[idx], ...update };
  } else {
    spawnedProcessList.value.unshift(update);
  }

  // Keep list stable and useful: running first, then most-recently-updated.
  spawnedProcessList.value.sort((a, b) => {
    const aRunning = a.status === 'running' ? 1 : 0;
    const bRunning = b.status === 'running' ? 1 : 0;
    if (aRunning !== bRunning) return bRunning - aRunning;
    const at = a.lastUpdate || a.startedAt || 0;
    const bt = b.lastUpdate || b.startedAt || 0;
    return bt - at;
  });

  // If the currently selected process gets updated, keep the log view fresh.
  if (selectedProcessId.value && update.id === selectedProcessId.value) {
    // If we only have a tail, show it until a full fetch happens.
    if (update.logTail && !selectedProcessLog.value) {
      selectedProcessLog.value = update.logTail;
    }
  }
}

async function refreshSpawnedProcesses() {
  const api = (window as any).electronAPI;
  if (!api?.getSpawnedProcesses) return;
  const res = await api.getSpawnedProcesses();
  if (res?.success && Array.isArray(res.processes)) {
    spawnedProcessList.value = res.processes;
  }
}

async function refreshAppLog() {
  const api = (window as any).electronAPI;
  if (!api?.getAppLog) return;
  const res = await api.getAppLog();
  if (res?.success && Array.isArray(res.lines)) {
    appLogLines.value = res.lines;
  }
}

async function selectProcess(processId: string) {
  selectedProcessId.value = processId;
  const api = (window as any).electronAPI;
  if (!api?.getSpawnedProcessLog) {
    selectedProcessLog.value = '';
    return;
  }
  const res = await api.getSpawnedProcessLog(processId);
  selectedProcessLog.value = res?.success ? (res.log || '') : (res?.error || 'Failed to load process log');
}

async function discardProcess(processId: string) {
  const api = (window as any).electronAPI;
  if (api?.discardSpawnedProcess) {
    await api.discardSpawnedProcess(processId);
  }
  spawnedProcessList.value = spawnedProcessList.value.filter((p) => p.id !== processId);
  if (selectedProcessId.value === processId) {
    selectedProcessId.value = null;
    selectedProcessLog.value = '';
  }
}

function handleMonitorIntervalChange(e: Event) {
  const select = e.target as HTMLSelectElement;
  const ms = parseInt(select.value, 10);
  if (!Number.isFinite(ms)) return;
  // Store handles restart internally
  (systemMonitor as any).setUpdateInterval?.(ms);
}

function graphPoints(series: number[]) {
  const data = Array.isArray(series) ? series : [];
  const n = data.length;
  if (n === 0) return '';
  const maxX = 100;
  const maxY = 40;
  if (n === 1) {
    const v = Math.max(0, Math.min(100, data[0] || 0));
    const y = (maxY - (v / 100) * maxY).toFixed(2);
    return `0,${y} ${maxX},${y}`;
  }
  return data
    .map((raw, i) => {
      const v = Math.max(0, Math.min(100, raw || 0));
      const x = (i / (n - 1)) * maxX;
      const y = maxY - (v / 100) * maxY;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

// Scaled version for 0-100 viewBox (used in the Graph tab with grid)
function graphPointsScaled(series: number[]) {
  const data = Array.isArray(series) ? series : [];
  const n = data.length;
  if (n === 0) return '';
  if (n === 1) {
    const v = Math.max(0, Math.min(100, data[0] || 0));
    const y = (100 - v).toFixed(2);
    return `0,${y} 100,${y}`;
  }
  return data
    .map((raw, i) => {
      const v = Math.max(0, Math.min(100, raw || 0));
      const x = (i / (n - 1)) * 100;
      const y = 100 - v; // Invert Y: 0% at bottom (100), 100% at top (0)
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

// Mini graph points for bars section (viewBox 0 0 100 20): the last MINI_GRAPH_POINTS samples
const MINI_GRAPH_POINTS = 60;
function miniGraphPoints(series: number[]) {
  const data = Array.isArray(series) ? series.slice(-MINI_GRAPH_POINTS) : [];
  const n = data.length;
  if (n === 0) return '';
  if (n === 1) {
    const v = Math.max(0, Math.min(100, data[0] || 0));
    const y = (20 - (v / 100) * 20).toFixed(2);
    return `0,${y} 100,${y}`;
  }
  return data
    .map((raw, i) => {
      const v = Math.max(0, Math.min(100, raw || 0));
      const x = (i / (n - 1)) * 100;
      const y = 20 - (v / 100) * 20;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

// Sparklines under the bars appear once the monitor is tall enough to show them without scrolling
// (each adds a 28px graph plus the 4px gap above it)
const MINI_GRAPH_EXTRA_HEIGHT = 4 * (28 + 4);
const monitorSectionRef = ref<HTMLElement | null>(null);
const monitorSectionHeight = ref(0);
const showMiniGraphs = computed(() => barsFitHeight.value > 0
  && monitorSectionHeight.value >= barsFitHeight.value + MINI_GRAPH_EXTRA_HEIGHT);

// ResizeObserver for mini-graphs height tracking (the monitor section is re-created when its panel reopens)
let monitorResizeObserver: ResizeObserver | null = null;
watch(monitorSectionRef, async (el, old) => {
  if (old) monitorResizeObserver?.unobserve(old);
  if (el) {
    monitorResizeObserver?.observe(el);
    await nextTick();
    if (monitorTab.value === 'Bars') measureBarsFitHeight();
  }
});

// Canvas graph rendering
const graphCanvasRef = ref<HTMLCanvasElement | null>(null);
const graphDuration = ref(60); // Default to 1 minute
let graphAnimationFrame: number | null = null;

function drawGraph() {
  const canvas = graphCanvasRef.value;
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  // Set canvas size to match display size
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  const width = rect.width;
  const height = rect.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fillRect(0, 0, width, height);
  
  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  
  // Horizontal grid lines (25%, 50%, 75%)
  for (let i = 1; i < 4; i++) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  
  // Vertical grid lines (25%, 50%, 75%)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 1; i < 4; i++) {
    const x = (width / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  
  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.strokeRect(0, 0, width, height);
  
  // Calculate how many points to show based on duration and update interval
  const maxPoints = Math.ceil((graphDuration.value * 1000) / systemMonitor.updateInterval);
  
  // Get data series (only the last N points based on duration)
  const cpuData = systemMonitor.history.cpu.slice(-maxPoints);
  const memoryData = systemMonitor.history.memory.slice(-maxPoints);
  const gpuData = systemMonitor.history.gpu.slice(-maxPoints);
  const vramData = systemMonitor.history.gpuVram.slice(-maxPoints);
  
  // Draw data lines
  const series = [
    { data: cpuData, color: '#4589ff' },
    { data: memoryData, color: '#42be65' },
    { data: gpuData, color: '#f1c21b' },
    { data: vramData, color: '#ff832b' }
  ];
  
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  for (const { data, color } of series) {
    if (data.length < 2) continue;
    
    ctx.strokeStyle = color;
    ctx.beginPath();
    
    for (let i = 0; i < data.length; i++) {
      const value = Math.max(0, Math.min(100, data[i] || 0));
      const x = (i / Math.max(1, maxPoints - 1)) * width;
      const y = height - (value / 100) * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
  }
}

function startGraphRendering() {
  const renderLoop = () => {
    if (monitorTab.value === 'Graph') {
      drawGraph();
    }
    graphAnimationFrame = requestAnimationFrame(renderLoop);
  };
  renderLoop();
}

function stopGraphRendering() {
  if (graphAnimationFrame !== null) {
    cancelAnimationFrame(graphAnimationFrame);
    graphAnimationFrame = null;
  }
}

// Calculate time label based on graph duration
function graphTimeLabel(fraction: number): string {
  const totalSec = graphDuration.value;
  const secsAgo = Math.round(totalSec * (1 - fraction));
  if (secsAgo < 60) return `-${secsAgo}s`;
  const minsAgo = Math.round(secsAgo / 60);
  if (minsAgo < 60) return `-${minsAgo}m`;
  const hoursAgo = Math.round(minsAgo / 60);
  return `-${hoursAgo}h`;
}

// Process color coding based on application type
function getProcessColor(name?: string): string {
  if (!name) return 'var(--cds-text-secondary)';
  const n = name.toLowerCase();
  if (n.includes('blender-exr-preview')) return '#ffb366'; // Lighter orange
  if (n.includes('blender')) return '#ff832b'; // Blender orange
  if (n.includes('cinema4d') || n.includes('c4d')) return '#c41230'; // Cinema 4D red
  if (n.includes('houdini')) return '#ff6600'; // Houdini orange/teal
  if (n.includes('aftereffects') || n.includes('ae')) return '#9999ff'; // After Effects purple
  if (n.includes('nuke')) return '#fcb830'; // Nuke yellow
  return 'var(--cds-text-secondary)';
}

// Computed properties for preview
const currentPreviewJob = computed((): BlendJob | null => {
  return renderQueue.previewJob;
});

const isVideoPreview = computed(() => {
  return currentPreviewJob.value?.isVideoOutput ?? false;
});

const previewFileName = computed(() => {
  if (!currentPreviewJob.value) return null;
  const framePaths = currentPreviewJob.value.renderedFramePaths ?? [];
  if ((renderQueue.isSequencePlayback || scrubIndex.value !== null) && framePaths.length > 0) {
    const framePath = framePaths[previewFrameIndex.value];
    return framePath ? getFileName(framePath) : null;
  }
  return currentPreviewJob.value.lastRenderedFrame ? getFileName(currentPreviewJob.value.lastRenderedFrame) : null;
});

const previewStatusMessage = computed(() => {
  if (!previewEnabled.value) {
    return 'Preview disabled (enable to see renders)';
  }
  if (previewUnsupportedPath.value && currentPreviewImage.value) {
    return "This image format isn't supported for preview";
  }
  if (!currentPreviewJob.value) {
    return 'Previews will appear here when you start rendering';
  }
  if (currentPreviewJob.value.status === 'idle') {
    return 'Waiting to start rendering...';
  }
  if (currentPreviewJob.value.status === 'rendering') {
    return 'Rendering...';
  }
  if (!currentPreviewImage.value) {
    return 'Previews will appear here when you start rendering';
  }
  return 'No preview available';
});

// ============================================================
// PREVIEW: FRAME STEPPING
// ============================================================

// Frame picked with the scrubber or ←/→; null follows the newest rendered frame
const scrubIndex = ref<number | null>(null);
const previewFrameCount = computed(() => currentPreviewJob.value?.renderedFramePaths?.length ?? 0);
const previewFrameIndex = computed(() => {
  if (renderQueue.isSequencePlayback) return renderQueue.sequencePlaybackFrame;
  const last = Math.max(0, previewFrameCount.value - 1);
  return scrubIndex.value === null ? last : Math.min(scrubIndex.value, last);
});

// The scene frame number, from the digits before the file extension (shot_010_1049.png -> 1049)
const FRAME_NUMBER_RE = /(\d+)(?=\.[^.]+$)/;
const previewFrameNumber = computed<number | null>(() => {
  const path = currentPreviewJob.value?.renderedFramePaths?.[previewFrameIndex.value];
  const match = path ? FRAME_NUMBER_RE.exec(getFileName(path)) : null;
  return match ? parseInt(match[1], 10) : null;
});

async function showPreviewFrame(index: number) {
  const paths = currentPreviewJob.value?.renderedFramePaths ?? [];
  if (paths.length === 0) return;
  const i = Math.max(0, Math.min(paths.length - 1, index));
  scrubIndex.value = i === paths.length - 1 ? null : i;
  await loadPreviewImage(paths[i]);
}

function stepPreviewFrame(delta: number) {
  const from = previewFrameIndex.value;
  if (renderQueue.isSequencePlayback) stopSequencePlayback({ reload: false });
  showPreviewFrame(from + delta);
}

// ============================================================
// PREVIEW: ZOOM & PAN, FULL VIEW
// ============================================================

const previewContainerRef = ref<HTMLElement | null>(null);
const previewContainerSize = ref({ w: 0, h: 0 }); // content box, kept current by the ResizeObserver
const previewNatural = ref({ w: 0, h: 0 });
const previewZoom = ref<number | null>(null);     // null: fit to the panel; else screen px per image px
const previewPan = ref({ x: 0, y: 0 });            // image centre offset from the panel centre (px)
const isPanningPreview = ref(false);
const MAX_PREVIEW_ZOOM = 16;
const previewFullscreen = ref(false);
const displayedPreviewPath = ref<string | null>(null);

watch(previewContainerRef, (el, old) => {
  if (old) monitorResizeObserver?.unobserve(old);
  if (el) monitorResizeObserver?.observe(el);
});

const canZoomPreview = computed(() => !isVideoPreview.value && !!currentPreviewImage.value && previewEnabled.value);

const previewFitScale = computed(() => {
  const { w, h } = previewNatural.value;
  const { w: cw, h: ch } = previewContainerSize.value;
  if (!w || !h || !cw || !ch) return 1;
  return Math.min(1, cw / w, ch / h);
});

const previewZoomPercent = computed(() => Math.round((previewZoom.value ?? previewFitScale.value) * 100));

const previewImageStyle = computed(() => {
  const z = previewZoom.value;
  if (z === null) return undefined;
  const { w, h } = previewNatural.value;
  const { x, y } = previewPan.value;
  return {
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    width: `${w * z}px`,
    height: `${h * z}px`,
    maxWidth: 'none',
    maxHeight: 'none',
    borderRadius: '0',
    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
    imageRendering: z >= 2 ? ('pixelated' as const) : undefined,
  };
});

// Keep some of the image in view
function clampPreviewPan(pan: { x: number; y: number }, z: number) {
  const { w, h } = previewNatural.value;
  const { w: cw, h: ch } = previewContainerSize.value;
  const maxX = Math.max(0, (w * z - cw) / 2);
  const maxY = Math.max(0, (h * z - ch) / 2);
  return { x: Math.max(-maxX, Math.min(maxX, pan.x)), y: Math.max(-maxY, Math.min(maxY, pan.y)) };
}

function fitPreview() {
  previewZoom.value = null;
  previewPan.value = { x: 0, y: 0 };
}

// Zoom to `next`, keeping the image point under `anchor` (offset from the panel centre) in place
function setPreviewZoom(next: number, anchor = { x: 0, y: 0 }) {
  if (!canZoomPreview.value) return;
  const fit = previewFitScale.value;
  const current = previewZoom.value ?? fit;
  const z = Math.max(fit, Math.min(MAX_PREVIEW_ZOOM, next));
  if (z <= fit && next < current) {
    fitPreview();
    return;
  }
  const k = z / current;
  const pan = previewPan.value;
  previewPan.value = clampPreviewPan({ x: anchor.x - (anchor.x - pan.x) * k, y: anchor.y - (anchor.y - pan.y) * k }, z);
  previewZoom.value = z;
}

function zoomPreviewBy(factor: number) {
  setPreviewZoom((previewZoom.value ?? previewFitScale.value) * factor);
}

function handlePreviewWheel(e: WheelEvent) {
  if (!canZoomPreview.value || !previewContainerRef.value) return;
  e.preventDefault();
  const rect = previewContainerRef.value.getBoundingClientRect();
  const anchor = { x: e.clientX - (rect.left + rect.width / 2), y: e.clientY - (rect.top + rect.height / 2) };
  setPreviewZoom((previewZoom.value ?? previewFitScale.value) * Math.exp(-e.deltaY * 0.0015), anchor);
}

function startPreviewPan(e: MouseEvent) {
  if (previewZoom.value === null || e.button !== 0) return;
  if ((e.target as HTMLElement).closest('button, video')) return;
  e.preventDefault();
  const start = { x: e.clientX, y: e.clientY };
  const startPan = { ...previewPan.value };
  const onMove = (ev: MouseEvent) => {
    isPanningPreview.value = true;
    previewPan.value = clampPreviewPan({ x: startPan.x + ev.clientX - start.x, y: startPan.y + ev.clientY - start.y }, previewZoom.value ?? 1);
  };
  const onUp = () => {
    isPanningPreview.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function handlePreviewImgLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  const { w, h } = previewNatural.value;
  if (img.naturalWidth !== w || img.naturalHeight !== h) {
    previewNatural.value = { w: img.naturalWidth, h: img.naturalHeight };
    fitPreview(); // a different resolution starts from fit; frames of the same job keep the zoom
  }
}

function handlePreviewDoubleClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('video, button')) return;
  togglePreviewFullscreen();
}

async function togglePreviewFullscreen() {
  previewFullscreen.value = !previewFullscreen.value;
  await nextTick();
  if (previewFullscreen.value) {
    document.querySelector<HTMLElement>('.preview-section--fullscreen [aria-pressed]:not(.btn--active)')?.focus();
  }
}

// ============================================================
// QUEUE: SELECTION & JOB ACTIONS
// ============================================================

const expandedJobIds = ref(new Set<string>());
let selectionAnchorId: string | null = null; // where Shift-click / Shift+arrow ranges start

function toggleJobExpanded(jobId: string) {
  if (expandedJobIds.value.has(jobId)) expandedJobIds.value.delete(jobId);
  else expandedJobIds.value.add(jobId);
}

function handleJobSelect(jobId: string, modifiers: { ctrl: boolean; shift: boolean; context?: boolean } = { ctrl: false, shift: false }) {
  const ids = renderQueue.selectedJobIds;

  // Right-click keeps a selection that includes the job, so the menu acts on all of it
  if (modifiers.context) {
    if (!ids.includes(jobId)) {
      renderQueue.selectJob(jobId);
      selectionAnchorId = jobId;
    }
    return;
  }

  if (modifiers.shift) {
    const order = renderQueue.jobs.map(j => j.id);
    const anchor = selectionAnchorId && order.includes(selectionAnchorId) ? selectionAnchorId : renderQueue.selectedJobId ?? jobId;
    const [from, to] = [order.indexOf(anchor), order.indexOf(jobId)].sort((a, b) => a - b);
    const range = order.slice(from, to + 1);
    renderQueue.setSelection(modifiers.ctrl ? [...new Set([...ids, ...range])] : range, jobId);
    return;
  }

  if (modifiers.ctrl) {
    if (ids.includes(jobId)) {
      const primary = renderQueue.selectedJobId === jobId ? undefined : renderQueue.selectedJobId;
      renderQueue.setSelection(ids.filter(id => id !== jobId), primary);
    } else {
      renderQueue.setSelection([...ids, jobId], jobId);
    }
    selectionAnchorId = jobId;
    return;
  }

  // Plain click: select only this job, or deselect it when it is the only one selected
  if (ids.length === 1 && ids[0] === jobId) {
    renderQueue.selectJob(null);
  } else {
    renderQueue.selectJob(jobId);
  }
  selectionAnchorId = jobId;
}

function selectAllJobs() {
  if (renderQueue.jobs.length === 0) return;
  renderQueue.setSelection(renderQueue.jobs.map(j => j.id), renderQueue.selectedJobId ?? renderQueue.jobs[0].id);
}

function focusJob(jobId: string) {
  nextTick(() => {
    const el = document.querySelector<HTMLElement>(`[data-job-id="${CSS.escape(jobId)}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  });
}

// ↑/↓ (and Home/End) move the selection; with Shift they extend it
function moveSelectionTo(index: number, extend: boolean) {
  const jobs = renderQueue.jobs;
  if (jobs.length === 0) return;
  const id = jobs[Math.max(0, Math.min(jobs.length - 1, index))].id;
  if (extend) {
    handleJobSelect(id, { ctrl: false, shift: true });
  } else {
    renderQueue.selectJob(id);
    selectionAnchorId = id;
  }
  focusJob(id);
}

function moveSelectionBy(delta: number, extend: boolean) {
  const jobs = renderQueue.jobs;
  const current = renderQueue.selectedJobId ? jobs.findIndex(j => j.id === renderQueue.selectedJobId) : -1;
  moveSelectionTo(current === -1 ? (delta > 0 ? 0 : jobs.length - 1) : current + delta, extend);
}

function targetJobIds(jobId: string) {
  const ids = renderQueue.selectedJobIds;
  return ids.length > 1 && ids.includes(jobId) ? [...ids] : [jobId];
}

// Remove jobs, then select (and focus) the job that took the first one's place
function removeJobsAndRefocus(ids: string[]) {
  const first = renderQueue.jobs.findIndex(j => ids.includes(j.id));
  renderQueue.removeJobs(ids);
  const next = renderQueue.jobs[Math.min(first, renderQueue.jobs.length - 1)];
  if (first !== -1 && next && renderQueue.selectedJobIds.length === 0) {
    renderQueue.selectJob(next.id);
    selectionAnchorId = next.id;
    focusJob(next.id);
  }
}

function removeSelectedJobs() {
  removeJobsAndRefocus([...renderQueue.selectedJobIds]);
}

function handleJobAction(jobId: string, action: JobMenuAction) {
  switch (action) {
    case 'duplicate': {
      const copyId = renderQueue.duplicateJob(jobId);
      if (copyId) {
        renderQueue.selectJob(copyId);
        selectionAnchorId = copyId;
        focusJob(copyId);
      }
      break;
    }
    case 'moveTop':
    case 'moveBottom':
      renderQueue.moveJobsToEdge(targetJobIds(jobId), action === 'moveTop' ? 'top' : 'bottom');
      focusJob(jobId);
      break;
    case 'reset':
      renderQueue.resetJobs(targetJobIds(jobId));
      break;
    case 'remove':
      removeJobsAndRefocus(targetJobIds(jobId));
      break;
  }
}

// ============================================================
// QUEUE SUMMARY (header, while not rendering)
// ============================================================

function jobFrameCount(job: RenderJob) {
  return new Set(parseFrameRanges(job.useCustomFrameRange ? job.frameRanges : `${job.originalFrameStart}-${job.originalFrameEnd}`)).size;
}

const queueSummary = computed(() => {
  const jobs = renderQueue.jobs;
  if (jobs.length === 0) return [];
  const count = (status: RenderJob['status'][]) => jobs.filter(j => status.includes(j.status)).length;
  const items = [{ key: 'total', text: `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}` }];
  const pending = count(['idle']);
  const paused = count(['paused']);
  const complete = count(['complete']);
  const problems = count(['error', 'missing-app']);
  if (pending) items.push({ key: 'pending', text: `${pending} pending` });
  if (paused) items.push({ key: 'paused', text: `${paused} paused` });
  if (complete) items.push({ key: 'complete', text: `${complete} complete` });
  if (problems) items.push({ key: 'error', text: `${problems} ${problems === 1 ? 'needs' : 'need'} attention` });
  const frames = jobs.filter(j => j.status === 'idle').reduce((n, j) => n + jobFrameCount(j), 0);
  if (frames) items.push({ key: 'frames', text: `${frames.toLocaleString()} ${frames === 1 ? 'frame' : 'frames'} to render` });
  return items;
});

// ============================================================
// SCREEN READER ANNOUNCEMENTS
// ============================================================

const politeAnnouncement = ref('');
const urgentAnnouncement = ref('');

function announce(message: string, urgent = false) {
  const target = urgent ? urgentAnnouncement : politeAnnouncement;
  target.value = '';
  nextTick(() => { target.value = message; }); // re-set so a repeated message is read again
}

// ============================================================
// LAYOUT PERSISTENCE
// ============================================================

const LAYOUT_STORAGE_KEY = 'renderq.layout.v1';
const GRAPH_DURATIONS = [30, 60, 300, 600, 1800, 3600];

function loadSavedLayout(): boolean {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    const isRatio = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1;
    if (!isRatio(saved.queueRatio) || !isRatio(saved.previewRatio)) return false;
    queueRatio.value = saved.queueRatio;
    previewRatio.value = saved.previewRatio;
    queueCollapsed.value = saved.queueCollapsed === true;
    previewCollapsed.value = saved.previewCollapsed === true && !queueCollapsed.value;
    previewMinimized.value = saved.previewMinimized === true;
    monitorMinimized.value = saved.monitorMinimized === true && !previewMinimized.value;
    if (MONITOR_TABS.includes(saved.monitorTab)) monitorTab.value = saved.monitorTab;
    if (GRAPH_DURATIONS.includes(saved.graphDuration)) graphDuration.value = saved.graphDuration;
    return true;
  } catch {
    return false;
  }
}

const restoredLayout = loadSavedLayout();

let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null;

function saveLayoutNow() {
  if (layoutSaveTimer) clearTimeout(layoutSaveTimer);
  layoutSaveTimer = null;
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
      queueRatio: queueRatio.value,
      previewRatio: previewRatio.value,
      queueCollapsed: queueCollapsed.value,
      previewCollapsed: previewCollapsed.value,
      previewMinimized: previewMinimized.value,
      monitorMinimized: monitorMinimized.value,
      monitorTab: monitorTab.value,
      graphDuration: graphDuration.value,
    }));
  } catch {
    // storage unavailable: the layout just isn't remembered
  }
}

watch(
  [queueRatio, previewRatio, queueCollapsed, previewCollapsed, previewMinimized, monitorMinimized, monitorTab, graphDuration],
  () => {
    if (layoutSaveTimer) clearTimeout(layoutSaveTimer);
    layoutSaveTimer = setTimeout(saveLayoutNow, 400);
  },
);

// The bars are measured whenever they are on screen (the sparklines depend on their height)
watch(monitorTab, async (tab) => {
  if (tab !== 'Bars') return;
  await nextTick();
  measureBarsFitHeight();
});

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

const showShortcuts = ref(false);

// Keys typed into fields belong to the field
function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"]');
}

// Space / Enter activate a focused control themselves
function isControlTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('button, a[href], input, select, textarea, summary, video, audio, [role="button"], [role="menuitem"], [role="separator"]');
}

// List navigation keys only when focus is on the page itself or in the queue (other panels scroll with them)
function isQueueNavigationTarget(target: EventTarget | null) {
  if (!(target instanceof Element) || target === document.body || target === document.documentElement) return true;
  return !!target.closest('.panel--queue');
}

function toggleRendering() {
  if (!renderQueue.isRendering) {
    if (renderQueue.pendingJobs.length > 0) startRendering();
  } else if (renderQueue.isPaused) {
    resumeRendering();
  } else {
    pauseRendering();
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return;
  // Open dialogs handle their own keys
  if (showSettings.value || overwriteWarning.value || showShortcuts.value) return;

  const ctrl = e.ctrlKey || e.metaKey;
  const typing = isTypingTarget(e.target);
  const onControl = isControlTarget(e.target);
  // A job card that has keyboard focus is what the keys act on: select it first
  const focusedCard = (e.target as HTMLElement | null)?.matches?.('[data-job-id]')
    ? (e.target as HTMLElement).dataset.jobId ?? null
    : null;
  const JOB_KEYS = ['Delete', 'Backspace', 'Enter', 'ArrowUp', 'ArrowDown', 'd', 'D'];
  if (focusedCard && JOB_KEYS.includes(e.key) && !renderQueue.selectedJobIds.includes(focusedCard)) {
    renderQueue.selectJob(focusedCard);
    selectionAnchorId = focusedCard;
  }
  const selected = renderQueue.selectedJobIds;

  if (e.key === 'Escape') {
    if (previewFullscreen.value) {
      togglePreviewFullscreen();
      e.preventDefault();
    } else if (!typing && selected.length > 0) {
      renderQueue.selectJob(null);
      e.preventDefault();
    }
    return;
  }
  if (typing) return;

  if (e.key === 'F1' || e.key === '?') {
    showShortcuts.value = true;
    e.preventDefault();
    return;
  }

  if (ctrl) {
    if (e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key === 'i') {
      addBlendFiles();
    } else if (key === 'a') {
      selectAllJobs();
      // the Edit menu's Select All may also select the page text
      setTimeout(() => window.getSelection()?.removeAllRanges(), 0);
    } else if (key === 'd') {
      const job = renderQueue.jobs.find(j => j.id === renderQueue.selectedJobId);
      if (!job || job.status === 'loading') return;
      handleJobAction(job.id, 'duplicate');
    } else {
      return;
    }
    e.preventDefault();
    return;
  }

  if (e.altKey) {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && selected.length > 0) {
      renderQueue.moveJobsBy([...selected], e.key === 'ArrowUp' ? -1 : 1);
      if (renderQueue.selectedJobId) focusJob(renderQueue.selectedJobId);
      e.preventDefault();
    }
    return;
  }

  switch (e.key) {
    case ' ':
      if (onControl) return;
      toggleRendering();
      break;
    case 'Delete':
    case 'Backspace':
      if (selected.length === 0 || !isQueueNavigationTarget(e.target) || (onControl && !focusedCard)) return;
      removeSelectedJobs();
      break;
    case 'ArrowUp':
    case 'ArrowDown':
      if (!isQueueNavigationTarget(e.target)) return;
      moveSelectionBy(e.key === 'ArrowUp' ? -1 : 1, e.shiftKey);
      break;
    case 'Home':
    case 'End':
      if (!isQueueNavigationTarget(e.target) || onControl) return;
      moveSelectionTo(e.key === 'Home' ? 0 : renderQueue.jobs.length - 1, e.shiftKey);
      break;
    case 'Enter':
      if (onControl || !renderQueue.selectedJobId) return;
      toggleJobExpanded(renderQueue.selectedJobId);
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
      if (isVideoPreview.value || previewFrameCount.value < 2) return;
      stepPreviewFrame(e.key === 'ArrowLeft' ? -1 : 1);
      break;
    case 'f':
    case 'F':
      togglePreviewFullscreen();
      break;
    case '0':
      if (!canZoomPreview.value) return;
      fitPreview();
      break;
    case '1':
      setPreviewZoom(1);
      break;
    case '+':
    case '=':
      zoomPreviewBy(1.25);
      break;
    case '-':
      zoomPreviewBy(0.8);
      break;
    default:
      return;
  }
  e.preventDefault();
}

// The previewed job can change without a selection change (the next job starts rendering)
watch(() => renderQueue.previewJob?.id, (id, oldId) => {
  if (id === oldId) return;
  scrubIndex.value = null;
  fitPreview();
});

// Watch for job selection changes
watch(() => renderQueue.selectedJobId, async (newId) => {
  stopSequencePlayback({ reload: false });
  scrubIndex.value = null;
  fitPreview();
  if (newId) {
    await loadPreviewForJob(newId);
  } else {
    // Load preview for current rendering job
    if (renderQueue.currentJob) {
      await loadPreviewForJob(renderQueue.currentJob.id);
    }
  }
});

// Watch for new rendered frames on currently selected job (Nuke jobs: the frame's preview JPEG, not its EXR)
watch(() => renderQueue.previewJob?.lastPreviewPath || renderQueue.previewJob?.lastRenderedFrame, async (newFrame) => {
  if (!renderQueue.isSequencePlayback && scrubIndex.value === null && newFrame && currentPreviewJob.value && previewEnabled.value) {
    // Only auto-update if viewing the job that's rendering (and not looking at an earlier frame)
    if (!renderQueue.selectedJobId || renderQueue.selectedJobId === renderQueue.currentJob?.id) {
      await loadPreviewImage(newFrame);
    }
  }
});

// Watch for preview enabled/disabled changes
watch(previewEnabled, async (enabled) => {
  const job = renderQueue.previewJob;
  if (enabled && (job?.lastPreviewPath || job?.lastRenderedFrame)) {
    await loadPreviewImage(job.lastPreviewPath || job.lastRenderedFrame!);
  } else if (!enabled) {
    currentPreviewImage.value = null;
    previewUnsupportedPath.value = null;
  }
});

// Watch for rendering state changes to update window title
watch(() => renderQueue.isRendering, () => {
  updateWindowTitle();
});

watch(() => renderQueue.totalProgress, () => {
  if (renderQueue.isRendering) {
    updateWindowTitle();
  }
});

watch(() => renderQueue.currentQueueFile, () => {
  updateWindowTitle();
});

// Watch for monitor tab changes to start/stop graph rendering
watch(monitorTab, (newTab, oldTab) => {
  if (newTab === 'Graph') {
    // Wait for canvas to be mounted
    nextTick(() => {
      startGraphRendering();
    });
  } else if (oldTab === 'Graph') {
    stopGraphRendering();
  }
});

// Watch for graph duration changes to redraw
watch(graphDuration, () => {
  if (monitorTab.value === 'Graph') {
    drawGraph();
  }
});

async function loadPreviewForJob(jobId: string) {
  const job = renderQueue.jobs.find(j => j.id === jobId);
  if (!job) return;
  
  const framePaths = job.renderedFramePaths ?? [];
  
  if (job.isVideoOutput) {
    // Load video if complete
    if (job.status === 'complete' && job.lastRenderedFrame) {
      await loadVideoPreview(job.lastRenderedFrame);
    } else {
      videoPreviewSrc.value = null;
    }
  } else {
    // Load last rendered frame (Nuke jobs: its preview JPEG)
    if (job.lastPreviewPath) {
      await loadPreviewImage(job.lastPreviewPath);
    } else if (job.lastRenderedFrame) {
      await loadPreviewImage(job.lastRenderedFrame);
    } else if (framePaths.length > 0) {
      await loadPreviewImage(framePaths[framePaths.length - 1]);
    } else {
      currentPreviewImage.value = null;
    }
  }
}

// Loads can finish out of order (stepping quickly through EXRs): only the latest request is shown
let previewLoadToken = 0;

async function loadPreviewImage(imagePath: string) {
  if (!imagePath) return;
  const api = (window as any).electronAPI;
  const token = ++previewLoadToken;

  // Reset unsupported state when loading a new image
  previewUnsupportedPath.value = null;
  displayedPreviewPath.value = imagePath;

  // Route all EXR previews through readExrLayer so multipart Blender EXRs work on Windows.
  if (imagePath.toLowerCase().endsWith('.exr')) {
    const desiredLayer = renderQueue.selectedExrLayer || 'Combined';
    const result = await api.readExrLayer({
      blenderPath: renderQueue.blenderPath,
      exrPath: imagePath,
      layer: desiredLayer
    });
    if (token !== previewLoadToken) return;
    if (result.success) {
      currentPreviewImage.value = result.data;
      return;
    }
    // If EXR loading fails, mark as unsupported
    previewUnsupportedPath.value = imagePath;
    currentPreviewImage.value = null;
    return;
  }

  const result = await api.readImage(imagePath);
  if (token !== previewLoadToken) return;
  if (result.success) {
    currentPreviewImage.value = result.data;
  } else {
    // If loading fails, mark as unsupported
    previewUnsupportedPath.value = imagePath;
    currentPreviewImage.value = null;
  }
}

async function loadVideoPreview(videoPath: string) {
  const api = (window as any).electronAPI;
  const result = await api.readVideo(videoPath);
  if (result.success) {
    if (result.type === 'data') {
      videoPreviewSrc.value = result.data;
    } else {
      videoPreviewSrc.value = `file://${result.filePath}`;
    }
  }
}

function handlePreviewContainerClick() {
  // Clicking on empty preview area deselects job
  if (!currentPreviewImage.value && !videoPreviewSrc.value) {
    renderQueue.selectJob(null);
  }
}

async function handleExrLayerChange(e: Event) {
  const select = e.target as HTMLSelectElement;
  renderQueue.setSelectedExrLayer(select.value);
  
  // Reload the frame on screen with the new layer
  const path = displayedPreviewPath.value || currentPreviewJob.value?.lastRenderedFrame;
  if (path) {
    await loadPreviewImage(path);
  }
}

function toggleSequencePlayback() {
  if (renderQueue.isSequencePlayback) {
    stopSequencePlayback();
  } else {
    startSequencePlayback();
  }
}

function startSequencePlayback() {
  const job = currentPreviewJob.value;
  const framePaths = job?.renderedFramePaths ?? [];
  if (!job || framePaths.length === 0) return;
  
  renderQueue.setSequencePlayback(true);
  renderQueue.setSequenceFrame(0);
  
  const frameInterval = 1000 / job.fps;
  sequencePlaybackInterval = window.setInterval(async () => {
    const nextFrame = (renderQueue.sequencePlaybackFrame + 1) % framePaths.length;
    renderQueue.setSequenceFrame(nextFrame);
    await loadPreviewImage(framePaths[nextFrame]);
  }, frameInterval);
}

function stopSequencePlayback({ reload = true }: { reload?: boolean } = {}) {
  const wasPlaying = renderQueue.isSequencePlayback;
  if (sequencePlaybackInterval) {
    clearInterval(sequencePlaybackInterval);
    sequencePlaybackInterval = null;
  }
  renderQueue.setSequencePlayback(false);

  // Back to the frame that was on screen before playback (the newest one unless stepped back)
  if (reload && wasPlaying && previewFrameCount.value > 0) {
    showPreviewFrame(scrubIndex.value ?? previewFrameCount.value - 1);
  }
}

async function handleScrubberChange(e: Event) {
  const input = e.target as HTMLInputElement;
  await showPreviewFrame(parseInt(input.value, 10));
}

// Initialize
onMounted(async () => {
  // Track the monitor's height (sparklines) and the preview's size (zoom to fit)
  if (typeof ResizeObserver !== 'undefined') {
    monitorResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === previewContainerRef.value) {
          previewContainerSize.value = { w: entry.contentRect.width, h: entry.contentRect.height };
        } else {
          monitorSectionHeight.value = entry.contentRect.height;
        }
      }
    });
    if (monitorSectionRef.value) monitorResizeObserver.observe(monitorSectionRef.value);
    if (previewContainerRef.value) monitorResizeObserver.observe(previewContainerRef.value);
  }

  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('pagehide', saveLayoutNow);

  // Default layout (first launch): the monitor gets just the height of its bars, measured once
  // fonts are in. A saved layout keeps its proportions; the bars are still measured for the sparklines.
  (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(() => {
    if (restoredLayout) measureBarsFitHeight();
    else fitMonitorToBars();
    requestAnimationFrame(() => { layoutSettling.value = false; });
  }));

  // Start system monitoring
  systemMonitor.startMonitoring();
  
  // Load settings
  await settings.loadSettings();
  
  // Load auto-saved queue
  await renderQueue.loadAutoSaved();
  
  // Find all application installations
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const api = (window as any).electronAPI;
    
    // Load app version from Electron
    if (api.getAppVersion) {
      try {
        const version = await api.getAppVersion();
        if (version) appVersion.value = version;
      } catch (e) {
        console.warn('Failed to get app version:', e);
      }
    }
    
    // Load all app installations in parallel
    const [blenderInstalls, cinema4dInstalls, houdiniInstalls, aeInstalls, nukeInstalls, mayaInstalls] = await Promise.all([
      api.findBlenderInstallations(),
      api.findCinema4DInstallations?.() || [],
      api.findHoudiniInstallations?.() || [],
      api.findAfterEffectsInstallations?.() || [],
      api.findNukeInstallations?.() || [],
      api.findMayaInstallations?.() || [],
    ]);
    
    // Store all installations in the queue store
    renderQueue.setAppInstallations(ApplicationType.BLENDER, blenderInstalls || []);
    renderQueue.setAppInstallations(ApplicationType.CINEMA4D, cinema4dInstalls || []);
    renderQueue.setAppInstallations(ApplicationType.HOUDINI, houdiniInstalls || []);
    renderQueue.setAppInstallations(ApplicationType.AFTER_EFFECTS, aeInstalls || []);
    renderQueue.setAppInstallations(ApplicationType.NUKE, nukeInstalls || []);
    renderQueue.setAppInstallations(ApplicationType.MAYA, mayaInstalls || []);
    
    // Legacy: Also set Blender installations for backwards compatibility
    renderQueue.setBlenderInstallations(blenderInstalls || []);
    
    // Use saved paths or first installation for each app
    if (settings.applicationPaths?.blender) {
      renderQueue.setBlenderPath(settings.applicationPaths.blender);
    } else if (blenderInstalls && blenderInstalls.length > 0) {
      renderQueue.setBlenderPath(blenderInstalls[0].path);
      settings.setAppPath(ApplicationType.BLENDER, blenderInstalls[0].path);
    }
    
    // Auto-select first installation for other apps if not already set
    if (!settings.applicationPaths?.cinema4d && cinema4dInstalls?.length > 0) {
      settings.setAppPath(ApplicationType.CINEMA4D, cinema4dInstalls[0].commandLinePath || cinema4dInstalls[0].path);
    }
    if (!settings.applicationPaths?.maya && mayaInstalls?.length > 0) {
      // Render (the batch renderer) rather than the Maya GUI
      settings.setAppPath(ApplicationType.MAYA, mayaInstalls[0].commandLinePath || mayaInstalls[0].path);
    }
    if (!settings.applicationPaths?.houdini && houdiniInstalls?.length > 0) {
      settings.setAppPath(ApplicationType.HOUDINI, houdiniInstalls[0].commandLinePath || houdiniInstalls[0].path);
    }
    
    // After Effects: Migrate old AfterFX.exe paths to aerender.exe
    if (settings.applicationPaths?.aftereffects) {
      const savedPath = settings.applicationPaths.aftereffects;
      // If the saved path points to AfterFX.exe (GUI), find and use aerender.exe instead
      if (savedPath.toLowerCase().includes('afterfx.exe')) {
        console.log('[After Effects Migration] Detected old AfterFX.exe path, migrating to aerender.exe');
        // Try to find the corresponding aerender.exe in the same folder
        const aerenderPath = savedPath.replace(/afterfx\.exe$/i, 'aerender.exe');
        settings.setAppPath(ApplicationType.AFTER_EFFECTS, aerenderPath);
        console.log('[After Effects Migration] Updated path to:', aerenderPath);
      }
    } else if (aeInstalls?.length > 0) {
      // For After Effects, prefer commandLinePath (aerender.exe) over path (AfterFX.exe)
      settings.setAppPath(ApplicationType.AFTER_EFFECTS, aeInstalls[0].commandLinePath || aeInstalls[0].path);
    }
    
    // Nuke: also replace a saved path whose version has been uninstalled (newest detected version)
    const savedNuke = settings.applicationPaths?.nuke;
    if (nukeInstalls?.length > 0 && (!savedNuke || (api.pathExists && !(await api.pathExists(savedNuke))))) {
      const newest = [...nukeInstalls].sort((a: any, b: any) =>
        String(b.version).localeCompare(String(a.version), undefined, { numeric: true }))[0];
      settings.setAppPath(ApplicationType.NUKE, newest.commandLinePath || newest.path);
    }

    // Migrate any old per-job After Effects override paths (AfterFX.exe -> aerender.exe)
    migrateAfterEffectsJobOverrides();
    
    // Validate jobs now that we have installations
    renderQueue.validateJobApplications();
    
    // Set up render event listeners
    setupRenderListeners();
    
    // Initial window title update
    updateWindowTitle();
  }
  
  // Set up menu event listeners
  const api = (window as any).electronAPI;
  if (api.onMenuSaveQueue) {
    api.onMenuSaveQueue((saveAs: boolean) => {
      saveQueue(saveAs);
    });
  }
  if (api.onMenuLoadQueue) {
    api.onMenuLoadQueue(() => {
      loadQueue();
    });
  }

  // System Monitor: seed processes + app log, then stream updates.
  if (api.getSpawnedProcesses) {
    await refreshSpawnedProcesses();
  }
  if (api.getAppLog) {
    await refreshAppLog();
  }

  if (api.onProcessUpdate) {
    api.onProcessUpdate((data: any) => {
      upsertSpawnedProcess(data);
    });
  }
  if (api.onAppLog) {
    api.onAppLog((data: any) => {
      const line = String(data?.line ?? '');
      if (!line) return;
      appLogLines.value.push(line);
      if (appLogLines.value.length > 2000) {
        appLogLines.value.splice(0, appLogLines.value.length - 2000);
      }
    });
  }

  // Start graph rendering if Graph tab is active
  if (monitorTab.value === 'Graph') {
    await nextTick();
    startGraphRendering();
  }
});

onUnmounted(() => {
  systemMonitor.stopMonitoring();
  cleanupRenderListeners();
  stopSequencePlayback();
  stopGraphRendering();
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.removeEventListener('pagehide', saveLayoutNow);
  saveLayoutNow();

  // Clean up ResizeObserver
  if (monitorResizeObserver) {
    monitorResizeObserver.disconnect();
    monitorResizeObserver = null;
  }

  const api = (window as any).electronAPI;
  api?.removeAllListeners?.('process-update');
  api?.removeAllListeners?.('app-log');
});

function setupRenderListeners() {
  const api = (window as any).electronAPI;
  
  api.onRenderProgress((data: any) => {
    if (renderQueue.currentJob && renderQueue.currentJob.id === data.jobId) {
      const updateData: any = {};
      if (data.phase === 'probe') {
        // Blender is checking which frames exist; keep the progress shown so far (resumed jobs)
        renderQueue.updateJob(data.jobId, { renderPhase: 'probe' });
        return;
      }
      if (data.doneCount !== undefined) {
        // Blender jobs: counts of finished frames (x view layers), including frames skipped because they existed
        updateData.progress = data.totalFrames > 0 ? (data.doneCount / data.totalFrames) * 100 : 0;
        updateData.currentFrame = data.doneCount;
        updateData.totalFrames = data.totalFrames;
        if (data.phase !== undefined) updateData.renderPhase = data.phase;
        if (data.layer !== undefined) updateData.currentLayer = data.layer;
        if (data.frame !== undefined) updateData.currentFrameNumber = data.frame;
        if (data.frameDone) { updateData.currentSample = 0; updateData.totalSamples = 0; }
        if (data.renderedCount > 0 && data.elapsedMs !== undefined) {
          const avg = data.elapsedMs / data.renderedCount;   // only frames rendered in this session
          updateData.elapsedTime = data.elapsedMs;
          updateData.estimatedTimeRemaining = (data.totalFrames - data.doneCount) * avg;
          if (data.frameDone) {
            // queue ETA counts frames, a split job counts frames x view layers
            const job = renderQueue.currentJob;
            const frames = parseFrameRanges(job.useCustomFrameRange ? job.frameRanges : `${job.originalFrameStart}-${job.originalFrameEnd}`).length;
            updateData.frameTimes = [avg * (frames > 0 ? data.totalFrames / frames : 1)];
          }
        }
      } else {
        updateData.progress = (data.currentFrameIndex / data.totalFrames) * 100;
        updateData.currentFrame = data.currentFrameIndex + 1;
      }

      // Include sample progress if available
      if (data.currentSample !== undefined && data.totalSamples !== undefined) {
        updateData.currentSample = data.currentSample;
        updateData.totalSamples = data.totalSamples;
      }

      renderQueue.updateJob(data.jobId, updateData);
      renderQueue.updateTotalProgress();
    }
  });
  
  api.onFrameRendered(async (data: any) => {
    if (renderQueue.currentJob && renderQueue.currentJob.id === data.jobId) {
      // Update frame timing and progress
      const job = renderQueue.currentJob;
      if (data.doneCount !== undefined) {
        // Blender/Nuke jobs: progress/ETA come with render-progress; only record the frame here.
        // Nuke jobs send a preview JPEG per frame: playback uses those (no EXR decoding needed).
        renderQueue.updateJob(data.jobId, { lastRenderedFrame: data.outputPath, lastPreviewPath: data.previewPath || null });
        renderQueue.addRenderedFrame(data.jobId, data.previewPath || data.outputPath);
      } else if (job.renderStartTime) {
        const elapsed = Date.now() - job.renderStartTime;
        const framesComplete = data.currentFrameIndex + 1;
        const avgFrameTime = elapsed / framesComplete;
        const remaining = (data.totalFrames - framesComplete) * avgFrameTime;
        
        // Calculate progress: completed frames / total frames
        const progress = (framesComplete / data.totalFrames) * 100;
        
        renderQueue.updateJob(data.jobId, {
          lastRenderedFrame: data.outputPath,
          currentFrame: framesComplete,
          progress,
          elapsedTime: elapsed,
          estimatedTimeRemaining: remaining,
          frameTimes: [...job.frameTimes, avgFrameTime],
          currentSample: 0, // Reset sample count for next frame
          totalSamples: 0,
        });
        
        // Track rendered frame path
        renderQueue.addRenderedFrame(data.jobId, data.outputPath);
      }
      
      // Load preview image (only if not in sequence playback mode, viewing this job, and not stepped back to an earlier frame)
      if (!renderQueue.isSequencePlayback && (!renderQueue.selectedJobId || renderQueue.selectedJobId === data.jobId)) {
        // For EXR while rendering, wait for the main process to send 'frame-preview'
        // (generated between frames to avoid spawning concurrent Blender instances).
        if (!data.outputPath.toLowerCase().endsWith('.exr') && scrubIndex.value === null) {
          const result = await api.readImage(data.outputPath);
          if (result.success && scrubIndex.value === null) {
            previewLoadToken++; // a slower load started earlier must not replace this frame
            renderQueue.setPreview(data.outputPath, result.data);
            currentPreviewImage.value = result.data;
            displayedPreviewPath.value = data.outputPath;
          }
        }
        
        // Get EXR layers if this is an EXR file (not for Nuke jobs: their preview is a JPEG of the comp)
        if (!data.previewPath && data.outputPath.toLowerCase().endsWith('.exr') && (job.exrLayers?.length ?? 0) === 0) {
          const layerResult = await api.getExrLayers({
            blenderPath: renderQueue.blenderPath,
            exrPath: data.outputPath
          });
          if (layerResult.success && layerResult.layers.length > 0) {
            renderQueue.setJobExrLayers(data.jobId, layerResult.layers);
          }
        }
      }
      
      renderQueue.updateTotalProgress();
    }
  });

  // EXR preview images generated by the main process (safe between Blender frames)
  if (api.onFramePreview) {
    api.onFramePreview((data: any) => {
      if (!data?.data) return;
      // Only update preview if we’re currently previewing this job (or no explicit selection)
      if (!renderQueue.isSequencePlayback && scrubIndex.value === null && (!renderQueue.selectedJobId || renderQueue.selectedJobId === data.jobId)) {
        previewLoadToken++; // a slower load started earlier must not replace this frame
        renderQueue.setPreview(data.outputPath, data.data);
        currentPreviewImage.value = data.data;
        displayedPreviewPath.value = data.outputPath;
      }
    });
  }
  
  api.onRenderComplete((data: any) => {
    renderQueue.completeCurrentJob();
    const finishedName = renderQueue.jobs.find(j => j.id === data.jobId)?.fileName || 'job';
    announce(`Finished rendering ${finishedName}`);

    // Send notification
    if (settings.notifications) {
      api.showNotification({
        title: 'Render Complete',
        message: `Finished rendering ${finishedName}`,
      });
    }

    // Start next job if available
    if (renderQueue.pendingJobs.length > 0 && renderQueue.isRendering) {
      startNextJob();
    } else if (renderQueue.pendingJobs.length === 0) {
      renderQueue.isRendering = false;
      announce('All render jobs are complete');
      if (settings.notifications) {
        api.showNotification({
          title: 'Queue Complete',
          message: 'All render jobs have been completed!',
        });
      }
    }
  });
  
  api.onRenderError((data: any) => {
    const failedName = renderQueue.currentJob?.fileName;
    renderQueue.errorCurrentJob(data.error);
    announce(`Render error${failedName ? ` in ${failedName}` : ''}: ${data.error}`, true);

    if (settings.notifications) {
      api.showNotification({
        title: 'Render Error',
        message: data.error,
      });
    }
  });
  
  api.onRenderPaused((data: any) => {
    renderQueue.updateJob(data.jobId, { status: 'paused' });
  });
}

function cleanupRenderListeners() {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const api = (window as any).electronAPI;
    api.removeAllListeners('render-progress');
    api.removeAllListeners('render-complete');
    api.removeAllListeners('render-error');
    api.removeAllListeners('render-paused');
    api.removeAllListeners('frame-rendered');
  }
}

// Panel resize functions
function startResize(e: MouseEvent) {
  isResizing.value = true;
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function handleResize(e: MouseEvent) {
  if (!isResizing.value) return;
  
  const mainEl = document.querySelector('.main') as HTMLElement;
  if (!mainEl) return;
  
  const mainRect = mainEl.getBoundingClientRect();
  const available = mainRect.width - RESIZE_HANDLE_SIZE;
  if (available <= 0) return;
  const queueWidth = e.clientX - mainRect.left - RESIZE_HANDLE_SIZE / 2;
  const infoWidth = available - queueWidth;
  
  // Snap to collapse preview panel (right side)
  if (infoWidth < SNAP_THRESHOLD) {
    previewCollapsed.value = true;
    queueCollapsed.value = false;
    return;
  }
  
  // Snap to collapse queue panel (left side)
  if (queueWidth < SNAP_THRESHOLD) {
    previewCollapsed.value = false;
    queueCollapsed.value = true;
    return;
  }
  
  // Normal resize within bounds
  previewCollapsed.value = false;
  queueCollapsed.value = false;
  const clamped = Math.max(MIN_PANEL_WIDTH, Math.min(queueWidth, available - MIN_PANEL_WIDTH));
  queueRatio.value = Math.min(1, Math.max(0, clamped / available));
}

function stopResize() {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

// Job drag-drop reordering
function handleJobDragStart(e: DragEvent, index: number) {
  if (renderQueue.jobs[index]?.status === 'rendering') {
    e.preventDefault();
    return;
  }
  draggedJobIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  }
}

function handleJobDragOver(e: DragEvent, index: number) {
  if (draggedJobIndex.value === null || draggedJobIndex.value === index) {
    dragOverIndex.value = null;
    dragDirection.value = null;
    return;
  }
  
  e.preventDefault();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  
  dragOverIndex.value = index;
  dragDirection.value = e.clientY < midY ? 'before' : 'after';
}

function handleJobDragLeave() {
  // Small delay to prevent flicker when moving between elements
  setTimeout(() => {
    if (draggedJobIndex.value !== null) return;
    dragOverIndex.value = null;
    dragDirection.value = null;
  }, 50);
}

function handleJobDrop(e: DragEvent, dropIndex: number) {
  e.preventDefault();
  
  if (draggedJobIndex.value === null || draggedJobIndex.value === dropIndex) {
    handleJobDragEnd();
    return;
  }
  
  let targetIndex = dropIndex;
  if (dragDirection.value === 'after') {
    targetIndex = dropIndex + 1;
  }
  
  // Adjust if dragging from before the target
  if (draggedJobIndex.value < targetIndex) {
    targetIndex -= 1;
  }
  
  renderQueue.moveJob(draggedJobIndex.value, targetIndex);
  handleJobDragEnd();
}

function handleJobDragEnd() {
  draggedJobIndex.value = null;
  dragOverIndex.value = null;
  dragDirection.value = null;
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = true;
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = false;
}

async function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = false;
  
  if (!e.dataTransfer?.files) return;
  
  // All supported extensions
  const supportedExtensions = Object.keys(APPLICATION_FILE_EXTENSIONS);
  
  const files = Array.from(e.dataTransfer.files)
    .filter(file => {
      const ext = file.path.toLowerCase();
      return supportedExtensions.some(supported => ext.endsWith(supported));
    })
    .map(file => file.path);
  
  if (files.length === 0) {
    console.log('No supported scene files dropped');
    return;
  }
  
  await loadSceneFiles(files);
}

async function addBlendFiles() {
  if (typeof window === 'undefined' || !(window as any).electronAPI) {
    console.error('Electron API not available');
    return;
  }
  
  const api = (window as any).electronAPI;
  
  // Use new multi-app browse function if available, fallback to Blender-only
  const filePaths = api.browseSceneFiles 
    ? await api.browseSceneFiles() 
    : await api.browseBlendFiles();
  
  await loadSceneFiles(filePaths);
}

async function saveQueue(saveAs: boolean = false) {
  if (typeof window === 'undefined' || !(window as any).electronAPI) return;
  
  const api = (window as any).electronAPI;

  // Ensure we send plain JSON across IPC (Pinia state is reactive).
  const queueData = JSON.parse(JSON.stringify({
    jobs: renderQueue.jobs,
    blenderPath: renderQueue.blenderPath,
  }));
  
  const filePath = !saveAs && renderQueue.currentQueueFile ? renderQueue.currentQueueFile : null;

  let result;
  try {
    result = await api.saveQueue({ queue: queueData, filePath });
  } catch (e: any) {
    console.error('Save queue failed:', e);
    return;
  }
  
  if (result.success && result.filePath) {
    renderQueue.currentQueueFile = result.filePath;
    renderQueue.hasUnsavedChanges = false;
    updateWindowTitle();
  } else if (result?.error) {
    console.error('Save queue error:', result.error);
  }
}

async function loadQueue() {
  if (typeof window === 'undefined' || !(window as any).electronAPI) return;
  
  const api = (window as any).electronAPI;

  let result;
  try {
    result = await api.loadQueue();
  } catch (e: any) {
    console.error('Load queue failed:', e);
    return;
  }

  if (result?.canceled) return;
  
  if (result.success && result.queue) {
    renderQueue.jobs = result.queue.jobs || [];
    renderQueue.currentJobIndex = -1;
    renderQueue.selectJob(null);
    expandedJobIds.value.clear();
    if (result.queue.blenderPath) {
      renderQueue.setBlenderPath(result.queue.blenderPath);
    }
    renderQueue.currentQueueFile = result.filePath;
    renderQueue.hasUnsavedChanges = false;

    // Migrate any old per-job After Effects override paths (AfterFX.exe -> aerender.exe)
    migrateAfterEffectsJobOverrides();
    
    // Re-validate jobs
    renderQueue.validateJobApplications();
    updateWindowTitle();
  } else if (result?.error) {
    console.error('Load queue error:', result.error);
  }
}

function migrateAfterEffectsJobOverrides() {
  for (const job of renderQueue.jobs) {
    if (job.applicationType !== ApplicationType.AFTER_EFFECTS) continue;
    if (!job.appExecutablePath) continue;

    const exePath = job.appExecutablePath;
    if (!exePath.toLowerCase().includes('afterfx.exe')) continue;

    const aerenderPath = exePath.replace(/afterfx\.exe$/i, 'aerender.exe');
    renderQueue.updateJob(job.id, { appExecutablePath: aerenderPath });
  }
}

// Legacy function name for compatibility
async function loadBlendFiles(filePaths: string[]) {
  await loadSceneFiles(filePaths);
}

async function loadSceneFiles(filePaths: string[]) {
  if (typeof window === 'undefined' || !(window as any).electronAPI) return;
  
  const api = (window as any).electronAPI;
  
  for (const filePath of filePaths) {
    try {
      // Determine application type from file extension
      const appType = getAppTypeFromExtension(filePath) || ApplicationType.BLENDER;
      
      // Get the appropriate app path
      const appPath = getAppPathForType(appType);
      
      // Extract filename for display
      const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || 'Unknown';
      
      // Add placeholder job immediately with 'loading' status
      const placeholderJobId = renderQueue.generateId();
      renderQueue.addJob({
        id: placeholderJobId,
        filePath,
        fileName,
        applicationType: appType,
        status: 'loading',
        // Placeholder values - will be updated when metadata is fetched
        originalFrameStart: 1,
        originalFrameEnd: 1,
        frameRanges: '1-1',
        outputPath: '',
        outputDir: '',
        renderEngine: getDefaultRenderEngine(appType),
        format: 'PNG',
        resolution: { x: 1920, y: 1080, percentage: 100 },
        fps: 24,
        isVideoOutput: false,
      });
      
      let info: any;
      
      // Use unified scene info if available, fallback to Blender-specific
      if (api.getSceneInfo) {
        info = await api.getSceneInfo({
          appPath,
          sceneFile: filePath,
          appType,
          // Nuke: the licence to open the comp with
          appSettings: JSON.parse(JSON.stringify((settings.appSettings as any)?.[appType] || {})),
        });
        
        if (!info.success) {
          console.error('Error getting scene info:', info.error);
          renderQueue.updateJob(placeholderJobId, {
            status: 'error',
            error: info.error || 'Failed to fetch scene metadata',
          });
          continue;
        }
      } else {
        // Legacy: Blender only
        info = await api.getBlendInfo({
          blenderPath: renderQueue.blenderPath,
          blendFile: filePath,
        });
      }
      
      // Update the placeholder job with actual scene data
      renderQueue.updateJob(placeholderJobId, {
        status: 'idle',
        originalFrameStart: info.frameStart,
        originalFrameEnd: info.frameEnd,
        frameRanges: `${info.frameStart}-${info.frameEnd}`,
        outputPath: info.outputPath,
        outputDir: info.outputDir,
        renderEngine: info.renderEngine || getDefaultRenderEngine(appType),
        format: info.format,
        resolution: info.resolution || { x: 1920, y: 1080, percentage: 100 },
        fps: info.fps,
        isVideoOutput: info.isVideoOutput || false,
        viewLayers: info.viewLayers,
        pythonDriverCount: info.pythonDriverCount,
        writeNodes: info.writeNodes,
        loadErrors: info.loadErrors,
        nukeVersion: info.nukeVersion,
        nukeLicense: info.nukeLicense,
      });
    } catch (error) {
      console.error('Error loading scene file:', error);
    }
  }
}

function getAppPathForType(appType: ApplicationType): string {
  const paths = settings.applicationPaths;
  
  switch (appType) {
    case ApplicationType.BLENDER:
      return paths?.blender || renderQueue.blenderPath || '';
    case ApplicationType.CINEMA4D:
      return paths?.cinema4d || '';
    case ApplicationType.HOUDINI:
      return paths?.houdini || '';
    case ApplicationType.AFTER_EFFECTS:
      return paths?.aftereffects || '';
    case ApplicationType.NUKE:
      return paths?.nuke || '';
    case ApplicationType.MAYA:
      return paths?.maya || '';
    default:
      return '';
  }
}

function getDefaultRenderEngine(appType: ApplicationType): string {
  switch (appType) {
    case ApplicationType.BLENDER:
      return 'CYCLES';
    case ApplicationType.CINEMA4D:
      return 'Standard';
    case ApplicationType.HOUDINI:
      return 'Mantra';
    case ApplicationType.AFTER_EFFECTS:
      return 'AE Render';
    case ApplicationType.NUKE:
      return 'Nuke';
    case ApplicationType.MAYA:
      return 'Maya';
    default:
      return 'Unknown';
  }
}

async function startRendering() {
  // Validate all jobs have their required applications
  validateJobApplications();
  
  // Check first pending job for existing frames
  const firstPending = renderQueue.pendingJobs[0];
  if (firstPending) {
    // Check if the job's application is available
    const appPath = getAppPathForJob(firstPending);
    if (!appPath) {
      // Mark job as missing-app and skip to next
      renderQueue.updateJob(firstPending.id, { 
        status: 'missing-app',
        error: `${APPLICATION_INFO[firstPending.applicationType || ApplicationType.BLENDER]?.label || 'Application'} path not configured`
      });
      await startNextJob();
      return;
    }
    
    await checkAndStartJob(firstPending);
  }
}

function validateJobApplications() {
  for (const job of renderQueue.jobs) {
    if (job.status === 'idle') {
      const appPath = getAppPathForJob(job);
      if (!appPath) {
        renderQueue.updateJob(job.id, { 
          status: 'missing-app',
          error: `${APPLICATION_INFO[job.applicationType || ApplicationType.BLENDER]?.label || 'Application'} path not configured`
        });
      }
    }
  }
}

function getAppPathForJob(job: RenderJob): string {
  const appType = job.applicationType || ApplicationType.BLENDER;
  
  // Job-specific override
  if (job.appExecutablePath) {
    return job.appExecutablePath;
  }
  
  // Global settings
  return getAppPathForType(appType);
}

async function checkAndStartJob(job: RenderJob) {
  const api = (window as any).electronAPI;
  
  const frameRange = job.useCustomFrameRange ? job.frameRanges : `${job.originalFrameStart}-${job.originalFrameEnd}`;
  const frames = parseFrameRanges(frameRange);

  if (frames.length === 0) return;

  // Blender and Nuke jobs skip frames that are already rendered by themselves (unless set to overwrite)
  if ((job.applicationType === ApplicationType.BLENDER || job.applicationType === ApplicationType.NUKE) &&
      (job.appSettings as any)?.skipExisting !== false) {
    startJobRender(job);
    return;
  }

  // Check for existing frames
  const result = await api.checkExistingFrames({
    outputDir: job.outputDir,
    outputPattern: job.outputPath.split('\\').pop() || job.outputPath.split('/').pop() || '',
    frameStart: Math.min(...frames),
    frameEnd: Math.max(...frames),
  });
  
  if (result.exists && result.frames.length > 0) {
    overwriteWarning.value = {
      job,
      existingFrames: result.frames,
    };
  } else {
    startJobRender(job);
  }
}

function startJobRender(job: RenderJob, { resume = false }: { resume?: boolean } = {}) {
  if (resume) {
    // keep the queue position; the job itself continues from what is already rendered
    renderQueue.isRendering = true;
    renderQueue.isPaused = false;
    renderQueue.updateJob(job.id, { status: 'rendering', renderStartTime: Date.now(), error: null });
    announce(`Resumed rendering ${job.fileName}`);
  } else {
    renderQueue.startRendering();
    announce(`Rendering ${job.fileName}`);
    renderQueue.updateJob(job.id, {
      status: 'rendering',
      renderStartTime: Date.now(),
      progress: 0,
      currentFrame: 0,
      estimatedTimeRemaining: 0,
      frameTimes: [],
      error: null,
    });
  }

  const frameRange = job.useCustomFrameRange ? job.frameRanges : `${job.originalFrameStart}-${job.originalFrameEnd}`;
  const appType = job.applicationType || ApplicationType.BLENDER;
  const appPath = getAppPathForJob(job);

  const api = (window as any).electronAPI;

  // Use new multi-app render if available
  if (api.startAppRender) {
    // Convert reactive objects to plain objects for IPC serialization
    const renderParams = JSON.parse(JSON.stringify({
      appPath,
      sceneFile: job.filePath,
      frameRanges: frameRange,
      jobId: job.id,
      appType,
      appSettings: getAppSettingsForJob(job),
      resume,
    }));
    api.startAppRender(renderParams);
  } else {
    // Legacy: Blender only
    api.startRender({
      blenderPath: renderQueue.blenderPath,
      blendFile: job.filePath,
      frameRanges: frameRange,
      jobId: job.id,
    });
  }
}

function getAppSettingsForJob(job: RenderJob): any {
  const appType = job.applicationType || ApplicationType.BLENDER;
  const globalSettings = (settings.appSettings as any)?.[appType] || {};
  
  // Start with job-specific appSettings (contains user overrides like cyclesDevice, engine, resolution, outputPath)
  const jobSettings = job.appSettings || {};
  
  // Merge global settings with job-specific settings
  switch (appType) {
    case ApplicationType.BLENDER: {
      // The global engine/device defaults are not user choices: passing them would force every
      // file into Cycles. Only per-job overrides change the file's own engine and device.
      const { engine: _engine, device: _device, ...globalRest } = globalSettings;
      const blender: any = { ...globalRest, ...jobSettings };
      if (blender.splitViewLayers) {
        const layers = blender.viewLayers?.length
          ? blender.viewLayers
          : (job.viewLayers || []).filter(vl => vl.use).map(vl => vl.name);
        blender.splitLayers = layers;
        if (layers.length === 0) blender.splitViewLayers = false;
      }
      return blender;
    }
    case ApplicationType.MAYA:
      return {
        ...globalSettings,
        ...jobSettings, // Include renderer override
      };
    case ApplicationType.CINEMA4D:
      return {
        ...globalSettings,
        ...jobSettings,
        take: job.takeName || globalSettings.take,
      };
    case ApplicationType.HOUDINI:
      return {
        ...globalSettings,
        ...jobSettings,
        renderNode: job.renderNode || globalSettings.renderNode,
      };
    case ApplicationType.AFTER_EFFECTS:
      return {
        ...globalSettings,
        ...jobSettings,
        composition: job.composition || globalSettings.composition,
      };
    case ApplicationType.NUKE: {
      // global: licence, GPU, threads, cache; per job: Write nodes, skip existing, chunks...
      const { writeNode: _w, continueOnError: _c, verbose: _v, ...globalRest } = globalSettings;
      return { ...globalRest, ...jobSettings };
    }
    default:
      return { ...globalSettings, ...jobSettings };
  }
}

async function startNextJob() {
  const nextJob = renderQueue.pendingJobs[0];
  if (nextJob) {
    await checkAndStartJob(nextJob);
  }
}

function handleOverwriteConfirm() {
  if (overwriteWarning.value) {
    startJobRender(overwriteWarning.value.job);
  }
  overwriteWarning.value = null;
}

function handleAdjustFrames(newFrameRange: string) {
  if (overwriteWarning.value) {
    renderQueue.updateJob(overwriteWarning.value.job.id, {
      frameRanges: newFrameRange,
      useCustomFrameRange: true,
    });
    startJobRender(overwriteWarning.value.job);
  }
  overwriteWarning.value = null;
}

function handleOverwriteCancel() {
  overwriteWarning.value = null;
}

async function pauseRendering() {
  await (window as any).electronAPI.pauseRender();
  renderQueue.pauseRendering();
  announce('Rendering paused');
}

async function resumeRendering() {
  await (window as any).electronAPI.resumeRender();
  renderQueue.resumeRendering();
  
  // Restart the current job with its own application and settings.
  // Blender jobs continue where they stopped (finished frames are skipped).
  if (renderQueue.currentJob) {
    startJobRender(renderQueue.currentJob, { resume: true });
  }
}

async function stopRendering() {
  await (window as any).electronAPI.stopRender();
  renderQueue.stopRendering();
  announce('Rendering stopped');
}

function moveJobUp(index: number) {
  if (index > 0) {
    renderQueue.moveJob(index, index - 1);
  }
}

function moveJobDown(index: number) {
  if (index < renderQueue.jobs.length - 1) {
    renderQueue.moveJob(index, index + 1);
  }
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatCompletionTime(ms: number): string {
  const completionDate = new Date(Date.now() + ms);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = completionDate.toDateString() === today.toDateString();
  const isTomorrow = completionDate.toDateString() === tomorrow.toDateString();
  
  const timeStr = completionDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  } else {
    return completionDate.toLocaleString([], { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
}

function updateWindowTitle() {
  if (typeof window === 'undefined' || !(window as any).electronAPI?.setWindowTitle) return;
  
  const api = (window as any).electronAPI;
  let title = `RenderQ v${appVersion.value}`;
  
  // Add queue file name or "Unsaved Queue"
  if (renderQueue.currentQueueFile) {
    const fileName = renderQueue.currentQueueFile.split('\\').pop()?.split('/').pop() || 'queue.json';
    title += ` - ${fileName}`;
  } else {
    title += ' - Unsaved Queue';
  }
  
  // Add rendering progress if rendering
  if (renderQueue.isRendering && renderQueue.totalEstimatedTime > 0) {
    const progress = Math.round(renderQueue.totalProgress);
    const timeLeft = formatTime(renderQueue.totalEstimatedTime);
    title += ` (${progress}% Rendered, ${timeLeft} left)`;
  }
  
  api.setWindowTitle(title);
  
  // Update taskbar progress on Windows
  if (renderQueue.isRendering) {
    const progress = renderQueue.totalProgress / 100;
    api.setTaskbarProgress?.(progress);
  } else {
    api.setTaskbarProgress?.(0);
  }
}

function getFileName(path: string): string {
  return path.split('\\').pop() || path.split('/').pop() || path;
}

function openPreviewInExplorer() {
  const path = displayedPreviewPath.value || renderQueue.previewPath;
  if (path) {
    (window as any).electronAPI.openInExplorer(path);
  }
}

function parseFrameRanges(rangeString: string): number[] {
  if (!rangeString || rangeString.trim() === '') return [];
  
  const frames: number[] = [];
  const parts = rangeString.split(',').map(s => s.trim());
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = parseInt(startStr);
      const end = parseInt(endStr);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (!frames.includes(i)) frames.push(i);
        }
      }
    } else {
      const frame = parseInt(part);
      if (!isNaN(frame) && !frames.includes(frame)) frames.push(frame);
    }
  }
  
  return frames.sort((a, b) => a - b);
}
</script>

<style lang="scss">
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: $bg-primary;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-04 $spacing-05;
  background-color: $bg-secondary;
  border-bottom: 1px solid $border-subtle;
  
  &__left, &__center, &__right {
    display: flex;
    align-items: center;
    gap: $spacing-04;
  }
  
  &__center {
    flex: 1;
    justify-content: center;
  }
}

.logo {
  display: flex;
  align-items: center;
  gap: $spacing-03;
  
  &__icon {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  
  h1 {
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin: 0;
  }
}

.version-badge {
  font-size: $font-size-xs;
  color: $text-tertiary;
  font-weight: $font-weight-regular;
  margin-left: $spacing-02;
  opacity: 0.6;
}

.file-menu {
  position: relative;
  margin-left: $spacing-04;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background-color: $bg-secondary;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 10000;
  min-width: 160px;
  overflow: hidden;
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: $spacing-03 $spacing-04;
  text-align: left;
  background: none;
  border: none;
  color: $text-primary;
  cursor: pointer;
  font-size: $font-size-sm;
  transition: background-color 0.15s ease;
  
  &:hover {
    background-color: $bg-hover;
  }
  
  &:first-child {
    border-radius: $radius-md $radius-md 0 0;
  }
  
  &:last-child {
    border-radius: 0 0 $radius-md $radius-md;
  }
}

.global-progress {
  display: flex;
  align-items: center;
  gap: $spacing-04;
  
  &--full {
    flex: 1;
    max-width: 100%;
  }
  
  &__text {
    font-size: $font-size-sm;
    color: $text-secondary;
  }
  
  &__time {
    font-size: $font-size-sm;
    color: $text-tertiary;
    font-family: $font-family-mono;
  }
}

.progress-bar-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: $spacing-02;
  padding: 0 $spacing-05;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: $spacing-03;
  
  &__text {
    font-size: $font-size-sm;
    color: $text-secondary;
    white-space: nowrap;
  }
  
  &__time {
    font-size: $font-size-xs;
    color: $text-tertiary;
    white-space: nowrap;
  }
}

.main {
  display: flex;
  flex: 1;
  overflow: hidden;

  // Panels follow the pointer directly while a splitter is dragged
  &--resizing {
    .panel,
    .preview-section,
    .monitor-section {
      transition: none;
    }
  }
}

.panel {
  display: flex;
  flex-direction: column;
  background-color: $bg-secondary;
  overflow: hidden;
  transition: flex-grow 0.15s ease;
  
  &--queue {
    min-width: 0;
  }
  
  &--info {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  
  &--collapsed {
    min-width: 0 !important;
    width: 0 !important;
    overflow: hidden;
    
    .panel__header,
    .panel__content,
    .panel__footer,
    .preview-section:not(.preview-section--fullscreen),
    .monitor-section {
      display: none;
    }
  }
  
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-04 $spacing-05;
    border-bottom: 1px solid $border-subtle;
    
    h2 {
      font-size: $font-size-base;
      font-weight: $font-weight-semibold;
      margin: 0;
    }
  }
  
  &__actions {
    display: flex;
    gap: $spacing-02;
  }
  
  &__content {
    flex: 1;
    overflow-y: auto;
    padding: $spacing-04;
    transition: background-color $transition-fast ease;
    
    &--drag-over {
      background-color: rgba($accent-primary, 0.1);
      border: 2px dashed $accent-primary;
      margin: 2px;
      padding: calc($spacing-04 - 2px);
    }
  }
  
  &__footer {
    padding: $spacing-04 $spacing-05;
    border-top: 1px solid $border-subtle;
    background-color: $bg-tertiary;
  }
}

.resize-handle {
  width: 12px;
  background-color: $bg-secondary;
  border-left: 1px solid $border-subtle;
  border-right: 1px solid $border-subtle;
  cursor: col-resize;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
  transition: background-color $transition-fast ease;
  
  &:hover,
  &--dragging {
    background-color: rgba($accent-primary, 0.1);
    
    .resize-handle__grip {
      color: $accent-primary;
    }
  }
  
  &__grip {
    color: $text-tertiary;
    transition: color $transition-fast ease;
  }
  
  &__label {
    position: absolute;
    z-index: 1;
    background-color: $accent-primary;
    color: white;
    border: none;
    border-radius: $radius-sm;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover {
      background-color: $accent-primary-hover;
    }
    
    &--left {
      left: -8px;
    }
    
    &--right {
      right: -8px;
    }
  }
  
  &--collapsed-left,
  &--collapsed-right {
    background-color: rgba($accent-primary, 0.2);
    cursor: pointer;
  }
}

.job-wrapper {
  position: relative;
  
  &--drop-before::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 0;
    right: 0;
    height: 3px;
    background-color: $accent-primary;
    border-radius: 2px;
    z-index: 10;
  }
  
  &--drop-after::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 0;
    right: 0;
    height: 3px;
    background-color: $accent-primary;
    border-radius: 2px;
    z-index: 10;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: $text-tertiary;
  
  &__icon {
    opacity: 0.3;
    margin-bottom: $spacing-04;
  }
  
  h3 {
    margin-bottom: $spacing-02;
    color: $text-secondary;
  }
  
  p {
    font-size: $font-size-sm;
  }
  
  &__hint {
    font-size: $font-size-xs;
    color: $text-tertiary;
    opacity: 0.7;
    font-family: $font-family-mono;
    margin-top: $spacing-02;
  }
  
  &--small {
    padding: $spacing-06;
    
    h3 {
      font-size: $font-size-sm;
    }
  }
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-03;
}

.render-controls {
  display: flex;
  gap: $spacing-03;
  justify-content: center;
}

.preview-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-bottom: 1px solid $border-subtle;
  overflow: hidden;
  transition: flex-grow 150ms ease;
  
  &.preview-section--minimized {
    height: 0 !important;
    min-height: 0 !important;
    border-bottom: none;
  }
  
  .panel__header {
    flex-shrink: 0;
  }
  
  .preview-path {
    font-size: $font-size-xs;
    color: $text-tertiary;
    font-family: $font-family-mono;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.preview-header-controls {
  display: flex;
  align-items: center;
  gap: $spacing-03;
  flex: 1;
  min-width: 0;
  margin-left: $spacing-04;

  &--end {
    flex: 0 0 auto;
    gap: $spacing-02;
  }
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: $spacing-01;
  margin-right: $spacing-02;

  &__value {
    min-width: 44px;
    text-align: right;
    font-size: $font-size-xs;
    font-family: $font-family-mono;
    color: $text-secondary;
  }
}

.preview-container {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: $spacing-04;
  overflow: hidden;
  background-color: $bg-primary;

  &--zoomed {
    cursor: grab;
  }

  &--panning {
    cursor: grabbing;
  }
}

// Full view: the preview fills the window (Esc / F / the button exit it)
.preview-section.preview-section--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 150;
  height: auto !important;
  min-height: 0;
  border-bottom: none;
  background-color: $bg-secondary;
}

// Header summary of the queue while nothing is rendering
.queue-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: $spacing-02 $spacing-03;
  font-size: $font-size-xs;
  color: $text-tertiary;

  &__item {
    padding: 2px $spacing-03;
    border-radius: 999px;
    background-color: $bg-tertiary;
    white-space: nowrap;

    &--total { color: $text-primary; }
    &--pending { color: $status-idle; }
    &--paused { color: $status-paused; }
    &--complete { color: $status-complete; }
    &--error { color: $status-error; }
  }
}

// Bulk actions for a multi-selection
.selection-bar {
  display: flex;
  align-items: center;
  gap: $spacing-02;
  padding: $spacing-02 $spacing-05;
  background-color: rgba($accent-primary, 0.12);
  border-bottom: 1px solid $border-subtle;

  &__count {
    font-size: $font-size-xs;
    font-weight: $font-weight-semibold;
    color: $accent-primary;
    margin-right: auto;
  }
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: pointer;
  border-radius: $radius-md;
  
  &:hover {
    opacity: 0.9;
  }
}

.preview-unsupported-actions {
  margin-top: $spacing-03;
}

.vertical-resize-handle {
  height: 10px;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-secondary;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.vertical-resize-handle__grip {
  width: 54px;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
}

.vertical-resize-handle--dragging .vertical-resize-handle__grip {
  background: rgba(255, 255, 255, 0.45);
}

.monitor-tabs {
  display: flex;
  gap: $spacing-02;
  margin-left: auto;
  margin-right: $spacing-02;
}

.btn--active {
  background: rgba(255, 255, 255, 0.08);
}

.monitor-controls {
  display: flex;
  align-items: center;
  gap: $spacing-02;
}

.monitor-graph {
  padding: $spacing-03;
}

.monitor-graph__legend {
  display: flex;
  gap: $spacing-03;
  flex-wrap: wrap;
  margin-top: $spacing-02;
  font-size: $font-size-xs;
  color: $text-secondary;
}

.monitor-graph__legend .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-right: 6px;
}

.monitor-processes {
  display: flex;
  flex-direction: column;
  gap: $spacing-03;
  padding: $spacing-03;
}

.monitor-processes__list {
  background: $bg-tertiary;
  border-radius: $radius-md;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.process-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-03;
  padding: $spacing-03;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
}

.process-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.process-row--selected {
  background: rgba(69, 137, 255, 0.10);
}

.process-row__title {
  font-size: $font-size-sm;
  color: $text-primary;
}

.process-row__status {
  margin-left: $spacing-02;
  font-size: $font-size-xs;
  color: $text-secondary;
}

.process-row__cmd {
  font-family: $font-family-mono;
  font-size: $font-size-xs;
  color: $text-tertiary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.monitor-processes__log {
  background: $bg-tertiary;
  border-radius: $radius-md;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.panel__header--sub {
  padding: $spacing-03;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.log-view {
  margin: 0;
  padding: $spacing-03;
  max-height: none;
  flex: 1;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: $font-family-mono;
  font-size: $font-size-xs;
  color: $text-primary;
}

.preview-video {
  max-width: 100%;
  max-height: 100%;
  border-radius: $radius-md;
}

.preview-controls {
  display: flex;
  align-items: center;
  gap: $spacing-03;
  padding: $spacing-03 $spacing-04;
  background-color: $bg-tertiary;
  border-top: 1px solid $border-subtle;
}

.preview-scrubber {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: $carbon-gray-60;
  border-radius: 2px;
  cursor: pointer;
  
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: $accent-primary;
    cursor: pointer;
  }
  
  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: $accent-primary;
    cursor: pointer;
    border: none;
  }
  
  &:disabled {
    opacity: 0.5;
  }
}

.preview-frame-count {
  font-size: $font-size-xs;
  color: $text-secondary;
  font-family: $font-family-mono;
  min-width: 60px;
  white-space: nowrap;
}

.preview-frame-number {
  color: $text-primary;
  margin-right: $spacing-02;
}

.monitor-minimize {
  margin-left: $spacing-02;
}

.preview-fps {
  font-size: $font-size-xs;
  color: $text-tertiary;
  font-family: $font-family-mono;
}

.form-select--sm {
  padding: $spacing-01 $spacing-03;
  font-size: $font-size-xs;
  background-color: $bg-tertiary;
  border: 1px solid $border-subtle;
  border-radius: $radius-sm;
  color: $text-primary;
  cursor: pointer;
  
  &:hover {
    border-color: $border-strong;
  }
  
  &:focus {
    outline: none;
    border-color: $accent-primary;
  }

  &:focus-visible {
    outline: 2px solid $accent-primary;
    outline-offset: 1px;
  }
}

.monitor-section {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: flex-grow 150ms ease;
  
  .panel__header {
    padding: $spacing-03 $spacing-05;
  }
}

.monitor-bars,
.monitor-graph,
.monitor-processes,
.monitor-log {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

// Bars view with mini-graphs
.monitor-bars {
  display: flex;
  flex-direction: column;
  gap: $spacing-03;
  padding: $spacing-04;
  
  &__item {
    display: flex;
    flex-direction: column;
    gap: $spacing-02;
  }
}

.monitor-mini-graph {
  height: 28px;
  width: 100%;
  background: rgba(0, 0, 0, 0.15);
  border-radius: $radius-sm;
}

// Graph view with grid and axes
.monitor-graph {
  display: flex;
  flex-direction: column;
  padding: $spacing-04;
  
  &__container {
    display: flex;
    flex: 1;
    min-height: 80px;
  }
  
  &__y-axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 9px;
    color: $text-tertiary;
    padding-right: $spacing-02;
    width: 32px;
    text-align: right;
    font-family: $font-family-mono;
  }
  
  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  
  &__svg {
    flex: 1;
    width: 100%;
    min-height: 60px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: $radius-sm;
  }
  
  &__canvas {
    flex: 1;
    width: 100%;
    min-height: 60px;
    border-radius: $radius-sm;
    display: block;
  }
  
  &__x-axis {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: $text-tertiary;
    padding-top: $spacing-01;
    font-family: $font-family-mono;
  }
  
  &__legend {
    display: flex;
    gap: $spacing-05;
    padding-top: $spacing-03;
    font-size: $font-size-xs;
    color: $text-secondary;
    
    span {
      display: flex;
      align-items: center;
      gap: $spacing-02;
    }
    
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
  }
}

// Process rows with color indicator
.process-row {
  position: relative;
  border-left: 3px solid transparent;
  padding-left: $spacing-02;
  
  &__indicator {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    border-radius: 2px 0 0 2px;
  }
}

// Vertical resize handle
.resize-handle--vertical {
  height: 12px;
  width: 100%;
  cursor: row-resize;
  flex-direction: row;
  
  .resize-handle__label--top,
  .resize-handle__label--bottom {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .resize-handle__label--top {
    top: -2px;
  }
  
  .resize-handle__label--bottom {
    bottom: -2px;
  }
  
  &.resize-handle--collapsed-top {
    .resize-handle__grip {
      display: none;
    }
  }
  
  &.resize-handle--collapsed-bottom {
    .resize-handle__grip {
      display: none;
    }
  }
}

.monitor-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: $spacing-03;
  padding: $spacing-04;
}
</style>
