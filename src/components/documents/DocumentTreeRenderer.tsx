/**
 * DocumentTreeRenderer - 文件夹树渲染组件。
 *
 * 从 DocumentSidebar 提取的 renderDoc / renderNode 函数，负责渲染：
 *   - 文件夹节点（递归，含子文件夹和文档）
 *   - 根级文档（或空状态提示）
 *
 * SearchResultsList - 搜索结果列表组件（flat 列表，无缩进）。
 *
 * 两个组件只负责渲染；所有状态和回调由父组件通过 props 传入。
 */

import type React from 'react';
import { FileText, Folder, FolderOpen } from 'lucide-react';
import { NavRow, NavBranch } from '../ui/NavTree';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import type { FolderTreeNode } from '../../lib/documents/folderTree';
import type { DocumentMeta, FolderMeta } from '../../types/storage';
import { useI18n } from '../../lib/core/i18n';

// ── DocumentTreeRenderer ─────────────────────────────────

export interface DocumentTreeRendererProps {
  tree: FolderTreeNode;
  folders: FolderMeta[];

  // Folder expand state
  isFolderExpanded: (folderId: string) => boolean;
  handleToggleFolder: (folderId: string) => void;

  // Drag state
  dragOverTarget: string | null;
  flashFolderId: string | null;
  draggingDocId: string | null;

  // Selection
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  lastClickedId: string | null;
  setLastClickedId: React.Dispatch<React.SetStateAction<string | null>>;
  visibleItemIds: string[];

  // Doc interactions
  activeDocId: string;
  onDocPointerDown: (e: React.PointerEvent, docId: string) => void;
  handleDocClick: (e: React.MouseEvent, docId: string) => void;
  handleContextMenu: (e: React.MouseEvent, id: string, kind?: 'doc' | 'folder') => void;

  // Doc rename
  renamingId: string | null;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  renameValue: string;
  setRenameValue: React.Dispatch<React.SetStateAction<string>>;
  commitRename: () => void;
  setRenamingId: React.Dispatch<React.SetStateAction<string | null>>;
  startRename: (docId: string, title: string) => void;

  // Folder rename
  renamingFolderId: string | null;
  folderRenameRef: React.RefObject<HTMLInputElement | null>;
  folderRenameValue: string;
  setFolderRenameValue: React.Dispatch<React.SetStateAction<string>>;
  commitFolderRename: () => void;
  setRenamingFolderId: React.Dispatch<React.SetStateAction<string | null>>;
  startFolderRename: (folderId: string, name: string) => void;
}

