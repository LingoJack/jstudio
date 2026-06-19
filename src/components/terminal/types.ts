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
 * | tall        | Left master (flex-2), right column of rest (flex-1)  |
 * | fat         | Top master (flex-2), bottom row of rest (flex-1)     |
 * | grid        | Best-fit square grid                                 |
 * | horizontal  | All panes in a single row                            |
 * | vertical    | All panes in a single column                         |
 * | stack       | Only the active pane is visible                      |
 */
export type PaneLayoutType =
  | 'tall'
  | 'fat'
  | 'grid'
  | 'horizontal'
  | 'vertical'
  | 'stack';

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
}
