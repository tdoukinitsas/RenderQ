<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div
      ref="dialogRef"
      class="modal shortcuts-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      tabindex="-1"
    >
      <div class="modal__header">
        <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
        <button class="btn btn--ghost btn--icon" @click="$emit('close')" aria-label="Close" title="Close (Esc)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      <div class="modal__body shortcuts-modal__body">
        <section v-for="group in groups" :key="group.title" class="shortcuts-group">
          <h3>{{ group.title }}</h3>
          <dl>
            <div v-for="item in group.items" :key="item.action" class="shortcuts-row">
              <dt>
                <template v-for="(combo, i) in item.keys" :key="combo">
                  <span v-if="i > 0" class="shortcuts-or">or</span>
                  <kbd v-for="part in keyParts(combo)" :key="part">{{ part }}</kbd>
                </template>
              </dt>
              <dd>{{ item.action }}</dd>
            </div>
          </dl>
        </section>
        <p class="shortcuts-note">Shortcuts are paused while you type in a field.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useModalDialog } from '~/composables/useModalDialog';

const emit = defineEmits<{ (e: 'close'): void }>();

const dialogRef = ref<HTMLElement | null>(null);
useModalDialog(dialogRef, () => emit('close'));

// "Ctrl+Shift+S" -> Ctrl, Shift, S (the + key itself stays whole)
function keyParts(combo: string) {
  return combo === '+' ? ['+'] : combo.split('+');
}

const mod = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

const groups = [
  {
    title: 'Queue',
    items: [
      { keys: [`${mod}+I`], action: 'Add scene files' },
      { keys: [`${mod}+O`], action: 'Load a queue' },
      { keys: [`${mod}+S`], action: 'Save the queue' },
      { keys: [`${mod}+Shift+S`], action: 'Save the queue as…' },
      { keys: ['Space'], action: 'Start, pause or resume rendering' },
    ],
  },
  {
    title: 'Jobs',
    items: [
      { keys: ['↑', '↓'], action: 'Select the previous / next job' },
      { keys: ['Shift+↑', 'Shift+↓'], action: 'Extend the selection' },
      { keys: ['Home', 'End'], action: 'Select the first / last job' },
      { keys: [`${mod}+A`], action: 'Select all jobs' },
      { keys: [`${mod}+Click`, 'Shift+Click'], action: 'Add to the selection / select a range' },
      { keys: ['Alt+↑', 'Alt+↓'], action: 'Move the selected jobs up / down' },
      { keys: ['Enter'], action: 'Show or hide the job’s settings' },
      { keys: [`${mod}+D`], action: 'Duplicate the job' },
      { keys: ['Delete'], action: 'Remove the selected jobs' },
      { keys: ['Shift+F10'], action: 'Open the job’s menu' },
      { keys: ['Esc'], action: 'Clear the selection' },
    ],
  },
  {
    title: 'Preview',
    items: [
      { keys: ['←', '→'], action: 'Previous / next rendered frame' },
      { keys: ['F'], action: 'Full view (Esc to leave)' },
      { keys: ['0'], action: 'Zoom to fit' },
      { keys: ['1'], action: 'Actual size (100%)' },
      { keys: ['+', '-'], action: 'Zoom in / out (or scroll; drag to pan)' },
    ],
  },
  {
    title: 'Layout',
    items: [
      { keys: ['Tab'], action: 'Focus a panel divider, then ←/→ or ↑/↓ to resize it' },
      { keys: ['Enter'], action: 'On a divider: hide or show the panel' },
      { keys: ['Double-click'], action: 'On a divider: reset to the default size' },
      { keys: ['?', 'F1'], action: 'Show these shortcuts' },
    ],
  },
];
</script>

<style lang="scss">
.modal.shortcuts-modal {
  max-width: 920px;

  &:focus {
    outline: none;
  }

  .shortcuts-modal__body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    align-content: start;
    gap: $spacing-05 $spacing-07;
  }
}

.shortcuts-group {
  h3 {
    font-size: $font-size-xs;
    font-weight: $font-weight-semibold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: $text-tertiary;
    margin-bottom: $spacing-03;
  }

  dl {
    display: flex;
    flex-direction: column;
    gap: $spacing-02;
  }
}

.shortcuts-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  align-items: baseline;
  gap: $spacing-04;

  dt {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: $spacing-01;
  }

  dd {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  kbd {
    display: inline-block;
    min-width: 22px;
    padding: 1px 6px;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    text-align: center;
    color: $text-primary;
    background-color: $bg-tertiary;
    border: 1px solid $border-strong;
    border-bottom-width: 2px;
    border-radius: $radius-md;
  }
}

.shortcuts-or {
  font-size: $font-size-xs;
  color: $text-tertiary;
  margin: 0 $spacing-02;
}

.shortcuts-note {
  grid-column: 1 / -1;
  font-size: $font-size-xs;
  color: $text-tertiary;
}
</style>
