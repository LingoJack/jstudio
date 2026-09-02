/**
 * DocumentSidebarMoreMenu - 侧边栏标题栏「更多」下拉菜单。
 *
 * 包含 New / Import / Sort / Trash 四组菜单项。菜单本身只是一个 MenuList，
 * 位置和所有回调由父组件通过 props 传入。
 */

import {
  Plus,
  FolderPlus,
  FileDown,
  FolderDown,
  PackageOpen,
  ArrowDownUp,
  Check,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { MenuList, MenuItem, MenuDivider, SubMenu } from '../ui/MenuList';
import { useI18n } from '../../lib/core/i18n';
import type { DocSortKey, DocSortDirection } from '../../lib/documents/sortUtils';

export interface DocumentSidebarMoreMenuProps {
  /** Screen coordinates where the menu should appear */
  x: number;
  y: number;
  /** Current sort key (for checkmark indicator) */
  docSortKey: DocSortKey;
  /** Current sort direction (for checkmark indicator) */
  docSortDirection: DocSortDirection;
  /** Close the menu (called after selecting an action item) */
  onClose: () => void;
  /** Create a new document */
  onNewDocument: () => void;
  /** Create a new folder */
  onNewFolder: () => void;
  /** Import a single Markdown file */
  onImportMarkdown: () => void;
  /** Import a directory of Markdown files */
  onImportMarkdownDirectory: () => void;
  /** Sync a directory of Markdown files (skip already-imported names) */
  onSyncMarkdownDirectory: () => void;
  /** Import a .jnote backup bundle */
  onImportBundle: () => void;
  /** Change the sort key (does NOT close the menu) */
  onSetSortKey: (key: DocSortKey) => void;
  /** Change the sort direction (does NOT close the menu) */
  onSetSortDirection: (dir: DocSortDirection) => void;
  /** Open the trash dialog */
  onOpenTrash: () => void;
}

export default function DocumentSidebarMoreMenu({
  x,
  y,
  docSortKey,
  docSortDirection,
  onClose,
  onNewDocument,
  onNewFolder,
  onImportMarkdown,
  onImportMarkdownDirectory,
  onSyncMarkdownDirectory,
  onImportBundle,
  onSetSortKey,
  onSetSortDirection,
  onOpenTrash,
}: DocumentSidebarMoreMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <SubMenu label={t('doclist.new')} icon={<Plus />}>
        <MenuItem
          icon={<Plus />}
          onClick={() => {
            onClose();
            onNewDocument();
          }}
        >
          {t('doclist.newDocument')}
        </MenuItem>
        <MenuItem
          icon={<FolderPlus />}
          onClick={() => {
            onClose();
            onNewFolder();
          }}
        >
          {t('doclist.newFolder')}
        </MenuItem>
      </SubMenu>
      <SubMenu label={t('doclist.import')} icon={<FileDown />}>
        <MenuItem
          icon={<FileDown />}
          onClick={() => {
            onClose();
            onImportMarkdown();
          }}
        >
          {t('doclist.importMarkdown')}
        </MenuItem>
        <MenuItem
          icon={<FolderDown />}
          onClick={() => {
            onClose();
            onImportMarkdownDirectory();
          }}
        >
          {t('doclist.importDirectory')}
        </MenuItem>
        <MenuItem
          icon={<RefreshCw />}
          onClick={() => {
            onClose();
            onSyncMarkdownDirectory();
          }}
        >
          {t('doclist.syncDirectory')}
        </MenuItem>
        <MenuItem
          icon={<PackageOpen />}
          onClick={() => {
            onClose();
            onImportBundle();
          }}
        >
          {t('doclist.importBundle')}
        </MenuItem>
      </SubMenu>
      <MenuDivider />
      {/* ── Sort settings (nested submenu) ── */}
      <SubMenu
        label={t('doclist.sortBy')}
        icon={<ArrowDownUp />}
      >
        <MenuItem
          icon={docSortKey === 'created' ? <Check /> : <span className="w-4 h-4" />}
          onClick={() => {
            onSetSortKey('created');
          }}
        >
          {t('doclist.sortByCreated')}
        </MenuItem>
        <MenuItem
          icon={docSortKey === 'title' ? <Check /> : <span className="w-4 h-4" />}
          onClick={() => {
            onSetSortKey('title');
          }}
        >
          {t('doclist.sortByTitle')}
        </MenuItem>
        <MenuDivider />
        <MenuItem
          icon={docSortDirection === 'asc' ? <ArrowUpNarrowWide /> : <span className="w-4 h-4" />}
          onClick={() => {
            onSetSortDirection('asc');
          }}
        >
          {t('doclist.sortAscending')}
        </MenuItem>
        <MenuItem
          icon={docSortDirection === 'desc' ? <ArrowDownWideNarrow /> : <span className="w-4 h-4" />}
          onClick={() => {
            onSetSortDirection('desc');
          }}
        >
          {t('doclist.sortDescending')}
        </MenuItem>
      </SubMenu>
      <MenuDivider />
      <MenuItem
        icon={<Trash2 />}
        onClick={() => {
          onClose();
          onOpenTrash();
        }}
      >
        {t('doclist.trash')}
      </MenuItem>
    </MenuList>
  );
}
