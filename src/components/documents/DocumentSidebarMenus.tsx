/**
 * DocumentSidebarMenus - 三个小型浮动菜单组件。
 *
 *   - FolderContextMenu : 文件夹右键菜单（新建/重命名/导入/删除）
 *   - BatchContextMenu  : 多选右键菜单（移动/删除）
 *   - BatchMoveMenu     : 批量移动到文件夹的级联菜单
 *
 * 每个组件只负责渲染 MenuList；位置和所有回调由父组件通过 props 传入。
 */

import {
  FileText,
  FolderPlus,
  FolderInput,
  FileDown,
  FolderDown,
  Trash2,
  Folder,
} from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
import { useI18n } from '../../lib/core/i18n';
import type { FolderMeta } from '../../types/storage';

// ── FolderContextMenu ─────────────────────────────────────

export interface FolderContextMenuProps {
  /** Screen coordinates where the menu should appear */
  x: number;
  y: number;
  /** The folder id this menu was opened for */
  folderId: string;
  /** Create a new document inside this folder */
  onNewDocument: (folderId: string) => void;
  /** Create a subfolder inside this folder */
  onCreateSubfolder: (folderId: string) => void;
  /** Rename this folder (parent looks up the folder by id) */
  onRenameFolder: (folderId: string) => void;
  /** Import a Markdown file into this folder */
  onImportMarkdown: (folderId: string) => void;
  /** Import a directory of Markdown into this folder */
  onImportMarkdownDirectory: (folderId: string) => void;
  /** Move this folder to trash */
  onDeleteFolder: (folderId: string) => void;
  /** Close the menu */
  onClose: () => void;
}

export function FolderContextMenu({
  x,
  y,
  folderId,
  onNewDocument,
  onCreateSubfolder,
  onRenameFolder,
  onImportMarkdown,
  onImportMarkdownDirectory,
  onDeleteFolder,
  onClose,
}: FolderContextMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <MenuItem
        icon={<FileText />}
        onClick={() => {
          onNewDocument(folderId);
          onClose();
        }}
      >
        {t('doclist.newDocument')}
      </MenuItem>
      <MenuDivider />
      <MenuItem
        icon={<FolderPlus />}
        onClick={() => onCreateSubfolder(folderId)}
      >
        {t('doclist.newSubfolder')}
      </MenuItem>
      <MenuItem
        icon={<FolderInput />}
        onClick={() => onRenameFolder(folderId)}
      >
        {t('doclist.renameFolder')}
      </MenuItem>
      <MenuDivider />
      <MenuItem
        icon={<FileDown />}
        onClick={() => {
          onImportMarkdown(folderId);
          onClose();
        }}
      >
        {t('doclist.importMarkdown')}
      </MenuItem>
      <MenuItem
        icon={<FolderDown />}
        onClick={() => {
          onImportMarkdownDirectory(folderId);
          onClose();
        }}
      >
        {t('doclist.importDirectory')}
      </MenuItem>
      <MenuDivider />
      <MenuItem
        variant="danger"
        icon={<Trash2 />}
        onClick={() => onDeleteFolder(folderId)}
      >
        {t('doclist.moveToTrash')}
      </MenuItem>
    </MenuList>
  );
}

// ── BatchContextMenu ──────────────────────────────────────

export interface BatchContextMenuProps {
  /** Screen coordinates where the menu should appear */
  x: number;
  y: number;
  /** Move selection to a folder (opens the batch-move menu) */
  onMoveTo: () => void;
  /** Delete all selected documents */
  onDelete: () => void;
  /** Close the menu */
  onClose: () => void;
}

export function BatchContextMenu({
  x,
  y,
  onMoveTo,
  onDelete,
  onClose,
}: BatchContextMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <MenuItem
        icon={<FolderInput />}
        onClick={() => {
          onMoveTo();
          onClose();
        }}
      >
        {t('doclist.batchMove')}
      </MenuItem>
      <MenuDivider />
      <MenuItem
        variant="danger"
        icon={<Trash2 />}
        onClick={() => {
          onDelete();
          onClose();
        }}
      >
        {t('doclist.batchMoveToTrash')}
      </MenuItem>
    </MenuList>
  );
}

// ── BatchMoveMenu ─────────────────────────────────────────

export interface BatchMoveMenuProps {
  /** Screen coordinates where the menu should appear */
  x: number;
  y: number;
  /** All folders available as move targets */
  folders: FolderMeta[];
  /** Move selected docs to a folder (null = root level) */
  onMove: (folderId: string | null) => void;
  /** Close the menu */
  onClose: () => void;
}

export function BatchMoveMenu({
  x,
  y,
  folders,
  onMove,
  onClose,
}: BatchMoveMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList
      x={x}
      y={y}
      onClick={(e) => e.stopPropagation()}
      className="max-h-64 overflow-y-auto"
    >
      <MenuItem
        icon={<FileText className="w-4 h-4" />}
        onClick={() => {
          onMove(null);
          onClose();
        }}
      >
        {t('doclist.rootLevel')}
      </MenuItem>
      {folders.length > 0 && <MenuDivider />}
      {folders.map((f) => (
        <MenuItem
          key={f.id}
          icon={<Folder className="w-4 h-4" />}
          onClick={() => {
            onMove(f.id);
            onClose();
          }}
        >
          {f.name}
        </MenuItem>
      ))}
    </MenuList>
  );
}
