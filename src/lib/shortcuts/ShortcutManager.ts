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

import { useStore } from '../../store/useStore';
import {
  eventToBinding,
  resolveBinding,
  SHORTCUTS,
  type ShortcutBinding,
  type ShortcutScope,
} from './keyboardShortcuts';
import { getShortcutAction } from '../core/commandRegistry';

/**
 * Editor-reserved bindings that should NOT be intercepted by ShortcutManager.
 * These are handled by TipTap's addKeyboardShortcuts.
 * Format: "mod+b", "mod+i", etc.
 */
const EDITOR_RESERVED_BINDINGS = new Set<ShortcutBinding>([
  'mod+b', // bold
  'mod+i', // italic
  'mod+u', // underline
  'mod+shift+s', // strikethrough
  'mod+e', // inline code
  'mod+z', // undo
  'mod+shift+z', // redo
  'mod+a', // select all
  'mod+enter', // insert block below (TipTap extension)
  'mod+shift+enter', // insert block above (TipTap extension)
]);

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

    // Editor conflict protection: if focus is in editor and binding is reserved,
    // let TipTap handle it.
    if (isEditorFocus() && EDITOR_RESERVED_BINDINGS.has(binding)) {
      return;
    }

    const store = useStore.getState();
    const activeScopes = this.getActiveScopes(store);
    const overrides = store.keyboardShortcuts;

    // Find matching shortcut definition
    for (const def of SHORTCUTS) {
      const effectiveBinding = resolveBinding(def.id, overrides);

      // Skip if binding doesn't match
      if (effectiveBinding !== binding) continue;

      // Skip if scope is not active
      if (!activeScopes.has(def.scope)) continue;

      // Editor scope shortcuts are handled by TipTap — skip them here
      if (def.scope === 'editor') continue;

      // Found a match — execute the action
      e.preventDefault();
      e.stopPropagation();

      const actionId = def.actionId ?? def.id;
      const action = getShortcutAction(actionId);

      if (action) {
        action(store);
      } else {
        console.warn(`[ShortcutManager] No action registered for "${actionId}"`);
      }

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
    window.addEventListener('keydown', this.handleKeyDown, true);
  }

  /**
   * Stop listening for keyboard events.
   */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this.handleKeyDown, true);
  }
}

/**
 * Global singleton instance.
 */
export const shortcutManager = new ShortcutManager();