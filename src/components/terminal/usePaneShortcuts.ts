import { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { eventToBinding, resolveBinding } from '../../lib/shortcuts/keyboardShortcuts';

/**
 * usePaneShortcuts — global keyboard shortcuts for Kitty-style pane
 * management.  Active whenever the terminal panel is mounted.
 *
 * Shortcuts (all resolved from lib/shortcuts.ts — user-customizable):
 *   Cmd/Ctrl + Enter      → splitPane (new pane in current group)
 *   Cmd/Ctrl + Shift + L  → cyclePaneLayout
 *   Cmd/Ctrl + Shift + F  → moveActivePane (swap position)
 *   Cmd/Ctrl + ← / →      → focusPrevPane / focusNextPane
 *   Cmd/Ctrl + Shift + W  → closePane (close just the active pane)
 *
 * Tab-level shortcuts (Cmd+W, Cmd+Shift+←/→, Cmd+T) are now handled
 * globally by the workspace layer (commandRegistry + App.tsx).
 */
export function usePaneShortcuts() {
  const splitPane = useStore((s) => s.splitPane);
  const cyclePaneLayout = useStore((s) => s.cyclePaneLayout);
  const moveActivePane = useStore((s) => s.moveActivePane);
  const focusNextPane = useStore((s) => s.focusNextPane);
  const focusPrevPane = useStore((s) => s.focusPrevPane);
  const closePane = useStore((s) => s.closePane);
  const activeSessionId = useStore((s) => s.activeSessionId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const binding = eventToBinding(e);
      if (!binding) return;

      const ov = useStore.getState().keyboardShortcuts;

      // splitPane
      if (binding === resolveBinding('terminal.splitPane', ov)) {
        e.preventDefault();
        e.stopPropagation();
        splitPane();
        return;
      }

      // cycleLayout
      if (binding === resolveBinding('terminal.cycleLayout', ov)) {
        e.preventDefault();
        e.stopPropagation();
        cyclePaneLayout();
        return;
      }

      // movePane
      if (binding === resolveBinding('terminal.movePane', ov)) {
        e.preventDefault();
        e.stopPropagation();
        moveActivePane();
        return;
      }

      // focusPrevPane / focusNextPane
      if (binding === resolveBinding('terminal.focusPrevPane', ov)) {
        e.preventDefault();
        e.stopPropagation();
        focusPrevPane();
        return;
      }
      if (binding === resolveBinding('terminal.focusNextPane', ov)) {
        e.preventDefault();
        e.stopPropagation();
        focusNextPane();
        return;
      }

      // closeTab is now handled globally by app.closeTab (workspace layer).
      // We only handle closePane here (Cmd/Ctrl+Shift+W).
      if (binding === resolveBinding('terminal.closePane', ov)) {
        if (!activeSessionId) return;
        e.preventDefault();
        e.stopPropagation();
        closePane(activeSessionId);
        return;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    splitPane,
    cyclePaneLayout,
    moveActivePane,
    focusNextPane,
    focusPrevPane,
    closePane,
    activeSessionId,
  ]);
}
