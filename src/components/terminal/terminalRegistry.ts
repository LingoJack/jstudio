// Module-level singleton registry for live terminal instances.
//
// Why this exists:
//   `useTerminalManager` is called inside `PaneLayoutView`, but the tear-off
//   flow (`lib/terminalDetach.ts`) is triggered from `TerminalTabs` — a
//   sibling component with no shared parent that owns the terminal ref.
//   Rather than prop-drilling or adding a React context, we keep a tiny
//   module-level Map that `useTerminalManager` keeps in sync, and the detach
//   flow reads from it to serialize a session's scrollback before opening
//   the child window.
//
// Lifecycle:
//   - useTerminalManager.setupTerminal()  → register(id, entry)
//   - useTerminalManager.destroyTerminal() → unregister(id)
//   - terminalDetach.createTerminalWindow() → serializeSession(id)
//
// The Map holds weak-ish references (we don't own the entries — the hook's
// own ref is the source of truth); we only expose read-only serialization
// here to avoid leaking mutation paths.

import type { SessionTerminal } from './types';

const REGISTRY = new Map<string, SessionTerminal>();

/** Register a live terminal entry. Called by useTerminalManager.setupTerminal. */
export function registerTerminal(id: string, entry: SessionTerminal): void {
  REGISTRY.set(id, entry);
}

/** Unregister a terminal entry. Called by useTerminalManager.destroyTerminal. */
export function unregisterTerminal(id: string): void {
  REGISTRY.delete(id);
}

/**
 * Serialize a session's xterm buffer (scrollback + alt screen + cursor
 * state) to a string suitable for `term.write()` replay in a child window.
 *
 * Returns an empty string if the session is not currently mounted (e.g.
 * the tab is backgrounded and its terminal hasn't been set up yet, or it
 * was already destroyed).
 */
export function serializeSession(id: string): string {
  const entry = REGISTRY.get(id);
  if (!entry) return '';
  try {
    return entry.serialize.serialize();
  } catch {
    return '';
  }
}

/** Test-only: check if a session is currently registered. */
export function __isRegistered(id: string): boolean {
  return REGISTRY.has(id);
}
