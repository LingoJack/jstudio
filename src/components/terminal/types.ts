import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

/**
 * Per-session terminal instance cache.
 *
 * Each entry holds the xterm.js Terminal + FitAddon + DOM container.
 * Cached so switching tabs doesn't destroy scrollback or re-instantiate
 * the renderer.
 *
 * Note: cursor trail is managed by PaneLayoutView as a shared overlay,
 * not per-session.
 */
export interface SessionTerminal {
  term: Terminal;
  fit: FitAddon;
  container: HTMLDivElement;
}

/**
 * Kitty-style pane layouts for multi-pane groups.
 *
 * | Layout      | Description                                          |
 * |-------------|------------------------------------------------------|
 * | tall        | Left master (1.5fr), right column stack (1fr)        |
 * | fat         | Top master (1.5fr), bottom row (1fr)                 |
 * | grid        | Best-fit square grid, no empty cells                 |
 * | horizontal  | All panes in a single row                            |
 * | vertical    | All panes in a single column                         |
 */
export type PaneLayoutType =
  | 'tall'
  | 'fat'
  | 'grid'
  | 'horizontal'
  | 'vertical';

/**
 * Runtime-only pane sizing for one group/tab.
 * Kept in Zustand so switching tabs preserves drag-adjusted proportions,
 * but it is not persisted to disk.
 */
export interface PaneResizeState {
  layout: PaneLayoutType;
  sessionKey: string;
  columns?: number[];
  rows?: number[];
}

/**
 * A pane group — one tab that may contain multiple terminal sessions
 * arranged according to `layout`.  This is the Kitty-style "window"
 * concept: each tab is a group of panes.
 */
export interface PaneGroup {
  /** Unique id, e.g. `group-1781372359797`. */
  id: string;
  /** Ordered session ids belonging to this group. */
  sessionIds: string[];
  /** The focused session within this group. */
  activeSessionId: string;
  /** How panes are arranged visually. */
  layout: PaneLayoutType;
  /** Drag-adjusted grid track proportions while this tab remains alive. */
  resizeState?: PaneResizeState;
}
