/**
 * ShortcutManager — unified keyboard shortcut handler.
 *
 * Single entry point for all keyboard shortcuts (global + terminal scope).
 * Editor-scope shortcuts are still handled by TipTap/ProseMirror.
 *
 * Architecture:
 *   keydown event → eventToBinding → resolveBinding → scope check → action
 *
 * Scope activation rules:
 *   - global: always active
 *   - terminal: active when activeSidebarView === 'terminal'
 *   - editor: handled by TipTap, ShortcutManager skips
 */

import { listen } from '@tauri-apps/api/event';
import { useStore } from '../../store/useStore';
import {
  eventToBinding,
  resolveBinding,
  SHORTCUTS,
  type ShortcutBinding,
  type ShortcutOverrides,
  type ShortcutScope,
} from './keyboardShortcuts';
import { executeShortcutAction } from '../core/commandRegistry';

/**
 * Editor-reserved bindings that should NOT be intercepted by ShortcutManager.
 * These are handled by TipTap's addKeyboardShortcuts.
 * Format: "mod+b", "mod+i", etc.
 */
const FIXED_EDITOR_RESERVED_BINDINGS = new Set<ShortcutBinding>([
  'mod+b', // bold
  'mod+i', // italic
  'mod+u', // underline
  'mod+shift+s', // strikethrough
  'mod+e', // inline code (TipTap Code extension default — dead key on macOS)
  'mod+`', // inline code (practical primary binding on macOS)
  'mod+z', // undo
  'mod+shift+z', // redo
  'mod+a', // select all
]);

export function isEditorReservedBinding(
  binding: ShortcutBinding,
  overrides: ShortcutOverrides | undefined,
): boolean {
  if (FIXED_EDITOR_RESERVED_BINDINGS.has(binding)) return true;
  return SHORTCUTS.some(
    (def) =>
      def.scope === 'editor' &&
      resolveBinding(def.id, overrides) === binding,
  );
}

/**
 * Check if focus is inside an editor element.
 */
function isEditorFocus(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  return (
    active instanceof HTMLElement &&
    (active.isContentEditable ||
      active.closest('[contenteditable="true"], [data-editor-surface]') !== null)
  );
}

/**
 * Singleton shortcut manager.
 */
class ShortcutManager {
  private active: boolean = false;
  private listenerGeneration = 0;
  private unlistenNative: (() => void) | null = null;

  /** Timestamp of the last bare Shift keydown (for double-Shift detection). */
  private lastShiftTime = 0;
  /** Max interval (ms) between two Shift presses to count as a double-Shift. */
  private static readonly DOUBLE_SHIFT_INTERVAL = 300;

  /**
   * Compute which scopes are currently active based on store state.
   */
  private getActiveScopes(store: ReturnType<typeof useStore.getState>): Set<ShortcutScope> {
    const scopes = new Set<ShortcutScope>();
    scopes.add('global');
    if (store.activeSidebarView === 'terminal') {
      scopes.add('terminal');
    }
    return scopes;
  }

  /**
   * Main keydown handler (capture phase).
   */
  private handleKeyDown = (e: KeyboardEvent): void => {
    // Fast path: ignore if default already prevented
    if (e.defaultPrevented) return;

    // ── Double-Shift detection (global search trigger) ──
    // Detect two consecutive bare Shift presses within 300ms.
    // - Ignore key repeat (holding Shift down)
    // - Only trigger when no other modifier is held
    // - The first Shift is NOT consumed (user may be starting a Shift+X combo)
    if (
      e.key === 'Shift' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.repeat
    ) {
      const now = Date.now();
      const elapsed = now - this.lastShiftTime;
      console.log('[ShortcutManager] Shift keydown, elapsed since last:', elapsed, 'threshold:', ShortcutManager.DOUBLE_SHIFT_INTERVAL);
      if (elapsed < ShortcutManager.DOUBLE_SHIFT_INTERVAL) {
        const store = useStore.getState();
        if (store.doubleShiftSearchEnabled) {
          store.setGlobalSearchOpen(true);
          this.lastShiftTime = 0; // Reset to prevent triple-trigger
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      this.lastShiftTime = now;
      // Do NOT return – let the first Shift pass through normally
    }

    const binding = eventToBinding(e);
    if (!binding) return;

    const store = useStore.getState();
    const overrides = store.keyboardShortcuts;

    // Editor conflict protection: fixed TipTap bindings and the current
    // user-configured editor bindings must reach ProseMirror unchanged.
    if (isEditorFocus() && isEditorReservedBinding(binding, overrides)) {
      return;
    }

    const activeScopes = this.getActiveScopes(store);

    // Find matching shortcut definition
    for (const def of SHORTCUTS) {
      const effectiveBinding = resolveBinding(def.id, overrides);

      // Skip if binding doesn't match
      if (effectiveBinding !== binding) continue;

      // Skip if scope is not active
      if (!activeScopes.has(def.scope)) continue;

      // Editor scope shortcuts are handled by TipTap — skip them here
      if (def.scope === 'editor') continue;

      const actionId = def.actionId ?? def.id;
      if (!executeShortcutAction(actionId, store)) continue;

      // Consume the event only after confirming the command exists.
      e.preventDefault();
      e.stopPropagation();

      // Only one shortcut can match per keypress
      return;
    }
  };

  /**
   * Start listening for keyboard events.
   */
  start(): void {
    if (this.active) return;
    this.active = true;
    const generation = ++this.listenerGeneration;
    window.addEventListener('keydown', this.handleKeyDown, true);

    void listen<string>('native-command', (event) => {
      if (!this.active || generation !== this.listenerGeneration) return;
      executeShortcutAction(event.payload, useStore.getState());
    })
      .then((unlisten) => {
        if (!this.active || generation !== this.listenerGeneration) {
          unlisten();
          return;
        }
        this.unlistenNative = unlisten;
      })
      .catch((error) => {
        if (this.active && generation === this.listenerGeneration) {
          console.warn('[ShortcutManager] Failed to listen for native commands:', error);
        }
      });
  }

  /**
   * Stop listening for keyboard events.
   */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.listenerGeneration += 1;
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.unlistenNative?.();
    this.unlistenNative = null;
  }
}

/**
 * Global singleton instance.
 */
export const shortcutManager = new ShortcutManager();