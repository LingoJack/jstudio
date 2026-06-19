import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { Plus, X, ChevronRight } from 'lucide-react';

/**
 * TerminalTabs — VS Code-style tab bar for active terminal sessions.
 *
 * Design:
 *   - Flat, no rounded corners — matches VS Code editor tabs
 *   - Active tab: same bg as terminal content, top accent line
 *   - Inactive tab: muted, hover highlights
 *   - Close button: active tab always shows it, inactive on hover
 *   - `+` button on the right edge
 *
 * Keyboard shortcuts:
 *   Cmd/Ctrl + Opt/Alt + ← / →  — cycle tabs
 *   Cmd/Ctrl + W                 — close active tab
 */
export default function TerminalTabs() {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
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

      // Cmd/Ctrl + W → close active tab
      if (e.key === 'w' || e.key === 'W') {
        if (!activeSessionId) return;
        e.preventDefault();
        e.stopPropagation();
        closeSession(activeSessionId);
        return;
      }

      // Cmd/Ctrl + Opt/Alt + ← / → → cycle tabs
      if (!e.altKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (sessions.length < 2) return;

      e.preventDefault();
      e.stopPropagation();

      const idx = sessions.findIndex((s) => s.id === activeSessionId);
      if (idx === -1) return;

      const next =
        e.key === 'ArrowRight'
          ? (idx + 1) % sessions.length
          : (idx - 1 + sessions.length) % sessions.length;

      setActiveSession(sessions[next].id);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [sessions, activeSessionId, setActiveSession, closeSession]);

  // ── Scroll active tab into view ──────────────────────────────────
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeSessionId]);

  if (sessions.length === 0) return null;

  return (
    <div className="shrink-0 flex items-stretch h-9 border-b border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)]">
      {/* Scrollable tab strip */}
      <div
        ref={scrollRef}
        className="flex items-stretch overflow-x-auto flex-1 min-w-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              ref={isActive ? activeTabRef : null}
              onClick={() => setActiveSession(session.id)}
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
                {session.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(session.id);
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
