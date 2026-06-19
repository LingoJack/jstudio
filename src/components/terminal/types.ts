import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type CursorTrail from './CursorTrail';

/**
 * Per-session terminal instance cache.
 *
 * Each entry holds the xterm.js Terminal + FitAddon + DOM container +
 * optional cursor trail.  Cached so switching tabs doesn't destroy
 * scrollback or re-instantiate the renderer.
 */
export interface SessionTerminal {
  term: Terminal;
  fit: FitAddon;
  container: HTMLDivElement;
  trail: CursorTrail | null;
}
