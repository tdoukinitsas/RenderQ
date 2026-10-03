import { onMounted, onUnmounted, nextTick, type Ref } from 'vue';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, newest last: only the top one handles keys (one Escape closes one dialog)
const openDialogs: symbol[] = [];

/**
 * Keyboard behaviour for a modal dialog: Escape closes it, focus moves into it when it opens,
 * Tab stays inside it, and focus returns to where it was when it closes.
 */
export function useModalDialog(dialogRef: Ref<HTMLElement | null>, onClose: () => void) {
  const id = Symbol('dialog');
  let previouslyFocused: HTMLElement | null = null;

  function onKeydown(e: KeyboardEvent) {
    const dialog = dialogRef.value;
    if (!dialog || openDialogs[openDialogs.length - 1] !== id) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const outside = !dialog.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || outside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || outside)) {
      e.preventDefault();
      first.focus();
    }
  }

  onMounted(async () => {
    previouslyFocused = document.activeElement as HTMLElement | null;
    openDialogs.push(id);
    document.addEventListener('keydown', onKeydown, true);
    await nextTick();
    const dialog = dialogRef.value;
    const target = dialog?.querySelector<HTMLElement>('[autofocus]') || dialog?.querySelector<HTMLElement>(FOCUSABLE) || dialog;
    target?.focus();
  });

  onUnmounted(() => {
    const index = openDialogs.indexOf(id);
    if (index !== -1) openDialogs.splice(index, 1);
    document.removeEventListener('keydown', onKeydown, true);
    previouslyFocused?.focus?.();
  });
}
