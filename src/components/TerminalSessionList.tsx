import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { TerminalSquare, Plus, X } from 'lucide-react';

interface ContextMenuState {
  x: number;
  y: number;
  sessionId: string;
}

/**
 * TerminalSessionList — sidebar panel for managing PTY sessions.
 *
 * UI mirrors DocumentList: header (title + count + new button), scrollable
 * list, right-click context menu, double-click rename, resize handle.
 */
export default function TerminalSessionList() {
  const { t } = useI18n();
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const setActiveSession = useStore((s) => s.setActiveSession);
  const createSession = useStore((s) => s.createSession);
  const closeSession = useStore((s) => s.closeSession);
  const renameSession = useStore((s) => s.renameSession);
  const sidebarWidth = useStore((s) => s.sidebarWidth);

  const { onResizeStart } = useSidebarResize();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [contextMenu]);

  // focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const startRename = useCallback(
    (sessionId: string, currentTitle: string) => {
      setRenamingId(sessionId);
      setRenameValue(currentTitle);
      setContextMenu(null);
    },
    [],
  );

  const commitRename = useCallback(() => {
    if (renamingId) {
      const trimmed = renameValue.trim();
      renameSession(renamingId, trimmed || t('terminal.untitled'));
      setRenamingId(null);
    }
  }, [renamingId, renameValue, renameSession, t]);

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
  };

  return (
    <div
      className="shrink-0 h-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col p-2 select-none z-10 relative"
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 mb-1.5 shrink-0">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)] flex items-center gap-1.5">
          <TerminalSquare className="w-4 h-4" />
          <span>
            {t('terminal.sessions')} {sessions.length}
          </span>
        </h4>
        <button
          onClick={() => createSession()}
          className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] p-1 rounded-md transition-colors duration-150"
          title={t('terminal.newSession')}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {sessions.length === 0 ? (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
            {t('terminal.empty')}
          </p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => setActiveSession(session.id)}
              onContextMenu={(e) => handleContextMenu(e, session.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename(session.id, session.title);
              }}
              className={`group flex h-9 items-center justify-between px-2 rounded-md cursor-pointer transition-colors duration-150 ${
                session.id === activeSessionId
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-sideBar-foreground)]'
              }`}
            >
              {renamingId === session.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="flex-1 min-w-0 h-6 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded px-1.5 focus:outline-none"
                  placeholder={t('terminal.renamePlaceholder')}
                />
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <TerminalSquare className="w-4 h-4 opacity-50 shrink-0" />
                    <span className="text-sm truncate">
                      {session.title || t('terminal.untitled')}
                    </span>
                  </div>
                  {/* Quick close button (visible on hover) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-[var(--vscode-foreground)] p-0.5 rounded transition-opacity"
                    title={t('terminal.close')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Context menu (inline) */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] py-1 bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] rounded-md shadow-lg text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const session = sessions.find(
                (s) => s.id === contextMenu.sessionId,
              );
              if (session) startRename(session.id, session.title);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-menu-foreground)] cursor-pointer"
          >
            {t('terminal.rename')}
          </button>
          <button
            onClick={() => {
              closeSession(contextMenu.sessionId);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-errorForeground)] cursor-pointer"
          >
            {t('terminal.close')}
          </button>
        </div>
      )}

      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-20 hover:bg-[var(--vscode-focusBorder)] active:bg-[var(--vscode-focusBorder)] transition-colors"
        style={{ marginRight: '-1px' }}
      />
    </div>
  );
}
