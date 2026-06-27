import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/i18n';
import { createDocumentWindow } from '../../lib/windows/documentDetach';
import { Plus, X, FileText, ExternalLink } from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
import type { UnifiedTab } from '../../store/workspaceSlice';

/**
 * DocumentTabs — tab bar for document tabs only.
 *
 * Terminal tabs have their own tab bar inside TerminalPanel/TerminalTabs.
 * Both share the same workspace state (workspaceSlice), so the global
 * cycle shortcut (Cmd+Option+←/→) can jump between document and terminal
 * tabs.
 *
 * Features:
 *   - Click tab → switch to that document
 *   - Close button (X) on each tab (hidden when only 1 remains)
 *   - Right-click → context menu (Detach / Close / Close Others)
 *   - Drag a tab outside → tear off into a new OS window
 *   - `+` button → new document
 */
export default function DocumentTabs() {
  const { t } = useI18n();
  const allTabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const closeOtherTabs = useStore((s) => s.closeOtherTabs);
  const docList = useStore((s) => s.docList);
  const createDocument = useStore((s) => s.createDocument);

  // Filter to document tabs only.
  const docTabs = allTabs.filter((tab) => tab.kind === 'document');

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

  // Drag tear-off state
  const dragTab = useRef<UnifiedTab | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    title: string;
    outside: boolean;
  } | null>(null);

  // ── Scroll active tab into view ──────────────────────────────────
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTabId]);

  // ── Close context menu on outside click ─────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    requestAnimationFrame(() => {
      window.addEventListener('click', handler);
    });
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // ── Resolve document title ───────────────────────────────────────
  const getDocTitle = useCallback(
    (tab: UnifiedTab): string => {
      const meta = docList.find((d) => d.id === tab.docId);
      return meta?.title || t('doclist.untitled');
    },
    [docList, t],
  );

  // ── Tab tear-off drag handlers ───────────────────────────────────
  const isOutsideTabBar = useCallback((clientX: number, clientY: number) => {
    const bar = tabBarRef.current;
    if (!bar) return false;
    const r = bar.getBoundingClientRect();
    return (
      clientX < r.left ||
      clientX > r.right ||
      clientY < r.top ||
      clientY > r.bottom
    );
  }, []);

  const handleTabDragStart = useCallback(
    (e: React.DragEvent, tab: UnifiedTab) => {
      if (allTabs.length < 2) {
        e.preventDefault();
        return;
      }
      dragTab.current = tab;
      e.dataTransfer.effectAllowed = 'move';
      const img = new Image();
      img.src =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      e.dataTransfer.setDragImage(img, 0, 0);
    },
    [allTabs.length],
  );

  const handleTabDrag = useCallback(
    (e: React.DragEvent, title: string) => {
      if (e.clientX === 0 && e.clientY === 0) return;
      const outside = isOutsideTabBar(e.clientX, e.clientY);
      setGhost({ x: e.clientX, y: e.clientY, title, outside });
    },
    [isOutsideTabBar],
  );

  const handleTabDragEnd = useCallback(
    (e: React.DragEvent) => {
      const tab = dragTab.current;
      dragTab.current = null;
      setGhost(null);

      if (!tab) return;
      if (e.clientX === 0 && e.clientY === 0) return;

      if (isOutsideTabBar(e.clientX, e.clientY) && tab.docId) {
        createDocumentWindow(tab.docId, tab.id, { x: e.screenX, y: e.screenY });
      }
    },
    [isOutsideTabBar],
  );

  const handleDetach = useCallback((tab: UnifiedTab) => {
    if (tab.docId) createDocumentWindow(tab.docId, tab.id);
  }, []);

  // Don't render if there are no document tabs.
  if (docTabs.length === 0) return null;

  return (
    <>
      <div
        ref={tabBarRef}
        className="shrink-0 flex items-stretch h-9 border-b border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] relative"
      >
        <div
          ref={scrollRef}
          className="flex items-stretch overflow-x-auto flex-1 min-w-0"
          style={{ scrollbarWidth: 'none' }}
        >
          {docTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const title = getDocTitle(tab);

            return (
              <div
                key={tab.id}
                ref={isActive ? activeTabRef : null}
                draggable={allTabs.length > 1}
                onDragStart={(e) => handleTabDragStart(e, tab)}
                onDrag={(e) => handleTabDrag(e, title)}
                onDragEnd={handleTabDragEnd}
                onClick={() => setActiveTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                }}
                className={`group relative flex items-center gap-1.5 pl-3 pr-2 w-[140px] cursor-pointer border-r border-[var(--vscode-sideBar-border)] shrink-0 transition-colors duration-100 ${
                  isActive
                    ? 'bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]'
                    : 'bg-transparent text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-foreground)]'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--vscode-focusBorder)]" />
                )}

                <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="text-xs font-medium flex-1 min-w-0 truncate">
                  {title}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={`shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all duration-100 hover:bg-[var(--vscode-toolbar-hoverBackground)] ${
                    isActive
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {/* `+` button — new document */}
          <button
            onClick={() => createDocument()}
            className="shrink-0 w-9 flex items-center justify-center text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer"
            title={t('doclist.newDocument')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <MenuList x={contextMenu.x} y={contextMenu.y} onClick={(e) => e.stopPropagation()}>
          {allTabs.length > 1 && (
            <>
              <MenuItem
                icon={<ExternalLink className="w-4 h-4" />}
                onClick={() => {
                  const tab = allTabs.find((tt) => tt.id === contextMenu.tabId);
                  if (tab) handleDetach(tab);
                  setContextMenu(null);
                }}
              >
                {t('workspace.detachToWindow')}
              </MenuItem>
              <MenuDivider />
            </>
          )}
          <MenuItem
            icon={<X className="w-4 h-4" />}
            onClick={() => {
              closeTab(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            {t('workspace.closeTab')}
          </MenuItem>
          {docTabs.length > 1 && (
            <MenuItem
              onClick={() => {
                closeOtherTabs(contextMenu.tabId);
                setContextMenu(null);
              }}
            >
              {t('workspace.closeOthers')}
            </MenuItem>
          )}
        </MenuList>
      )}

      {/* Drag ghost */}
      {ghost &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none select-none"
            style={{ left: ghost.x + 12, top: ghost.y + 12 }}
          >
            <div
              className={`flex flex-col gap-0.5 px-3 py-2 rounded-md shadow-2xl border text-xs font-medium transition-colors ${
                ghost.outside
                  ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]'
                  : 'border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] text-[var(--vscode-descriptionForeground)]'
              }`}
            >
              <span className="max-w-[200px] truncate">{ghost.title}</span>
              {ghost.outside && (
                <span className="text-[10px] text-[var(--vscode-focusBorder)]">
                  {t('workspace.releaseToDetach')}
                </span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
