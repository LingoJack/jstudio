import { useEffect } from 'react';
import { useStore } from '../../store/useStore';

/**
 * usePaneShortcuts — global keyboard shortcuts for Kitty-style pane
 * management.  Active whenever the terminal panel is mounted.
 *
 * Shortcuts:
 *   Cmd/Ctrl + Enter      → splitPane (new pane in current group)
 *   Cmd/Ctrl + Shift + L  → cyclePaneLayout
 *   Cmd/Ctrl + Shift + F  → moveActivePane (swap position)
 *   Cmd/Ctrl + ← / →      → focusPrevPane / focusNextPane
 *   Cmd/Ctrl + W          → closeSession (close entire group/tab)
 *   Cmd/Ctrl + Shift + W  → closePane (close just the active pane)
 *
 * Tab-level shortcuts (Cmd+T, Cmd+Opt+← / →) live in TerminalTabs.
 */
export function usePaneShortcuts() {
  const splitPane = useStore((s) => s.splitPane);
  const cyclePaneLayout = useStore((s) => s.cyclePaneLayout);
  const moveActivePane = useStore((s) => s.moveActivePane);
  const focusNextPane = useStore((s) => s.focusNextPane);
  const focusPrevPane = useStore((s) => s.focusPrevPane);
  const closePane = useStore((s) => s.closePane);
  const closeSession = useStore((s) => s.closeSession);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const groups = useStore((s) => s.groups);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd/Ctrl + Enter → split pane
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        splitPane();
        return;
      }

      // Cmd/Ctrl + Shift + L → cycle layout
      if (e.shiftKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        e.stopPropagation();
        cyclePaneLayout();
        return;
      }

      // Cmd/Ctrl + Shift + F → move active pane
      if (e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        e.stopPropagation();
        moveActivePane();
        return;
      }

      // Cmd/Ctrl + ← / → → prev / next pane (without Shift)
      // (Opt/Alt + arrow is handled by TerminalTabs for tab switching)
      // (Shift + arrow is handled by TerminalTabs for tab switching)
      if (
        !e.altKey &&
        !e.shiftKey &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'ArrowLeft') {
          focusPrevPane();
        } else {
          focusNextPane();
        }
        return;
      }

      // Cmd/Ctrl + W (with or without Shift)
      if (e.key === 'w' || e.key === 'W') {
        if (!activeSessionId) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          // Shift+W → close just the active pane (split)
          closePane(activeSessionId);
        } else {
          // W → close entire group (tab).
          // Guard: never close the last remaining tab.
          if (groups.length <= 1) return;
          closeSession(activeSessionId);
        }
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
    closeSession,
    activeSessionId,
    groups,
  ]);
}
