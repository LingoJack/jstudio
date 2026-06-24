import { storage } from '../lib/storage';
import type { SliceCreator } from './storeHelpers';
import type {
  PaneGroup,
  PaneLayoutType,
  PaneResizeState,
} from '../components/terminal/types';

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
  /** Backend title (kept for pty_set_title compatibility). */
  title: string;
  /** User-set custom name (null = not renamed). Highest display priority. */
  customTitle: string | null;
  /** OSC 0/2 auto-detected title from the shell. Medium priority. */
  autoTitle: string | null;
  /** Source template id (null if spawned ad-hoc). */
  templateId: string | null;
  /** Actual working directory the shell started in. */
  cwd: string;
  createdAt: number;
}

// Re-export pane types for convenience.
export type { PaneGroup, PaneLayoutType, PaneResizeState };

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/** Layout cycle order, matching Kitty's next_layout. */
const LAYOUT_CYCLE: PaneLayoutType[] = [
  'tall',
  'fat',
  'grid',
  'horizontal',
  'vertical',
];

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
// Internal helpers
// ────────────────────────────────────────────────

/** Create a pane group wrapping a single session. */
function makeGroup(sessionId: string): PaneGroup {
  return {
    id: `group-${Date.now()}`,
    sessionIds: [sessionId],
    activeSessionId: sessionId,
    layout: 'tall',
  };
}

// ────────────────────────────────────────────────
// Slice
// ────────────────────────────────────────────────

