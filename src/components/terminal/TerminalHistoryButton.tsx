import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, FolderOpen, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';

/**
 * Extract a readable basename from a working directory path.
 * Kept local so this component can live outside `TerminalTabs.tsx`.
 */
function getCwdBasename(cwd: string): string {
  if (!cwd || cwd === '~' || cwd === '$HOME') return 'Home';
  const parts = cwd.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || cwd;
}

/**
 * TerminalHistoryButton — "recent working directories" icon rendered in
 * `AppTitleBar`'s trailing-action slot when the terminal view is active.
 *
 * Hover the button to reveal a dropdown listing up to 10 recently-used
 * working directories; clicking one opens a new terminal session in that
 * directory. Includes a "clear recent" affordance at the bottom.
 *
 * Previously this control lived inside `TerminalTabs` as the `extraActions`
 * slot on `TabBar`. Extracting it lets the title bar host up to three
 * per-view icon slots without every tab component needing to know about
 * them.
 */
export default function TerminalHistoryButton() {
  const { t } = useI18n();
  const recentDirs = useStore((s) => s.recentDirs);
  const createSession = useStore((s) => s.createSession);
  const clearRecentDirs = useStore((s) => s.clearRecentDirs);

  const [showHistory, setShowHistory] = useState(false);
  const [historyPos, setHistoryPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const historyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (historyCloseTimer.current) clearTimeout(historyCloseTimer.current);
    };
  }, []);

  const openHistory = useCallback(() => {
    if (historyCloseTimer.current) {
      clearTimeout(historyCloseTimer.current);
      historyCloseTimer.current = null;
    }
    if (historyBtnRef.current) {
      const rect = historyBtnRef.current.getBoundingClientRect();
      const gap = 4;
      // The title bar always sits at the top of the window, so the dropdown
      // opens downward.
      setHistoryPos({ x: rect.left, y: rect.bottom + gap });
    }
    setShowHistory(true);
  }, []);

  const scheduleCloseHistory = useCallback(() => {
    if (historyCloseTimer.current) clearTimeout(historyCloseTimer.current);
    historyCloseTimer.current = setTimeout(() => setShowHistory(false), 200);
  }, []);

  const handlePickRecentDir = useCallback(
    (cwd: string) => {
      createSession(undefined, { cwd });
      setShowHistory(false);
    },
    [createSession]
  );

  return (
    <>
      <div
        className="relative shrink-0"
        onMouseEnter={openHistory}
        onMouseLeave={scheduleCloseHistory}
      >
        <button
          ref={historyBtnRef}
          type="button"
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors duration-75 cursor-pointer text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-foreground)] ${
            showHistory
              ? 'opacity-100 bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]'
              : 'opacity-80 hover:opacity-100'
          }`}
          title={t('terminal.recentDirs')}
        >
          <Clock className="w-4 h-4" />
        </button>
      </div>

      {showHistory &&
        createPortal(
          <div
            ref={historyRef}
            className="fixed z-modal min-w-context max-w-context py-1.5 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl"
            style={{ left: historyPos.x, top: `${historyPos.y}px` }}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => {
              if (historyCloseTimer.current) {
                clearTimeout(historyCloseTimer.current);
                historyCloseTimer.current = null;
              }
            }}
            onMouseLeave={scheduleCloseHistory}
          >
            {recentDirs.length === 0 ? (
              <div className="px-3 py-3 text-center text-[var(--vscode-descriptionForeground)] text-xs">
                {t('terminal.noRecentDirs')}
              </div>
            ) : (
              <>
                <div className="px-3 pb-1.5 text-tiny font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
                  {t('terminal.recentDirs')}
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {recentDirs.map((dir) => {
                    const basename = getCwdBasename(dir);
                    const parentPath = dir.replace(/\/[^/]*$/, '');
                    return (
                      <button
                        key={dir}
                        onClick={() => handlePickRecentDir(dir)}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer hover:bg-[var(--vscode-menu-hoverBackground)] group"
                      >
                        <FolderOpen className="w-3.5 h-3.5 opacity-50 group-hover:opacity-80 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[var(--vscode-menu-foreground)] truncate">
                            {basename}
                          </div>
                          {parentPath && parentPath !== dir && (
                            <div className="text-tiny text-[var(--vscode-descriptionForeground)] truncate font-mono leading-tight">
                              {parentPath}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="my-1 border-t border-[var(--vscode-menu-border)] opacity-50" />
                <button
                  onClick={() => {
                    clearRecentDirs();
                    setShowHistory(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-menu-hoverBackground)]"
                >
                  <Trash2 className="w-3.5 h-3.5 opacity-70 shrink-0" />
                  <span className="text-xs">{t('terminal.clearRecent')}</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
