let tabSeq = 0;
function nextTabId() {
  return `tab-${Date.now()}-${tabSeq++}`;
}
const createWorkspaceSlice = (set, get) => ({
  // — state —
  tabs: [],
  activeTabId: null,
  // — actions —
  /**
   * Open (or focus) a document tab.
   * If a tab for this docId already exists, switch to it.
   * Otherwise, create a new tab at the end and switch to it.
   */
  openDocumentTab: (docId) => {
    const existing = get().tabs.find(
      (t) => t.kind === "document" && t.docId === docId
    );
    if (existing) {
      get().selectTab(existing.id);
      return;
    }
    const tab = {
      id: nextTabId(),
      kind: "document",
      docId
    };
    set((s) => ({ tabs: [...s.tabs, tab] }));
    get().selectTab(tab.id);
  },
  /**
   * Create a terminal tab bound to an existing pane group.
   * Always creates a new tab (terminals are ephemeral, never reused).
   */
  openTerminalTab: (groupId) => {
    const tab = {
      id: nextTabId(),
      kind: "terminal",
      groupId
    };
    set((s) => ({ tabs: [...s.tabs, tab] }));
    get().selectTab(tab.id);
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
    let newActiveTabId = state.activeTabId;
    if (state.activeTabId === tabId) {
      if (remaining.length === 0) {
        newActiveTabId = null;
      } else if (tab.kind === "document") {
        const docRemaining = remaining.filter((t) => t.kind === "document");
        if (docRemaining.length > 0) {
          const nextIdx = Math.min(idx, docRemaining.length - 1);
          newActiveTabId = docRemaining[nextIdx].id;
        } else {
          newActiveTabId = null;
        }
      } else {
        const termRemaining = remaining.filter((t) => t.kind === "terminal");
        if (termRemaining.length > 0) {
          const termIdx = Math.min(idx, termRemaining.length - 1);
          newActiveTabId = termRemaining[termIdx].id;
        } else {
          const docRemaining = remaining.filter((t) => t.kind === "document");
          newActiveTabId = docRemaining[docRemaining.length - 1]?.id ?? null;
        }
      }
    }
    set({ tabs: remaining });
    if (newActiveTabId) {
      get().selectTab(newActiveTabId);
    } else {
      set({ activeTabId: null });
    }
    if (tab.kind === "terminal" && tab.groupId) {
      const group = get().groups.find((g) => g.id === tab.groupId);
      if (group) {
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
    set({ tabs: [keep] });
    get().selectTab(keep.id);
    for (const tab of toClose) {
      if (tab.kind === "terminal" && tab.groupId) {
        const group = state.groups.find((g) => g.id === tab.groupId);
        if (group) {
          get().closeSession(group.activeSessionId);
        }
      }
    }
  },
  /** Select a tab without committing its underlying content. */
  selectTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.kind === "document" && tab.docId) {
      set({ activeTabId: tabId, activeSidebarView: "documents" });
    } else if (tab.kind === "terminal" && tab.groupId) {
      const group = get().groups.find((g) => g.id === tab.groupId);
      if (!group) return;
      set({
        activeTabId: tabId,
        activeSidebarView: "terminal",
        activeGroupId: group.id,
        activeSessionId: group.activeSessionId
      });
    }
  },
  /** Commit content only if the requested tab is still selected. */
  commitTabContent: (tabId) => {
    if (tabId !== get().activeTabId) return false;
    if (tabId === null) {
      set({ activeDoc: null, activeDocId: "" });
      return true;
    }
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    if (tab.kind === "document") {
      if (!tab.docId) return false;
      get().openDocument(tab.docId);
    }
    return true;
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
      const localIdx = sameKind.findIndex((t) => t.id === activeTabId);
      const nextLocal = (localIdx + direction + sameKind.length) % sameKind.length;
      get().selectTab(sameKind[nextLocal].id);
    } else {
      const otherKind = tabs.filter((t) => t.kind !== activeTab.kind);
      if (otherKind.length > 0) {
        get().selectTab(otherKind[0].id);
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
      (t) => t.kind === "terminal" && t.groupId === groupId
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
    set({ tabs: remaining });
    if (newActiveTabId) {
      get().selectTab(newActiveTabId);
    } else {
      set({ activeTabId: null });
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
      (t) => t.kind === "document" && t.docId === docId
    );
    if (!tab) return;
    const idx = tabs.findIndex((t) => t.id === tab.id);
    const remaining = tabs.filter((t) => t.id !== tab.id);
    let newActiveTabId = activeTabId;
    if (activeTabId === tab.id) {
      if (remaining.length === 0) {
        newActiveTabId = null;
      } else {
        const docRemaining = remaining.filter((t) => t.kind === "document");
        if (docRemaining.length > 0) {
          const nextIdx = Math.min(idx, docRemaining.length - 1);
          newActiveTabId = docRemaining[nextIdx].id;
        } else {
          newActiveTabId = null;
        }
      }
    }
    set({ tabs: remaining });
    if (newActiveTabId) {
      get().selectTab(newActiveTabId);
    } else {
      set({ activeTabId: null });
    }
  }
});
export {
  createWorkspaceSlice
};