export function DocumentTreeRenderer({
  tree,
  folders,
  isFolderExpanded,
  handleToggleFolder,
  dragOverTarget,
  flashFolderId,
  draggingDocId,
  selectedIds,
  setSelectedIds,
  lastClickedId,
  setLastClickedId,
  visibleItemIds,
  activeDocId,
  onDocPointerDown,
  handleDocClick,
  handleContextMenu,
  renamingId,
  renameInputRef,
  renameValue,
  setRenameValue,
  commitRename,
  setRenamingId,
  startRename,
  renamingFolderId,
  folderRenameRef,
  folderRenameValue,
  setFolderRenameValue,
  commitFolderRename,
  setRenamingFolderId,
  startFolderRename,
}: DocumentTreeRendererProps) {
  const { t } = useI18n();

  // ── Render helpers ────────────────────────────────────────

  /**
   * Render a single document row inside the folder tree.
   * Uses NavRow (secondary level) so it matches Settings sub-items.
   */
  const renderDoc = (doc: DocumentMeta) => {
    const isActive = doc.id === activeDocId;
    const isDragging = draggingDocId === doc.id;
    const isRenaming = renamingId === doc.id;
    const isSelected = selectedIds.has(doc.id);

    return (
      <NavRow
        key={doc.id}
        level="secondary"
        active={isActive}
        selected={isSelected}
        noHover
        icon={<FileText className="w-4 h-4 opacity-50 shrink-0" />}
        onPointerDown={(e) => onDocPointerDown(e, doc.id)}
        onClick={(e) => handleDocClick(e, doc.id)}
        onContextMenu={(e) => handleContextMenu(e, doc.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename(doc.id, doc.title || '');
        }}
        style={{ opacity: isDragging ? 0.4 : undefined }}
        className={isDragging ? 'cursor-grabbing' : ''}
      >
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (handleNativeSelectAll(e)) return;
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            className="w-full h-6 text-body bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded px-1.5 focus:outline-none"
            placeholder={t('doclist.renamePlaceholder')}
          />
        ) : (
          doc.title || t('doclist.untitled')
        )}
      </NavRow>
    );
  };

  /**
   * Recursively render a folder node and its children.
   *
   * The folder row itself is a NavRow (can show drop highlight).
   * Its children are wrapped in a plain NavBranch (indentation only).
   */
  const renderNode = (node: FolderTreeNode, depth: number): React.ReactNode => {
    if (!node.folder) return null;
    const f = node.folder;
    const open = isFolderExpanded(f.id);
    const isDropTarget = dragOverTarget === f.id;
    const isFlashing = flashFolderId === f.id;
    const isRenaming = renamingFolderId === f.id;

    return (
      <div
        key={f.id}
        data-drop-target={f.id}
        // Reserved transparent border instead of ring-inset: WKWebView
        // intermittently fails to paint the full inset box-shadow (missing
        // bottom/right edges). A real border always paints atomically.
        className={`rounded-md border transition-colors duration-150 ${
          isDropTarget || isFlashing
            ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
            : 'border-transparent'
        }`}
      >
        {/* Folder row */}
        <NavRow
          level="primary"
          highlighted={false}
          selected={selectedIds.has(f.id)}
          noHover
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) {
              // Toggle selection
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(f.id)) next.delete(f.id);
                else next.add(f.id);
                return next;
              });
              setLastClickedId(f.id);
            } else if (e.shiftKey && lastClickedId) {
              const start = visibleItemIds.indexOf(lastClickedId);
              const end = visibleItemIds.indexOf(f.id);
              if (start !== -1 && end !== -1) {
                const lo = Math.min(start, end);
                const hi = Math.max(start, end);
                setSelectedIds(new Set(visibleItemIds.slice(lo, hi + 1)));
              }
              setLastClickedId(f.id);
            } else {
              // Plain click: if there's a selection, clear it (don't toggle)
              if (selectedIds.size > 0) {
                setSelectedIds(new Set());
              } else {
                handleToggleFolder(f.id);
              }
              setLastClickedId(f.id);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, f.id, 'folder')}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startFolderRename(f.id, f.name);
          }}
          icon={open
            ? <FolderOpen className="w-5 h-5 opacity-70 shrink-0" />
            : <Folder className="w-5 h-5 opacity-70 shrink-0" />
          }
          expandable={!isRenaming}
          expanded={open}
        >
          {isRenaming ? (
            <input
              ref={folderRenameRef}
              type="text"
              value={folderRenameValue}
              onChange={(e) => setFolderRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitFolderRename}
              onKeyDown={(e) => {
                if (handleNativeSelectAll(e)) return;
                if (e.key === 'Enter') commitFolderRename();
                if (e.key === 'Escape') setRenamingFolderId(null);
              }}
              className="w-full h-6 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] text-[var(--vscode-input-foreground)] rounded px-1.5 focus:outline-none"
              placeholder={t('doclist.folderNamePlaceholder')}
            />
          ) : (
            f.name
          )}
        </NavRow>

        {/* Children – indentation only, no guide line */}
        {open && (
          <NavBranch plain className="mt-0.5 mb-1 ml-[18px]">
            {node.subFolders.map((sub) => renderNode(sub, depth + 1))}
            {node.documents.map((doc) => renderDoc(doc))}
          </NavBranch>
        )}
      </div>
    );
  };

  const rootDocCount = tree.documents.length;

  return (
    <>
      {tree.subFolders.map((node) => renderNode(node, 0))}
      {rootDocCount === 0 && folders.length === 0 ? (
        <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
          {t('doclist.noMatch')}
        </p>
      ) : (
        tree.documents.map((doc) => (
          <NavRow
            key={doc.id}
            level="primary"
            plainActive
            active={doc.id === activeDocId}
            selected={selectedIds.has(doc.id)}
            noHover
            icon={<FileText className="w-5 h-5 opacity-70 shrink-0" />}
            onPointerDown={(e) => onDocPointerDown(e, doc.id)}
            onClick={(e) => handleDocClick(e, doc.id)}
            onContextMenu={(e) => handleContextMenu(e, doc.id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startRename(doc.id, doc.title || '');
            }}
            className={draggingDocId === doc.id ? 'opacity-40 cursor-grabbing' : ''}
          >
            {doc.title || t('doclist.untitled')}
          </NavRow>
        ))
      )}
    </>
  );
}

// ── SearchResultsList ────────────────────────────────────

export interface SearchResultsListProps {
  filteredDocs: DocumentMeta[];
  activeDocId: string;
  selectedIds: Set<string>;
  draggingDocId: string | null;
  onDocPointerDown: (e: React.PointerEvent, docId: string) => void;
  handleDocClick: (e: React.MouseEvent, docId: string) => void;
  handleContextMenu: (e: React.MouseEvent, id: string, kind?: 'doc' | 'folder') => void;
  startRename: (docId: string, title: string) => void;
}

export function SearchResultsList({
  filteredDocs,
  activeDocId,
  selectedIds,
  draggingDocId,
  onDocPointerDown,
  handleDocClick,
  handleContextMenu,
  startRename,
}: SearchResultsListProps) {
  const { t } = useI18n();

  if (filteredDocs.length === 0) {
    return (
      <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
        {t('doclist.noMatch')}
      </p>
    );
  }
  return filteredDocs.map((doc) => (
    <NavRow
      key={doc.id}
      level="primary"
      plainActive
      active={doc.id === activeDocId}
      selected={selectedIds.has(doc.id)}
      noHover
      icon={<FileText className="w-5 h-5 opacity-70 shrink-0" />}
      onPointerDown={(e) => onDocPointerDown(e, doc.id)}
      onClick={(e) => handleDocClick(e, doc.id)}
      onContextMenu={(e) => handleContextMenu(e, doc.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startRename(doc.id, doc.title || '');
      }}
      className={draggingDocId === doc.id ? 'opacity-40 cursor-grabbing' : ''}
    >
      {doc.title || t('doclist.untitled')}
    </NavRow>
  ));
}
