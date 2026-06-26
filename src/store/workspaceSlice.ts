import type { SliceCreator } from './storeHelpers';

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

/**
 * A unified tab — can be a document or a terminal pane group.
 * This is the "view focus" layer; the actual data (document content,
 * PTY lifecycle) lives in documentsSlice / terminalSlice respectively.
 */
export interface UnifiedTab {
  /** Unique tab ID, e.g. "tab-{timestamp}" */
  id: string;
  kind: 'document' | 'terminal';
  /** For document tabs: the docId. */
  docId?: string;
  /** For terminal tabs: the pane group ID (1 tab = 1 PaneGroup). */
  groupId?: string;
}

// ────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────

let tabSeq = 0;
function nextTabId(): string {
  return `tab-${Date.now()}-${tabSeq++}`;
}

// ────────────────────────────────────────────────
// Slice
// ────────────────────────────────────────────────

export const createWorkspaceSlice: SliceCreator = (set, get) => ({
  // — state —
  tabs: [],
  activeTabId: null,

  // — actions —

  /**
   * Open (or focus) a document tab.
   * If a tab for this docId already exists, switch to it.
   * Otherwise, create a new tab at the end and switch to it.
   *
   * Also syncs activeDoc/activeDocId via documentsSlice.openDocument.
   */
  openDocumentTab: (docId) => {
    const existing = get().tabs.find(
      (t) => t.kind === 'document' && t.docId === docId,
    );

    if (existing) {
      // Focus existing tab + sync active doc.
      set({ activeTabId: existing.id });
      get().openDocument(docId);
      return;
    }

    // Create new tab.
    const tab: UnifiedTab = {
      id: nextTabId(),
      kind: 'document',
      docId,
    };

    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    }));

    // Sync active doc so BlockEditor renders it.
    get().openDocument(docId);
  },

  /**
   * Create a terminal tab bound to an existing pane group.
   * Always creates a new tab (terminals are ephemeral, never reused).
   */
  openTerminalTab: (groupId) => {
    const tab: UnifiedTab = {
      id: nextTabId(),
      kind: 'terminal',
      groupId,
    };

    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    }));
  },

  /**
   * Close a tab.
   * - Document tab: just remove the tab (document data is untouched).
   * - Terminal tab: kill the PTY sessions via closeSession, then remove the tab.
   *
   * If the closed tab was active, switch to an adjacent tab.
   */
  closeTab: (tabId) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const idx = state.tabs.findIndex((t) => t.id === tabId);
    const remaining = state.tabs.filter((t) => t.id !== tabId);

    // Determine the new active tab.
    let newActiveTabId = state.activeTabId;
    if (state.activeTabId === tabId) {
      if (remaining.length === 0) {
        newActiveTabId = null;
      } else if (tab.kind === 'document') {
        // Closing a document tab: prefer to stay in documents view.
        // Only jump to a terminal tab if there are no document tabs left.
        const docRemaining = remaining.filter((t) => t.kind === 'document');
        if (docRemaining.length > 0) {
          const nextIdx = Math.min(idx, docRemaining.length - 1);
          newActiveTabId = docRemaining[nextIdx].id;
        } else {
          // No document tabs left — show the empty state instead of
          // jumping to a terminal tab.
          newActiveTabId = null;
        }
      } else {
        // Closing a terminal tab: prefer adjacent terminal tab; if none,
        // fall back to the most recent document tab.
        const termRemaining = remaining.filter((t) => t.kind === 'terminal');
        if (termRemaining.length > 0) {
          const termIdx = Math.min(idx, termRemaining.length - 1);
          newActiveTabId = termRemaining[termIdx].id;
        } else {
          const docRemaining = remaining.filter((t) => t.kind === 'document');
          newActiveTabId = docRemaining[docRemaining.length - 1]?.id ?? null;
        }
      }
    }

    set({ tabs: remaining, activeTabId: newActiveTabId });

    // Activate the new active tab's content.
    if (newActiveTabId) {
      const newActive = remaining.find((t) => t.id === newActiveTabId);
      if (newActive?.kind === 'document' && newActive.docId) {
        get().openDocument(newActive.docId);
        set({ activeSidebarView: 'documents' });
      } else if (newActive?.kind === 'terminal' && newActive.groupId) {
        const group = get().groups.find((g) => g.id === newActive.groupId);
        if (group) {
          get().setActiveSession(group.activeSessionId);
        }
        set({ activeSidebarView: 'terminal' });
      }
    } else {
      // No active tab — clear the active document so the EmptyState shows.
      set({ activeDoc: null, activeDocId: null });
    }

    // If closing a terminal tab, kill the PTY sessions (fire-and-forget).
    if (tab.kind === 'terminal' && tab.groupId) {
      const group = get().groups.find((g) => g.id === tab.groupId);
      if (group) {
        // closeSession kills PTYs and removes the group from terminalSlice.
        // We already removed the workspace tab above, so there's no
        // double-cleanup issue.
        get().closeSession(group.activeSessionId);
      }
    }
  },

  /**
   * Close all tabs *except* the specified one.
   * Terminal tabs get their PTYs killed; document tabs are just removed.
   */
  closeOtherTabs: (keepTabId) => {
    const state = get();
    const keep = state.tabs.find((t) => t.id === keepTabId);
    if (!keep) return;

    const toClose = state.tabs.filter((t) => t.id !== keepTabId);

    // Kill terminal tabs' PTYs (fire-and-forget).
    for (const tab of toClose) {
      if (tab.kind === 'terminal' && tab.groupId) {
        const group = state.groups.find((g) => g.id === tab.groupId);
        if (group) {
          get().closeSession(group.activeSessionId);
        }
      }
    }

    set({ tabs: [keep], activeTabId: keep.id });

    // Sync content for the kept tab.
    if (keep.kind === 'document' && keep.docId) {
      get().openDocument(keep.docId);
      set({ activeSidebarView: 'documents' });
    } else if (keep.kind === 'terminal' && keep.groupId) {
      const group = get().groups.find((g) => g.id === keep.groupId);
      if (group) {
        get().setActiveSession(group.activeSessionId);
      }
      set({ activeSidebarView: 'terminal' });
    }
  },

  /**
   * Switch the active tab.
   * Also syncs the underlying document/session state.
   */
  setActiveTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;

    set({ activeTabId: tabId });

    if (tab.kind === 'document' && tab.docId) {
      get().openDocument(tab.docId);
      // Sync the view so the sidebar shows / hides correctly.
      set({ activeSidebarView: 'documents' });
    } else if (tab.kind === 'terminal' && tab.groupId) {
      const group = get().groups.find((g) => g.id === tab.groupId);
      if (group) {
        get().setActiveSession(group.activeSessionId);
      }
      // Terminal tabs hide the sidebar.
      set({ activeSidebarView: 'terminal' });
    }
  },

  /**
   * Cycle to the next/previous tab (wraps around).
   */
  /**
   * Cycle to the next/previous tab — same-kind first, then cross-kind.
   *
   * With separate tab bars for documents and terminals, the cycle
   * shortcut (Cmd+Option+←/→) works like this:
   *   1. If the active tab's kind has more than 1 sibling, cycle within
   *      that kind.
   *   2. If it's the only one of its kind, jump to the first tab of the
   *      *other* kind.
   *   3. If there's only one tab total, do nothing.
   */
  cycleTab: (direction) => {
    const { tabs, activeTabId } = get();
    if (tabs.length < 2) return;

    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx === -1) return;

    const activeTab = tabs[idx];
    const sameKind = tabs.filter((t) => t.kind === activeTab.kind);

    if (sameKind.length > 1) {
      // Cycle within the same kind.
      const localIdx = sameKind.findIndex((t) => t.id === activeTabId);
      const nextLocal =
        (localIdx + direction + sameKind.length) % sameKind.length;
      get().setActiveTab(sameKind[nextLocal].id);
    } else {
      // Jump to the first tab of the other kind.
      const otherKind = tabs.filter((t) => t.kind !== activeTab.kind);
      if (otherKind.length > 0) {
        get().setActiveTab(otherKind[0].id);
      }
    }
  },

  /**
   * Remove a workspace tab that corresponds to a terminal group,
   * WITHOUT killing the PTYs. Used when the group is detached
   * (torn off to a new window) or removed by the terminal slice.
   *
   * This is called BY terminalSlice, not by UI components.
   */
  removeTerminalTabByGroupId: (groupId) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find(
      (t) => t.kind === 'terminal' && t.groupId === groupId,
    );
    if (!tab) return;

    const idx = tabs.findIndex((t) => t.id === tab.id);
    const remaining = tabs.filter((t) => t.id !== tab.id);

    let newActiveTabId = activeTabId;
    if (activeTabId === tab.id) {
      if (remaining.length === 0) {
        newActiveTabId = null;
      } else {
        const nextIdx = Math.min(idx, remaining.length - 1);
        newActiveTabId = remaining[nextIdx].id;
      }
    }

    set({ tabs: remaining, activeTabId: newActiveTabId });

    // Activate the new tab's content.
    if (newActiveTabId) {
      const newActive = remaining.find((t) => t.id === newActiveTabId);
      if (newActive?.kind === 'document' && newActive.docId) {
        get().openDocument(newActive.docId);
        set({ activeSidebarView: 'documents' });
      } else if (newActive?.kind === 'terminal' && newActive.groupId) {
        const group = get().groups.find((g) => g.id === newActive.groupId);
        if (group) {
          get().setActiveSession(group.activeSessionId);
        }
        set({ activeSidebarView: 'terminal' });
      }
    }
  },

  /**
   * Remove a workspace tab that corresponds to a document,
   * WITHOUT deleting the document. Used when the document is
   * trashed or deleted — the tab should disappear too.
   *
   * This is called BY documentsSlice, not by UI components.
   */
  removeDocumentTabByDocId: (docId) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find(
      (t) => t.kind === 'document' && t.docId === docId,
    );
    console.log('[removeDocumentTabByDocId] docId:', docId, 'found tab:', tab, 'all tabs:', tabs.map(t => ({id: t.id, kind: t.kind, docId: t.docId})));
    if (!tab) return;

    const idx = tabs.findIndex((t) => t.id === tab.id);
    const remaining = tabs.filter((t) => t.id !== tab.id);

    let newActiveTabId = activeTabId;
    if (activeTabId === tab.id) {
      if (remaining.length === 0) {
        newActiveTabId = null;
      } else {
        const nextIdx = Math.min(idx, remaining.length - 1);
        newActiveTabId = remaining[nextIdx].id;
      }
    }

    set({ tabs: remaining, activeTabId: newActiveTabId });

    // Activate the new tab's content.
    if (newActiveTabId) {
      const newActive = remaining.find((t) => t.id === newActiveTabId);
      if (newActive?.kind === 'document' && newActive.docId) {
        get().openDocument(newActive.docId);
        set({ activeSidebarView: 'documents' });
      } else if (newActive?.kind === 'terminal' && newActive.groupId) {
        const group = get().groups.find((g) => g.id === newActive.groupId);
        if (group) {
          get().setActiveSession(group.activeSessionId);
        }
        set({ activeSidebarView: 'terminal' });
      }
    }
  },
});
