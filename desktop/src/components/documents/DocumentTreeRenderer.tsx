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
import type { MutableRefObject } from 'react';
import { NavRow, NavBranch, RailArrow, ActiveTitle } from '../ui/NavTree';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import type { FolderTreeNode } from '../../lib/documents/folderTree';
import type { DocumentMeta, FolderMeta } from '../../types/storage';
import { useI18n } from '../../lib/core/i18n';

// ── Active-document marker: branch guide line + "->" cursor ──
// The ONLY vertical line in the tree is the tree-guide that hangs from an
// expanded folder down its children (the NavBranch's left border, aligned
// with the parent's text indent — Aliyun docs-nav style). Root rows carry
// no line. The ACTIVE document gets NO background highlight — instead an
// accent "->" cursor straddles the guide line (root rows: at the row's
// left edge) plus an accent title (RailArrow / ActiveTitle from NavTree),
// mirroring SectionOutline's marker.

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
  draggingFolderId: string | null;

  /** Swallows the synthetic click after a drag (shared ref with drag hook). */
  suppressClick: MutableRefObject<boolean>;

  // Selection
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  lastClickedId: string | null;
  setLastClickedId: React.Dispatch<React.SetStateAction<string | null>>;
  visibleItemIds: string[];

  // Doc interactions
  activeDocId: string;
  onDocPointerDown: (e: React.PointerEvent, docId: string) => void;
  onFolderPointerDown: (e: React.PointerEvent, folderId: string) => void;
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
  draggingFolderId,
  suppressClick,
  selectedIds,
  setSelectedIds,
  lastClickedId,
  setLastClickedId,
  visibleItemIds,
  activeDocId,
  onDocPointerDown,
  onFolderPointerDown,
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
   * The active document gets the rail-arrow marker (no background).
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
        selected={isSelected}
        noHover
        bleed
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
        ) : isActive ? (
          <>
            <RailArrow />
            <ActiveTitle text={doc.title || t('doclist.untitled')} />
          </>
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
    const isDragging = draggingFolderId === f.id;

    return (
      <div
        key={f.id}
        data-drop-target={f.id}
        // Reserved transparent border for drop feedback instead of
        // ring-inset: WKWebView intermittently fails to paint the full
        // inset box-shadow (missing edges, bug-graveyard #003).
        className={`rounded-md border transition-colors duration-150 ${
          isDropTarget || isFlashing
            ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
            : 'border-transparent'
        } ${isDragging ? 'opacity-40' : ''}`}
      >
        {/* Folder row — bold group-header style (Aliyun docs nav), right
            chevron for expand/collapse, no icon */}
        <NavRow
          level="primary"
          highlighted={false}
          selected={selectedIds.has(f.id)}
          noHover
          bleed
          className={`font-medium ${isDragging ? 'cursor-grabbing' : ''}`}
          onPointerDown={(e) => onFolderPointerDown(e, f.id)}
          onClick={(e) => {
            // Swallow the synthetic click that follows a folder drag —
            // otherwise every drop would also toggle the folder's
            // expand state.
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
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

        {/* Children – the tree-guide line (NavBranch's left border) hangs
            from the parent's text indent down this whole subtree, exactly
            like the Aliyun docs nav. The active child's arrow straddles it. */}
        {open && (
          <NavBranch className="mt-0.5 mb-1 ml-[12px]">
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
        tree.documents.map((doc) => {
          const isActive = doc.id === activeDocId;
          return (
          <NavRow
            key={doc.id}
            level="primary"
            plainActive
            selected={selectedIds.has(doc.id)}
            noHover
            bleed
            onPointerDown={(e) => onDocPointerDown(e, doc.id)}
            onClick={(e) => handleDocClick(e, doc.id)}
            onContextMenu={(e) => handleContextMenu(e, doc.id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startRename(doc.id, doc.title || '');
            }}
            className={
              draggingDocId === doc.id ? 'opacity-40 cursor-grabbing' : ''
            }
          >
            {/* Root-level docs have no guide line to straddle — active state
                is the accent title alone, no "->" cursor. */}
            {isActive ? (
              <ActiveTitle text={doc.title || t('doclist.untitled')} />
            ) : (
              doc.title || t('doclist.untitled')
            )}
          </NavRow>
          );
        })
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
  return filteredDocs.map((doc) => {
    const isActive = doc.id === activeDocId;
    return (
    <NavRow
      key={doc.id}
      level="primary"
      plainActive
      selected={selectedIds.has(doc.id)}
      noHover
      bleed
      onPointerDown={(e) => onDocPointerDown(e, doc.id)}
      onClick={(e) => handleDocClick(e, doc.id)}
      onContextMenu={(e) => handleContextMenu(e, doc.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startRename(doc.id, doc.title || '');
      }}
      className={
        draggingDocId === doc.id ? 'opacity-40 cursor-grabbing' : ''
      }
    >
      {isActive ? (
        <>
          <RailArrow />
          <ActiveTitle text={doc.title || t('doclist.untitled')} />
        </>
      ) : (
        doc.title || t('doclist.untitled')
      )}
    </NavRow>
    );
  });
}
