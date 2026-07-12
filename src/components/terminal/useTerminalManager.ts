/**
 * useTerminalManager — Facade that composes three sub-hooks for terminal lifecycle.
 *
 * Architecture (inspired by kitty's child-monitor.c / window.py / screen.c):
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  useTerminalManager (this file — thin facade)            │
 *   │  ┌────────────────────────────────────────────────────┐  │
 *   │  │  usePtySessions   — PTY session lifecycle          │  │
 *   │  │    create / write / resize / kill / event listeners │  │
 *   │  ├────────────────────────────────────────────────────┤  │
 *   │  │  useTerminalInstances — xterm.js instance mgmt      │  │
 *   │  │    Terminal + addons + theme + WebGL + ResizeObs   │  │
 *   │  ├────────────────────────────────────────────────────┤  │
 *   │  │  useTerminalInput — input handling                  │  │
 *   │  │    keyboard / paste (kitty sanitize) / IME         │  │
 *   │  └────────────────────────────────────────────────────┘  │
 *   └──────────────────────────────────────────────────────────┘
 *
 * This preserves the same public API as before so PaneLayoutView
 * and other consumers don't need any changes.
 */

import type { TerminalCursorStyle } from '../../lib/core/storage';
import { resolveMonospaceFont } from '../../lib/editor/fonts';
import type { TerminalTheme } from '../../lib/terminal/themes';
import type { SessionTerminal } from './types';
import { usePtySessions } from './usePtySessions';
import { useTerminalInstances } from './useTerminalInstances';
import { useTerminalInput } from './useTerminalInput';

/**
 * useTerminalManager — owns the lifecycle of all xterm.js Terminal instances.
 *
 * Each session gets a cached entry (Terminal + FitAddon + DOM container +
 * CursorTrail).  Switching tabs reuses cached instances — scrollback and
 * state are preserved.
 *
 * Responsibilities (delegated to sub-hooks):
 *   - Create / destroy Terminal instances          → useTerminalInstances
 *   - Wire PTY input/output (Tauri events)          → usePtySessions
 *   - Keyboard / paste / IME handling               → useTerminalInput
 *   - Enable WebGL2 renderer + cursor trail        → useTerminalInstances
 *   - Resize handling (ResizeObserver → pty_resize) → useTerminalInstances + usePtySessions
 *
 * Returns refs to the instance cache so the parent component can mount /
 * switch the active session's DOM container.
 */
export function useTerminalManager(
  fontId: string,
  terminalFontSize: number,
  cursorStyle: TerminalCursorStyle,
) {
  const resolvedFontFamily = resolveMonospaceFont(fontId);

  // ── Sub-hook: PTY session lifecycle ──────────────────────
  const ptySessions = usePtySessions();

  // ── Sub-hook: input handling ────────────────────────────
  const terminalInput = useTerminalInput();

  // ── Sub-hook: xterm.js instance management ───────────────
  const { terminalsRef, setupTerminal, destroyTerminal, destroyAll, tryEnableWebgl } =
    useTerminalInstances({
      resolvedFontFamily,
      terminalFontSize,
      cursorStyle,
      ptySessions,
      terminalInput,
    });

  return {
    terminalsRef,
    setupTerminal,
    destroyTerminal,
    destroyAll,
    tryEnableWebgl,
  };
}

// Re-export SessionTerminal type for convenience.
export type { SessionTerminal };
