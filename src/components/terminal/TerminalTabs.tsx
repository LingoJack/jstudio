import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { Plus, X, ChevronRight } from 'lucide-react';

/**
 * TerminalTabs — VS Code-style tab bar for terminal pane groups.
 *
 * Each tab represents one PaneGroup (Kitty "window").  The tab title
 * shows the active session's title within that group.
 *
 * Design:
 *   - Flat, no rounded corners — matches VS Code editor tabs
 *   - Active tab: same bg as terminal content, top accent line
 *   - Inactive tab: muted, hover highlights
 *   - Close button: active tab always shows it, inactive on hover
 *   - `+` button on the right edge → new group (new tab)
 *
 * Keyboard shortcuts:
 *   Cmd/Ctrl + Opt/Alt + ← / →  — cycle groups
 *   Cmd/Ctrl + T                 — new group/tab
 *
 * (Cmd+W for closing a single pane is handled by usePaneShortcuts.)
 */
export default function TerminalTabs() {
  const groups = useStore((s) => s.groups);
  const sessions = useStore((s) => s.sessions);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const closeSession = useStore((s) => s.closeSession);
  const createSession = useStore((s) => s.createSession);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd/Ctrl + T → new tab (new group)
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        e.stopPropagation();
        createSession();
        return;
      }

      // Cmd/Ctrl + Opt/Alt + ← / → → cycle groups
      if (!e.altKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (groups.length < 2) return;

      e.preventDefault();
      e.stopPropagation();

      const idx = groups.findIndex((g) => g.id === activeGroupId);
      if (idx === -1) return;

      const next =
        e.key === 'ArrowRight'
          ? (idx + 1) % groups.length
          : (idx - 1 + groups.length) % groups.length;

      // Switch to the target group's active session.
      setActiveSession(groups[next].activeSessionId);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [groups, activeGroupId, setActiveSession, createSession]);

  // ── Scroll active tab into view ──────────────────────────────────
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeGroupId]);

  if (groups.length === 0) return null;

  return (
    <div className="shrink-0 flex items-stretch h-9 border-b border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)]">
      {/* Scrollable tab strip */}
      <div
        ref={scrollRef}
        className="flex items-stretch overflow-x-auto flex-1 min-w-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {groups.map((group) => {
          const isActive = group.id === activeGroupId;
          // Show the active session's title for this group.
          const title =
            sessions.find((s) => s.id === group.activeSessionId)?.title ??
            'Terminal';
          // Show pane count if > 1.
          const paneCount = group.sessionIds.length;
          return (
            <div
              key={group.id}
              ref={isActive ? activeTabRef : null}
              onClick={() => setActiveSession(group.activeSessionId)}
              className={`group relative flex items-center gap-2 pl-3 pr-2 cursor-pointer border-r border-[var(--vscode-sideBar-border)] shrink-0 transition-colors duration-100 ${
                isActive
                  ? 'bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]'
                  : 'bg-transparent text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-foreground)]'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--vscode-focusBorder)]" />
              )}
              <ChevronRight className="w-3 h-3 opacity-30 shrink-0" />
              <span className="text-xs font-medium max-w-[140px] truncate">
                {title}
              </span>
              {paneCount > 1 && (
                <span className="text-[10px] opacity-50 shrink-0">
                  {paneCount}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(group.activeSessionId);
                }}
                className={`shrink-0 p-0.5 rounded transition-all duration-100 hover:bg-[var(--vscode-toolbar-hoverBackground)] ${
                  isActive
                    ? 'opacity-60 hover:opacity-100'
                    : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* `+` spawn button */}
      <button
        onClick={() => createSession()}
        className="shrink-0 w-9 flex items-center justify-center text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer border-l border-[var(--vscode-sideBar-border)]"
        title="New Terminal"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
