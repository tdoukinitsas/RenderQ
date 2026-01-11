<template>
  <div class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal overwrite-modal">
      <div class="modal__header">
        <div class="warning-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
        </div>
        <h2>Existing Frames Detected</h2>
      </div>
      
      <div class="modal__body">
        <p class="overwrite-message">
          <strong>{{ existingFrames.length }}</strong> frames already exist in the output directory for:
        </p>
        
        <div class="file-info">
          <span class="file-name">{{ job.fileName }}</span>
          <span class="file-path">{{ job.outputDir }}</span>
        </div>
        
        <div class="existing-frames">
          <div class="existing-frames__header">
            <span>Existing frames:</span>
            <span class="existing-frames__count">{{ existingFrames.length }} frames</span>
          </div>
          <div class="existing-frames__list">
            {{ formatFrameList() }}
          </div>
        </div>
        
        <div class="options">
          <h4>Choose an action:</h4>
          
          <div class="option" @click="$emit('overwrite')">
            <div class="option__icon option__icon--danger">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </div>
            <div class="option__content">
              <span class="option__title">Overwrite existing frames</span>
              <span class="option__desc">Delete existing frames and render the full range</span>
            </div>
          </div>
          
          <div class="option" @click="showAdjustInput = true" v-if="!showAdjustInput">
            <div class="option__icon option__icon--primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
            </div>
            <div class="option__content">
              <span class="option__title">Adjust frame range</span>
              <span class="option__desc">Modify the frame range to only render missing frames</span>
            </div>
          </div>
          
          <div v-if="showAdjustInput" class="adjust-input">
            <label class="form-label">New Frame Range</label>
            <input 
              type="text" 
              class="form-input form-input--mono"
              v-model="adjustedFrameRange"
              placeholder="e.g., 1-10, 50-60"
            />
            <p class="adjust-hint">
              Suggested (missing frames): <strong class="text-accent">{{ suggestedFrameRange }}</strong>
            </p>
            <div class="adjust-actions">
              <button class="btn btn--ghost btn--sm" @click="showAdjustInput = false">
                Cancel
              </button>
              <button class="btn btn--primary btn--sm" @click="useSuggested">
                Use Suggested
              </button>
              <button class="btn btn--primary btn--sm" @click="applyAdjusted">
                Apply Custom
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal__footer">
        <button class="btn btn--secondary" @click="$emit('cancel')">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { BlendJob } from '~/stores/renderQueue';

const props = defineProps<{
  job: BlendJob;
  existingFrames: Array<{ frame: number; file: string }>;
}>();

const emit = defineEmits<{
  (e: 'overwrite'): void;
  (e: 'adjust', frameRange: string): void;
  (e: 'cancel'): void;
}>();

const showAdjustInput = ref(false);
const adjustedFrameRange = ref('');

// Calculate the full frame range
const fullFrameRange = computed(() => {
  const rangeStr = props.job.useCustomFrameRange 
    ? props.job.frameRanges 
    : `${props.job.originalFrameStart}-${props.job.originalFrameEnd}`;
  
  const frames: number[] = [];
  const parts = rangeStr.split(',').map(s => s.trim());
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(s => parseInt(s.trim()));
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
});

// Calculate missing frames
const missingFrames = computed(() => {
  const existingSet = new Set(props.existingFrames.map(f => f.frame));
  return fullFrameRange.value.filter(f => !existingSet.has(f));
});

// Generate suggested frame range string
const suggestedFrameRange = computed(() => {
  if (missingFrames.value.length === 0) return 'All frames exist';
  
  const ranges: string[] = [];
  let start = missingFrames.value[0];
  let end = start;
  
  for (let i = 1; i < missingFrames.value.length; i++) {
    if (missingFrames.value[i] === end + 1) {
      end = missingFrames.value[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = missingFrames.value[i];
      end = start;
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  
  return ranges.join(', ');
});

function formatFrameList(): string {
  const frames = props.existingFrames.map(f => f.frame).sort((a, b) => a - b);
  const ranges: string[] = [];
  
  if (frames.length === 0) return 'None';
  
  let start = frames[0];
  let end = start;
  
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] === end + 1) {
      end = frames[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = frames[i];
      end = start;
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  
  return ranges.join(', ');
}

function useSuggested() {
  if (suggestedFrameRange.value !== 'All frames exist') {
    emit('adjust', suggestedFrameRange.value);
  }
}

function applyAdjusted() {
  if (adjustedFrameRange.value.trim()) {
    emit('adjust', adjustedFrameRange.value.trim());
  }
}
</script>

<style lang="scss">
.overwrite-modal {
  max-width: 550px;
}

.warning-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: rgba($status-rendering, 0.2);
  border-radius: 50%;
  color: $status-rendering;
  margin-right: $spacing-04;
}

.overwrite-modal .modal__header {
  display: flex;
  align-items: center;
  
  h2 {
    color: $status-rendering;
  }
}

.overwrite-message {
  margin-bottom: $spacing-04;
  color: $text-secondary;
  
  strong {
    color: $status-rendering;
  }
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: $spacing-01;
  padding: $spacing-03;
  background-color: $bg-tertiary;
  border-radius: $radius-md;
  margin-bottom: $spacing-04;
  
  .file-name {
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }
  
  .file-path {
    font-size: $font-size-xs;
    color: $text-tertiary;
    font-family: $font-family-mono;
  }
}

.existing-frames {
  margin-bottom: $spacing-05;
  
  &__header {
    display: flex;
    justify-content: space-between;
    margin-bottom: $spacing-02;
    font-size: $font-size-sm;
    color: $text-secondary;
  }
  
  &__count {
    color: $status-rendering;
    font-weight: $font-weight-medium;
  }
  
  &__list {
    padding: $spacing-03;
    background-color: $bg-tertiary;
    border-radius: $radius-md;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $text-tertiary;
    max-height: 80px;
    overflow-y: auto;
    word-break: break-all;
  }
}

.options {
  h4 {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-bottom: $spacing-03;
  }
}

.option {
  display: flex;
  align-items: flex-start;
  gap: $spacing-04;
  padding: $spacing-04;
  background-color: $bg-tertiary;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  cursor: pointer;
  margin-bottom: $spacing-03;
  transition: all $transition-fast ease;
  
  &:hover {
    border-color: $accent-primary;
    background-color: $bg-hover;
  }
  
  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: $radius-md;
    flex-shrink: 0;
    
    &--danger {
      background-color: rgba($status-error, 0.2);
      color: $status-error;
    }
    
    &--primary {
      background-color: rgba($accent-primary, 0.2);
      color: $accent-primary;
    }
  }
  
  &__content {
    display: flex;
    flex-direction: column;
    gap: $spacing-01;
  }
  
  &__title {
    font-weight: $font-weight-medium;
    color: $text-primary;
  }
  
  &__desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}

.adjust-input {
  padding: $spacing-04;
  background-color: $bg-tertiary;
  border: 1px solid $accent-primary;
  border-radius: $radius-md;
  
  .form-label {
    margin-bottom: $spacing-02;
  }
  
  .form-input {
    margin-bottom: $spacing-03;
  }
}

.adjust-hint {
  font-size: $font-size-xs;
  color: $text-tertiary;
  margin-bottom: $spacing-03;
  
  strong {
    font-family: $font-family-mono;
  }
}

.adjust-actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-02;
}
</style>
