/**
 * SidebarHeaderButtons — 侧边栏标题栏三个图标（搜索/固定/更多）。
 *
 * 渲染在侧边栏内部的 header 行（版本标签右侧）——普通点击，
 * 与窗口拖拽区域完全无关（此前放标题栏时被原生 draggable-region
 * 吞掉点击的问题随 placement 一起消失）。
 */

import { useState, useRef, useCallback } from 'react';
import { MoreHorizontal, Pin, Search } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { bindingToDisplay, resolveBinding } from '../../lib/shortcuts/keyboardShortcuts';
import { useDocSidebarActions } from './hooks/useDocSidebarActions';
import DocumentSidebarMoreMenu from './DocumentSidebarMoreMenu';
import TrashDialog from './TrashDialog';

export default function SidebarHeaderButtons() {
  const { t } = useI18n();

  const setGlobalSearchOpen = useStore((s) => s.setGlobalSearchOpen);
  const keyboardShortcuts  = useStore((s) => s.keyboardShortcuts);
  const sidebarPinMode     = useStore((s) => s.sidebarPinMode);
  const setSidebarPinMode  = useStore((s) => s.setSidebarPinMode);
  const docSortKey         = useStore((s) => s.docSortKey);
  const docSortDirection   = useStore((s) => s.docSortDirection);
  const setDocSortKey      = useStore((s) => s.setDocSortKey);
  const setDocSortDirection = useStore((s) => s.setDocSortDirection);
  const createDocument     = useStore((s) => s.createDocument);
  const createFolder       = useStore((s) => s.createFolder);
  const addToast           = useStore((s) => s.addToast);
  const importDocumentFromMarkdown  = useStore((s) => s.importDocumentFromMarkdown);
  const importMarkdownDirectory     = useStore((s) => s.importMarkdownDirectory);
  const syncMarkdownDirectory       = useStore((s) => s.syncMarkdownDirectory);
  const exportDocumentBundle        = useStore((s) => s.exportDocumentBundle);
  const importDocumentBundle        = useStore((s) => s.importDocumentBundle);
  const exportDocumentHtml          = useStore((s) => s.exportDocumentHtml);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [moreMenuPos, setMoreMenuPos]   = useState<{ x: number; y: number } | null>(null);
  const moreMenuRef  = useRef<HTMLDivElement>(null);
  const closeTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPinLocked = sidebarPinMode !== 'hover';

  const handleTogglePin = useCallback(() => {
    if (isPinLocked) {
      setSidebarPinMode('hover');
    } else {
      setSidebarPinMode('open');
    }
  }, [isPinLocked, setSidebarPinMode]);

  const capturePos = useCallback(() => {
    if (moreMenuRef.current) {
      const r = moreMenuRef.current.getBoundingClientRect();
      setMoreMenuPos({ x: r.left, y: r.bottom + 4 });
    }
  }, []);

  const openMenu = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    capturePos();
    setMoreMenuOpen(true);
  }, [capturePos]);

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMoreMenuOpen(false), 150);
  }, []);

  const { handleImportMarkdown, handleImportMarkdownDirectory, handleSyncMarkdownDirectory, handleImportBundle } =
    useDocSidebarActions({
      importDocumentFromMarkdown,
      importMarkdownDirectory,
      syncMarkdownDirectory,
      exportDocumentBundle,
      importDocumentBundle,
      exportDocumentHtml,
      addToast,
      setContextMenu: () => {},
      t,
    });

  const globalSearchBinding = bindingToDisplay(resolveBinding('app.globalSearch', keyboardShortcuts));

  return (
    <div className="flex items-center gap-0.5 h-9">
      {/* Search */}
      <button
        onClick={() => setGlobalSearchOpen(true)}
        className="p-1 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
        title={globalSearchBinding ? `${t('shortcut.app.globalSearch')} · ${globalSearchBinding}` : t('shortcut.app.globalSearch')}
      >
        <Search className="w-4 h-4" />
      </button>

      {/* Pin */}
      <button
        onClick={handleTogglePin}
        className={`p-1 rounded-md transition-colors duration-150 cursor-pointer ${
          isPinLocked
            ? 'text-[var(--vscode-focusBorder)] hover:bg-[var(--vscode-list-hoverBackground)]'
            : 'text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
        }`}
        title={isPinLocked ? t('doclist.unpin') : t('doclist.pin')}
      >
        <Pin className="w-4 h-4" />
      </button>

      {/* More */}
      <div ref={moreMenuRef} onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
        <button
          onClick={() => { capturePos(); setMoreMenuOpen((v) => !v); }}
          className="cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] p-1 rounded-md transition-colors duration-150"
          title={t('doclist.moreActions')}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {moreMenuOpen && moreMenuPos && (
          <DocumentSidebarMoreMenu
            x={moreMenuPos.x}
            y={moreMenuPos.y}
            docSortKey={docSortKey}
            docSortDirection={docSortDirection}
            onClose={() => setMoreMenuOpen(false)}
            onNewDocument={() => createDocument()}
            onNewFolder={() => createFolder(t('doclist.untitledFolder'), null)}
            onImportMarkdown={handleImportMarkdown}
            onImportMarkdownDirectory={handleImportMarkdownDirectory}
            onSyncMarkdownDirectory={handleSyncMarkdownDirectory}
            onImportBundle={handleImportBundle}
            onSetSortKey={setDocSortKey}
            onSetSortDirection={setDocSortDirection}
            onOpenTrash={() => setTrashOpen(true)}
          />
        )}
      </div>
      <TrashDialog open={trashOpen} onClose={() => setTrashOpen(false)} />
    </div>
  );
}
