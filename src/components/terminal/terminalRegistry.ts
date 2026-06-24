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
 *
 * NOTE: SerializeAddon restores the mouse tracking *protocol* (DECSET
 * 1000/1002/1003) but NOT the *encoding* (DECSET 1006 SGR / 1016 SGR-pixels).
 * Without the encoding, a torn-off window reports wheel/mouse events in the
 * legacy `CSI M` format, which TUI apps that requested SGR (e.g. the jcli
 * agent) ignore — so the mouse wheel appears dead after detach. The app only
 * enables mouse mode once at startup and won't re-send it on resize, so the
 * child must restore it from the serialized state. We read the encoding from
 * the live terminal and append the matching DECSET ourselves.
 */
export function serializeSession(id: string): string {
  const entry = REGISTRY.get(id);
  if (!entry) return '';
  try {
    return entry.serialize.serialize() + serializeMouseEncoding(entry.term);
  } catch {
    return '';
  }
}

/** xterm internals — `activeEncoding` isn't on the public `modes` getter. */
interface TerminalWithMouseEncoding {
  _core?: {
    mouseStateService?: {
      activeEncoding?: 'DEFAULT' | 'SGR' | 'SGR_PIXELS';
    };
  };
}

/**
 * Produce the DECSET sequence that re-arms the active mouse encoding, or an
 * empty string when the default encoding is in effect (nothing to restore).
 */
function serializeMouseEncoding(term: SessionTerminal['term']): string {
  const encoding = (term as unknown as TerminalWithMouseEncoding)._core
    ?.mouseStateService?.activeEncoding;
  switch (encoding) {
    case 'SGR':
      return '\x1b[?1006h';
    case 'SGR_PIXELS':
      return '\x1b[?1016h';
    default:
      return '';
  }
}

/** Test-only: check if a session is currently registered. */
export function __isRegistered(id: string): boolean {
  return REGISTRY.has(id);
}
