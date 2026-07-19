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
  'mod+e', // inline code
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