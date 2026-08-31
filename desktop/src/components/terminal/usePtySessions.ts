/**
 * usePtySessions — PTY session lifecycle management.
 *
 * Inspired by kitty's child-monitor.c:
 *   - Global session registry (Map + unlisten cleanup)
 *   - Unified event handling (pty-data / pty-exit)
 *   - Write operations (ptyWrite)
 *   - Resize operations (ptyResize)
 *   - Kill operations (ptyKill)
 *
 * This hook manages the PTY side of the terminal pipeline:
 *   Frontend input → useTerminalInput → usePtySessions.write() → Tauri backend → Shell
 *   Shell output → Tauri event → usePtySessions listener → xterm.write()
 */

import { useRef, useCallback } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ipc } from '../../lib/core/ipc';
import { useStore } from '../../store/useStore';
import type { Terminal } from '@xterm/xterm';

/** PTY data event payload from Tauri backend. */
interface PtyDataPayload {
  data: string;
}

/**
 * Session state tracked by usePtySessions.
 */
export interface PtySessionState {
  sessionId: string;
  /** Callback to write data to xterm. Set by useTerminalInstances after term.open(). */
  onData: (data: string) => void;
  /** Callback when PTY exits. */
  onExit: () => void;
}

/**
 * Hook return type.
 */
export interface UsePtySessionsReturn {
  /** Register a new PTY session. Called by useTerminalInstances.setupTerminal(). */
  registerSession: (sessionId: string, term: Terminal) => void;
  /** Unregister a PTY session AND kill the backend PTY process. Called by useTerminalInstances.destroyTerminal(). */
  unregisterSession: (sessionId: string) => void;
  /** Kill all PTY sessions in the backend. Called on HMR/app shutdown. */
  killAllSessions: () => void;
  /** Write data to PTY. Called by useTerminalInput.onData handler. */
  writeToPty: (sessionId: string, data: string) => void;
  /** Resize PTY dimensions. */
  resizePty: (sessionId: string, cols: number, rows: number) => void;
  /** Check if a session is registered. */
  hasSession: (sessionId: string) => boolean;
}

/**
 * Manage PTY session lifecycle — event listeners, write, resize, kill.
 *
 * This hook is called once per PaneLayoutView and maintains a Map of
 * active sessions with their Tauri event unlisteners.
 */
export function usePtySessions(): UsePtySessionsReturn {
  const removeSessionState = useStore((s) => s.removeSessionState);

  /** Map: sessionId → { onData callback, onExit callback }. */
  const sessionsRef = useRef<Map<string, PtySessionState>>(new Map());

  /** Map: sessionId → Promise<UnlistenFn>[] (Tauri event cleanup). */
  const unlistenRef = useRef<Map<string, Promise<UnlistenFn>[]>>(new Map());

  /**
   * Register a new PTY session and wire up event listeners.
   *
   * Called by useTerminalInstances after creating an xterm instance.
   * Sets up:
   *   - `pty-data-{id}` listener → term.write()
   *   - `pty-exit-{id}` listener → cleanup
   */
  const registerSession = useCallback(
    (sessionId: string, term: Terminal) => {
      // Prevent double-registration.
      if (sessionsRef.current.has(sessionId)) return;

      sessionsRef.current.set(sessionId, {
        sessionId,
        onData: (data: string) => term.write(data),
        onExit: () => removeSessionState(sessionId),
      });

      // ── Shell output → terminal ─────────────────────────────────────
      const unlistenData = listen<PtyDataPayload>(
        `pty-data-${sessionId}`,
        (e) => {
          const session = sessionsRef.current.get(sessionId);
          if (session) session.onData(e.payload.data);
        },
      );

      // ── Shell exit → cleanup ───────────────────────────────────────
      const unlistenExit = listen(`pty-exit-${sessionId}`, () => {
        const session = sessionsRef.current.get(sessionId);
        if (session) session.onExit();
        // Cleanup listeners.
        const unlistens = unlistenRef.current.get(sessionId);
        if (unlistens) {
          unlistens.forEach((u) => u.then((fn) => fn()).catch(() => {}));
          unlistenRef.current.delete(sessionId);
        }
        sessionsRef.current.delete(sessionId);
      });

      unlistenRef.current.set(sessionId, [unlistenData, unlistenExit]);
    },
    [removeSessionState],
  );

  /**
   * Unregister a session, cleanup listeners, and kill backend PTY.
   */
  const unregisterSession = useCallback((sessionId: string) => {
    sessionsRef.current.delete(sessionId);
    const unlistens = unlistenRef.current.get(sessionId);
    if (unlistens) {
      unlistens.forEach((u) => u.then((fn) => fn()).catch(() => {}));
      unlistenRef.current.delete(sessionId);
    }
    // Kill backend PTY to stop the reader thread from sending more events.
    // This is essential during HMR: when the frontend reloads, old callback
    // IDs become invalid, and the Rust reader thread continues emitting
    // pty-data events → "Couldn't find callback id" errors.
    ipc.ptyKill(sessionId).catch(() => {});
  }, []);

  /**
   * Kill all PTY sessions (used during app shutdown or HMR cleanup).
   */
  const killAllSessions = useCallback(() => {
    // Cleanup all listeners first.
    unlistenRef.current.forEach((unlistens) => {
      unlistens.forEach((u) => u.then((fn) => fn()).catch(() => {}));
    });
    unlistenRef.current.clear();
    sessionsRef.current.clear();
    // Kill all backend PTY sessions in one call.
    ipc.ptyKillAll().catch(() => {});
  }, []);

  /**
   * Write data to PTY (user input → shell).
   */
  const writeToPty = useCallback((sessionId: string, data: string) => {
    ipc.ptyWrite(sessionId, data).catch(console.error);
  }, []);

  /**
   * Resize PTY dimensions.
   */
  const resizePty = useCallback(
    (sessionId: string, cols: number, rows: number) => {
      ipc.ptyResize(sessionId, cols, rows).catch(console.error);
    },
    [],
  );

  /**
   * Check if a session is registered.
   */
  const hasSession = useCallback((sessionId: string) => {
    return sessionsRef.current.has(sessionId);
  }, []);

  return {
    registerSession,
    unregisterSession,
    killAllSessions,
    writeToPty,
    resizePty,
    hasSession,
  };
}