export const createTerminalSlice: SliceCreator = (set, get) => ({
  // — state —
  templates: [],
  sessions: [],
  groups: [],
  activeGroupId: null,
  /**
   * Always mirrors the active group's activeSessionId.
   * Kept as top-level state for ergonomic subscriptions.
   */
  activeSessionId: null,
  /** Recently used working directories (max 10, persisted). */
  recentDirs: [],

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

  /** Load recent dirs from settings.json (called during init). */
  initRecentDirs: (raw) => {
    let dirs: string[] = [];
    if (Array.isArray(raw)) {
      dirs = raw.filter((d): d is string => typeof d === 'string' && d.length > 0).slice(0, 10);
    }
    set({ recentDirs: dirs });
  },

  /** Add a working directory to recent list (dedup, prepend, cap at 10). */
  addRecentDir: (cwd) => {
    if (!cwd) return;
    set((s) => {
      const filtered = s.recentDirs.filter((d) => d !== cwd);
      const recentDirs = [cwd, ...filtered].slice(0, 10);
      storage.saveSettings({ terminalRecentDirs: recentDirs }).catch(console.error);
      return { recentDirs };
    });
  },

  /** Clear all recent directories. */
  clearRecentDirs: () => {
    set({ recentDirs: [] });
    storage.saveSettings({ terminalRecentDirs: [] }).catch(console.error);
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

  // ── Session / Group actions ─────────────────────────────────────

  /**
   * Spawn a new PTY session and wrap it in its own pane group.
   * This is equivalent to "new tab" — each group is one tab.
   * The new group becomes the active group.
   */
  createSession: async (templateId, opts) => {
    const tmpl = templateId
      ? get().templates.find((t) => t.id === templateId)
      : null;

    // Explicit cwd overrides template cwd.
    const cwd = opts?.cwd ?? tmpl?.cwd ?? '~';

    const info = await storage.ptyCreate({
      cwd,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    });

    const session: TerminalSession = {
      id: info.id,
      title: tmpl?.name ?? 'Terminal',
      customTitle: null,
      autoTitle: null,
      templateId: tmpl?.id ?? null,
      cwd,
      createdAt: Date.now(),
    };

    const group = makeGroup(info.id);

    set((s) => ({
      sessions: [...s.sessions, session],
      groups: [...s.groups, group],
      activeGroupId: group.id,
      activeSessionId: info.id,
    }));
  },

  /**
   * Kill every session in the group that contains `sessionId`,
   * then remove the group.  This is "close tab".
   */
  closeSession: async (sessionId) => {
    const state = get();
    const group = state.groups.find((g) =>
      g.sessionIds.includes(sessionId),
    );
    if (!group) return;

    // Collect cwd of every session in this group for recent dirs (LRU).
    const cwds = group.sessionIds
      .map((sid) => state.sessions.find((s) => s.id === sid)?.cwd)
      .filter((cwd): cwd is string => !!cwd);

    // Kill all PTYs in the group.
    await Promise.all(
      group.sessionIds.map((sid) =>
        storage.ptyKill(sid).catch((e) =>
          console.error('Failed to kill PTY session:', e),
        ),
      ),
    );

    get().removeGroupState(group.id);

    // Record each cwd via LRU (dedup + cap 10).
    cwds.forEach((cwd) => get().addRecentDir(cwd));
  },

  /** Update a session's current working directory (from OSC title tracking). */
  updateSessionCwd: (sessionId, cwd) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, cwd } : sess,
      ),
    }));
  },

  /** Rename a session (local + backend). */
  renameSession: (id, title) => {
    const trimmed = title.trim();
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id
          ? { ...sess, customTitle: trimmed || null, title: trimmed || sess.title }
          : sess,
      ),
    }));
    storage.ptySetTitle(id, trimmed || 'Terminal').catch(console.error);
  },

  /** Set the auto-detected title from OSC sequences (won't override customTitle). */
  setAutoTitle: (sessionId, title) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId && !sess.customTitle
          ? { ...sess, autoTitle: title }
          : sess,
      ),
    }));
  },

  /**
   * Focus a session: update the active pane within its group
   * and switch the active group.
   */
  setActiveSession: (id) => {
    set((s) => {
      const group = s.groups.find((g) => g.sessionIds.includes(id));
      if (!group) return {};
      return {
        activeGroupId: group.id,
        activeSessionId: id,
        groups: s.groups.map((g) =>
          g.id === group.id ? { ...g, activeSessionId: id } : g,
        ),
      };
    });
  },

  /**
   * Remove session state *without* killing the PTY.
   * Used when the shell exits on its own (pty-exit event).
   * Cleans up the session from its group; if the group becomes
   * empty, removes the group too.
   */
  removeSessionState: (id) => {
    // Collect cwd before state mutation (for LRU recording).
    const state = get();
    const session = state.sessions.find((s) => s.id === id);
    const closedCwd = session?.cwd ?? null;

    set((s) => {
      const sessions = s.sessions.filter((sess) => sess.id !== id);

      // Update groups: remove the session from any group that contains it.
      let groups = s.groups.map((g) => {
        if (!g.sessionIds.includes(id)) return g;
        const sessionIds = g.sessionIds.filter((sid) => sid !== id);
        const activeSessionId =
          g.activeSessionId === id
            ? sessionIds[0] ?? ''
            : g.activeSessionId;
        return {
          ...g,
          sessionIds,
          activeSessionId,
          resizeState: undefined,
        };
      });

      // Remove empty groups.
      const hadEmptyGroups = groups.some((g) => g.sessionIds.length === 0);
      groups = groups.filter((g) => g.sessionIds.length > 0);

      // Determine new active group / session.
      let { activeGroupId, activeSessionId } = s;

      if (hadEmptyGroups) {
        const activeGroupRemoved =
          !groups.some((g) => g.id === activeGroupId);
        if (activeGroupRemoved) {
          activeGroupId = groups.length > 0 ? groups[groups.length - 1].id : null;
          activeSessionId =
            activeGroupId !== null
              ? (groups.find((g) => g.id === activeGroupId)?.activeSessionId ?? null)
              : null;
        }
      }

      // If the removed session was the active one but the group still
      // has members, update activeSessionId.
      if (activeSessionId === id) {
        const ag = groups.find((g) => g.id === activeGroupId);
        activeSessionId = ag?.activeSessionId ?? null;
      }

      return { sessions, groups, activeGroupId, activeSessionId };
    });

    // Record the closed session's cwd via LRU.
    if (closedCwd) {
      get().addRecentDir(closedCwd);
    }
  },

  /**
   * Remove an entire group's state without killing PTYs.
   * Used during closeSession after PTYs are killed.
   */
  removeGroupState: (groupId) => {
    set((s) => {
      const group = s.groups.find((g) => g.id === groupId);
      if (!group) return {};

      const removeIds = new Set(group.sessionIds);
      const sessions = s.sessions.filter((sess) => !removeIds.has(sess.id));
      const groups = s.groups.filter((g) => g.id !== groupId);

      let { activeGroupId, activeSessionId } = s;
      if (activeGroupId === groupId) {
        activeGroupId = groups.length > 0 ? groups[groups.length - 1].id : null;
        activeSessionId =
          activeGroupId !== null
            ? (groups.find((g) => g.id === activeGroupId)?.activeSessionId ?? null)
            : null;
      }

      return { sessions, groups, activeGroupId, activeSessionId };
    });
  },

  /**
   * Detach a group into a separate OS window (tear-off).
   *
   * Removes the group + its sessions from THIS window's store but leaves
   * the backing PTYs alive — the torn-off window attaches to the same PTY
   * session ids and keeps receiving `pty-data-{id}` events (the Rust PTY
   * registry is process-global and broadcasts to all windows).
   *
   * The caller (lib/terminalDetach.ts) must serialize each session's
   * scrollback BEFORE calling this, since removing the group unmounts the
   * panes and disposes their xterm instances in this window.
   *
   * Behaviourally identical to `removeGroupState` (which also spares the
   * PTYs), but kept as a distinct, intent-revealing entry point.
   */
  detachGroup: (groupId) => {
    get().removeGroupState(groupId);
  },

  // ── Pane actions (Kitty-style splits) ───────────────────────────

  /**
   * Split the active group: spawn a new session and add it as a new
   * pane.  The new pane becomes the active pane.
   * (Cmd+Enter)
   */
  splitPane: async (templateId) => {
    const state = get();
    const group = state.groups.find((g) => g.id === state.activeGroupId);
    if (!group) {
      // No active group — fall back to creating a new tab.
      return state.createSession(templateId);
    }

    const tmpl = templateId
      ? state.templates.find((t) => t.id === templateId)
      : null;
    // Use template cwd if provided; otherwise inherit the active pane's cwd.
    const activeSession = state.sessions.find(
      (sess) => sess.id === group.activeSessionId,
    );
    const cwd = tmpl?.cwd ?? activeSession?.cwd ?? '~';

    const info = await storage.ptyCreate({
      cwd,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
    });

    const session: TerminalSession = {
      id: info.id,
      title: tmpl?.name ?? 'Terminal',
      customTitle: null,
      autoTitle: null,
      templateId: tmpl?.id ?? null,
      cwd,
      createdAt: Date.now(),
    };

    set((s) => ({
      sessions: [...s.sessions, session],
      groups: s.groups.map((g) =>
        g.id === group.id
          ? {
              ...g,
              sessionIds: [...g.sessionIds, info.id],
              activeSessionId: info.id,
              resizeState: undefined,
            }
          : g,
      ),
      activeSessionId: info.id,
    }));
  },

  /**
   * Cycle to the next layout in the active group.
   * (Cmd+Shift+L)
   */
  cyclePaneLayout: () => {
    set((s) => {
      const group = s.groups.find((g) => g.id === s.activeGroupId);
      if (!group) return {};
      const idx = LAYOUT_CYCLE.indexOf(group.layout);
      const next = LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length];
      return {
        groups: s.groups.map((g) =>
          g.id === group.id ? { ...g, layout: next, resizeState: undefined } : g,
        ),
      };
    });
  },

  /** Explicitly set the layout of the active group. */
  setPaneLayout: (layout) => {
    set((s) => {
      const group = s.groups.find((g) => g.id === s.activeGroupId);
      if (!group) return {};
      return {
        groups: s.groups.map((g) =>
          g.id === group.id ? { ...g, layout, resizeState: undefined } : g,
        ),
      };
    });
  },

  /** Remember drag-adjusted pane proportions for a live tab. */
  setPaneResizeState: (groupId, resizeState) => {
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === groupId ? { ...g, resizeState } : g,
      ),
    }));
  },

  /**
   * Rotate the active pane's position in the session array.
   * This effectively moves where it appears in the layout.
   * (Cmd+Shift+F)
   */
  moveActivePane: () => {
    set((s) => {
      const group = s.groups.find((g) => g.id === s.activeGroupId);
      if (!group || group.sessionIds.length < 2) return {};

      const ids = [...group.sessionIds];
      const activeIdx = ids.indexOf(group.activeSessionId);
      if (activeIdx === -1) return {};

      // Swap with the next pane (wrap around).
      const nextIdx = (activeIdx + 1) % ids.length;
      [ids[activeIdx], ids[nextIdx]] = [ids[nextIdx], ids[activeIdx]];

      return {
        groups: s.groups.map((g) =>
          g.id === group.id
            ? { ...g, sessionIds: ids, resizeState: undefined }
            : g,
        ),
      };
    });
  },

  /**
   * Focus the next pane in the active group (wraps around).
   * (Cmd+])
   */
  focusNextPane: () => {
    set((s) => {
      const group = s.groups.find((g) => g.id === s.activeGroupId);
      if (!group || group.sessionIds.length < 2) return {};
      const idx = group.sessionIds.indexOf(group.activeSessionId);
      const nextId = group.sessionIds[(idx + 1) % group.sessionIds.length];
      return {
        activeSessionId: nextId,
        groups: s.groups.map((g) =>
          g.id === group.id ? { ...g, activeSessionId: nextId } : g,
        ),
      };
    });
  },

  /**
   * Focus the previous pane in the active group (wraps around).
   * (Cmd+[)
   */
  focusPrevPane: () => {
    set((s) => {
      const group = s.groups.find((g) => g.id === s.activeGroupId);
      if (!group || group.sessionIds.length < 2) return {};
      const idx = group.sessionIds.indexOf(group.activeSessionId);
      const prevId =
        group.sessionIds[
          (idx - 1 + group.sessionIds.length) % group.sessionIds.length
        ];
      return {
        activeSessionId: prevId,
        groups: s.groups.map((g) =>
          g.id === group.id ? { ...g, activeSessionId: prevId } : g,
        ),
      };
    });
  },

  /**
   * Focus a specific pane within the active group.
   * (Click on a pane)
   */
  setActivePane: (sessionId) => {
    set((s) => {
      const group = s.groups.find((g) => g.id === s.activeGroupId);
      if (!group || !group.sessionIds.includes(sessionId)) return {};
      return {
        activeSessionId: sessionId,
        groups: s.groups.map((g) =>
          g.id === group.id ? { ...g, activeSessionId: sessionId } : g,
        ),
      };
    });
  },

  /**
   * Close a single pane (one session within a group).
   * If it's the last pane in the group, the group is removed too.
   * (Cmd+W)
   */
  closePane: async (sessionId) => {
    const state = get();
    const group = state.groups.find((g) =>
      g.sessionIds.includes(sessionId),
    );
    if (!group) return;

    // Kill just this one PTY.
    try {
      await storage.ptyKill(sessionId);
    } catch (e) {
      console.error('Failed to kill PTY session:', e);
    }

    // Remove the session from state (removeSessionState handles
    // group cleanup, including removing empty groups).
    get().removeSessionState(sessionId);
  },
});
