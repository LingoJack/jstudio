import { storage } from '../lib/storage';
import type { SliceCreator } from './storeHelpers';

/** Frontend representation of a terminal session. */
export interface TerminalSession {
  id: string;
  title: string;
  createdAt: number;
}

/** Default terminal dimensions — matches xterm.js initial cols/rows. */
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/** Terminal slice — manages PTY session lifecycle. */
export const createTerminalSlice: SliceCreator = (set, get) => ({
  sessions: [],
  activeSessionId: null,

  /** Create a new PTY session and add it to the list. */
  createSession: async () => {
    const info = await storage.ptyCreate({
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    });
    const session: TerminalSession = {
      id: info.id,
      title: info.title,
      createdAt: Date.now(),
    };
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: info.id,
    }));
  },

  /** Kill a session's PTY and remove it from the list. */
  closeSession: async (id: string) => {
    try {
      await storage.ptyKill(id);
    } catch (e) {
      console.error('Failed to kill PTY session:', e);
    }
    get().removeSessionState(id);
  },

  /** Rename a session (local + backend). */
  renameSession: (id: string, title: string) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, title } : sess,
      ),
    }));
    storage.ptySetTitle(id, title).catch(console.error);
  },

  /** Switch the active session (displayed in the terminal panel). */
  setActiveSession: (id: string) => set({ activeSessionId: id }),

  /**
   * Remove session state *without* killing the PTY.
   * Used when the shell exits on its own (pty-exit event) — the PTY
   * is already dead, so we just clean up the frontend.
   */
  removeSessionState: (id: string) => {
    set((s) => {
      const sessions = s.sessions.filter((sess) => sess.id !== id);
      const activeSessionId =
        s.activeSessionId === id
          ? sessions.length > 0
            ? sessions[sessions.length - 1].id
            : null
          : s.activeSessionId;
      return { sessions, activeSessionId };
    });
  },
});
