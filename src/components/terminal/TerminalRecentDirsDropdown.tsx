import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, FolderOpen, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';

/**
 * Extract a readable basename from a working directory path.
 */
function getCwdBasename(cwd: string): string {
  if (!cwd || cwd === '~' || cwd === '$HOME') return 'Home';
  const parts = cwd.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || cwd;
}

export interface TerminalRecentDirsDropdownProps {
  /**
   * Controls the direction the dropdown opens.
   * - `'top'`    — the trigger sits at the top of the window (e.g. the title
   *                bar), so the dropdown opens **downward**.
   * - `'bottom'` — the trigger sits at the bottom (e.g. a bottom tab bar),
   *                so the dropdown opens **upward**.
   *
   * @default 'top'
   */
  position?: 'top' | 'bottom';
  /** Class applied to the trigger button element (idle + hover state). */
  buttonClassName?: string;
  /** Extra classes appended to the trigger button while the panel is open. */
  buttonActiveClassName?: string;
  /** Class applied to the clock icon inside the trigger button. */
  iconClassName?: string;
}

/**
 * TerminalRecentDirsDropdown — hover-triggered "recent working directories"
 * dropdown shared by the terminal tab bar and the title-bar history button.
 *
 * Hover the button to reveal a fixed-position panel listing up to 10
 * recently-used working directories; clicking one opens a new terminal
 * session in that directory. Includes a "clear recent" affordance at the
 * bottom.
 *
 * The panel is rendered via `createPortal` to `document.body` so it escapes
 * any `overflow` clipping from ancestor scroll containers.
 */
export default function TerminalRecentDirsDropdown({
  position = 'top',
  buttonClassName = '',
  buttonActiveClassName = '',
  iconClassName = '',
}: TerminalRecentDirsDropdownProps) {
  const { t } = useI18n();
  const recentDirs = useStore((s) => s.recentDirs);
  const createSession = useStore((s) => s.createSession);
  const clearRecentDirs = useStore((s) => s.clearRecentDirs);

  const [showHistory, setShowHistory] = useState(false);
  const [historyPos, setHistoryPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const historyBtnRef = useRef<HTMLButtonElement>(null);
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
      if (position === 'top') {
        // Trigger at top -> dropdown opens below
        setHistoryPos({ x: rect.left, y: rect.bottom + gap });
      } else {
        // Trigger at bottom -> dropdown opens above
        setHistoryPos({ x: rect.left, y: rect.top - gap });
      }
    }
    setShowHistory(true);
  }, [position]);

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
          className={`${buttonClassName} ${showHistory ? buttonActiveClassName : ''}`}
          title={t('terminal.recentDirs')}
        >
          <Clock className={iconClassName} />
        </button>
      </div>

      {showHistory &&
        createPortal(
          <div
            className="fixed z-modal min-w-context max-w-context py-1.5 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl"
            style={
              position === 'top'
                ? { left: historyPos.x, top: `${historyPos.y}px` }
                : { left: historyPos.x, bottom: `calc(100vh - ${historyPos.y}px)` }
            }
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
