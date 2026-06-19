import { storage } from '../lib/storage';
import type { SliceCreator } from './storeHelpers';

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

/**
 * A terminal template — a reusable preset for spawning sessions.
 * Persisted to settings.json.  Designed to be extensible: `type: 'ssh'`
 * can be added later without changing the interface shape.
 */
export interface TerminalTemplate {
  id: string;
  name: string;
  /** Session type — 'local' for local shell, 'ssh' reserved for future. */
  type: 'local';
  /** Working directory for 'local' type. */
  cwd: string;
  createdAt: number;
}

/**
 * A live terminal session — an actual PTY process spawned from a template.
 * Ephemeral: not persisted, dies when the app closes.
 */
export interface TerminalSession {
  id: string;
  title: string;
  /** Source template id (null if spawned ad-hoc). */
  templateId: string | null;
  /** Actual working directory the shell started in. */
  cwd: string;
  createdAt: number;
}

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/**
 * A built-in default template so new users have something to click.
 * Uses the user's home directory.
 */
const DEFAULT_TEMPLATE: TerminalTemplate = {
  id: 'tmpl-default',
  name: 'Terminal',
  type: 'local',
  cwd: '~',
  createdAt: 0,
};

// ────────────────────────────────────────────────
// Persistence helper
// ────────────────────────────────────────────────

function saveTemplates(templates: TerminalTemplate[]) {
  storage
    .saveSettings({ terminalTemplates: templates })
    .catch(console.error);
}

// ────────────────────────────────────────────────
// Slice
// ────────────────────────────────────────────────

export const createTerminalSlice: SliceCreator = (set, get) => ({
  // — state —
  templates: [],
  sessions: [],
  activeSessionId: null,

  // ── Template actions ────────────────────────────────────────────

  /** Load templates from settings.json (called during init). */
  initTemplates: (raw) => {
    let templates: TerminalTemplate[] = [];
    if (Array.isArray(raw)) {
      templates = raw
        .filter(
          (t): t is TerminalTemplate =>
            typeof t === 'object' &&
            t !== null &&
            typeof t.id === 'string' &&
            typeof t.name === 'string' &&
            typeof t.cwd === 'string',
        )
        .map((t) => ({
          id: t.id,
          name: t.name,
          type: 'local',
          cwd: t.cwd,
          createdAt: t.createdAt ?? 0,
        }));
    }
    // Always ensure at least the default template exists.
    if (templates.length === 0) {
      templates = [{ ...DEFAULT_TEMPLATE }];
      saveTemplates(templates);
    }
    set({ templates });
  },

  /** Create a new template and persist it. */
  addTemplate: (name, cwd) => {
    const tmpl: TerminalTemplate = {
      id: `tmpl-${Date.now()}`,
      name: name.trim() || 'Terminal',
      type: 'local',
      cwd: cwd.trim() || '~',
      createdAt: Date.now(),
    };
    const templates = [...get().templates, tmpl];
    set({ templates });
    saveTemplates(templates);
  },

  /** Remove a template by id. */
  removeTemplate: (id) => {
    const templates = get().templates.filter((t) => t.id !== id);
    set({ templates });
    saveTemplates(templates);
  },

  /** Rename a template (and/or update cwd). */
  updateTemplate: (id, fields) => {
    const templates = get().templates.map((t) =>
      t.id === id
        ? {
            ...t,
            ...(fields.name !== undefined ? { name: fields.name } : {}),
            ...(fields.cwd !== undefined ? { cwd: fields.cwd } : {}),
          }
        : t,
    );
    set({ templates });
    saveTemplates(templates);
  },

  // ── Session actions ─────────────────────────────────────────────

  /**
   * Spawn a new PTY session from a template (or ad-hoc).
   * If `templateId` is provided, uses the template's cwd.
   * The new session becomes the active session.
   */
  createSession: async (templateId) => {
    const tmpl = templateId
      ? get().templates.find((t) => t.id === templateId)
      : null;

    const cwd = tmpl?.cwd ?? '~';

    const info = await storage.ptyCreate({
      cwd,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    });

    const session: TerminalSession = {
      id: info.id,
      title: tmpl?.name ?? 'Terminal',
      templateId: tmpl?.id ?? null,
      cwd,
      createdAt: Date.now(),
    };

    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: info.id,
    }));
  },

  /** Kill a session's PTY and remove it from the list. */
  closeSession: async (id) => {
    try {
      await storage.ptyKill(id);
    } catch (e) {
      console.error('Failed to kill PTY session:', e);
    }
    get().removeSessionState(id);
  },

  /** Rename a session (local + backend). */
  renameSession: (id, title) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, title } : sess,
      ),
    }));
    storage.ptySetTitle(id, title).catch(console.error);
  },

  /** Switch the active session (displayed in the terminal panel). */
  setActiveSession: (id) => set({ activeSessionId: id }),

  /**
   * Remove session state *without* killing the PTY.
   * Used when the shell exits on its own (pty-exit event).
   */
  removeSessionState: (id) => {
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
