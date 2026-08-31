import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, RotateCcw, X, Folder, FileText, Paperclip } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { IconButton } from '../ui/IconButton';
import { useDialogTransition } from '../ui/useDialogTransition';
import { formatFileSize } from '../../lib/editor/fileUtils';

interface TrashDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function TrashDialog({ open, onClose }: TrashDialogProps) {
  const { t } = useI18n();
  const transition = useDialogTransition(open);

  const trashedDocList = useStore((s) => s.trashedDocList);
  const trashedFolders = useStore((s) => s.trashedFolders);
  const trashedAssets = useStore((s) => s.trashedAssets);
  const docList = useStore((s) => s.docList);
  const restoreDocument = useStore((s) => s.restoreDocument);
  const restoreFolder = useStore((s) => s.restoreFolder);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const restoreTrashedAsset = useStore((s) => s.restoreTrashedAsset);
  const deleteTrashedAsset = useStore((s) => s.deleteTrashedAsset);
  const emptyTrash = useStore((s) => s.emptyTrash);
  const emptyTrashFolders = useStore((s) => s.emptyTrashFolders);
  const emptyTrashAssets = useStore((s) => s.emptyTrashAssets);

  // ── Esc to close ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (transition === 'closed') return null;

  const totalCount =
    trashedDocList.length + trashedFolders.length + trashedAssets.length;

  /** Resolve a document title for an asset's source doc (may be active or trashed). */
  const docTitleFor = (docId: string): string => {
    const meta =
      docList.find((d) => d.id === docId) ??
      trashedDocList.find((d) => d.id === docId);
    return meta?.title || t('doclist.untitled');
  };

  const handleRestoreDoc = (id: string) => {
    restoreDocument(id);
  };

  const handleRestoreFolder = (id: string) => {
    restoreFolder(id);
  };

  const handleDeleteDoc = (id: string, title: string) => {
    const msg = t('doclist.permanentlyDeleteConfirm').replace('{name}', title);
    if (!window.confirm(msg)) return;
    deleteDocument(id);
  };

  const handleDeleteFolder = (id: string, name: string) => {
    const msg = t('doclist.permanentlyDeleteConfirm').replace('{name}', name);
    if (!window.confirm(msg)) return;
    deleteFolder(id);
  };

  const handleDeleteAsset = (id: number, name: string) => {
    const msg = t('doclist.permanentlyDeleteConfirm').replace('{name}', name);
    if (!window.confirm(msg)) return;
    deleteTrashedAsset(id);
  };

  const handleEmptyTrash = () => {
    if (totalCount === 0) return;
    if (!window.confirm(t('doclist.emptyTrashConfirm'))) return;
    emptyTrash();
    emptyTrashFolders();
    emptyTrashAssets();
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 ${
        transition === 'exit'
          ? 'animate-dialog-backdrop-out'
          : 'animate-dialog-backdrop-in'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-[min(600px,92vw)] max-h-[80vh] flex flex-col rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl ${
          transition === 'exit'
            ? 'animate-dialog-panel-out'
            : 'animate-dialog-panel-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--vscode-widget-border)]">
          <Trash2 className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
          <h2 className="flex-1 text-sm font-semibold text-[var(--vscode-foreground)]">
            {t('doclist.trash')}
          </h2>
          {totalCount > 0 && (
            <button
              onClick={handleEmptyTrash}
              className="text-xs px-2.5 py-1 rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
            >
              {t('doclist.emptyTrash')}
            </button>
          )}
          <IconButton onClick={onClose} title={t('terminal.close')}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Trash2 className="w-8 h-8 text-[var(--vscode-descriptionForeground)] opacity-30" />
              <p className="text-sm text-[var(--vscode-descriptionForeground)]">
                {t('doclist.trashEmpty')}
              </p>
            </div>
          ) : (
            <>
              {/* Trashed folders */}
              {trashedFolders.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150"
                >
                  <Folder className="w-4 h-4 opacity-50 shrink-0 text-[var(--vscode-icon-foreground)]" />
                  <span className="flex-1 truncate text-sm text-[var(--vscode-foreground)] opacity-70">
                    {f.name}
                  </span>
                  <button
                    onClick={() => handleRestoreFolder(f.id)}
                    className="p-1 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                    title={t('doclist.restore')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(f.id, f.name)}
                    className="p-1 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                    title={t('doclist.permanentlyDelete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Trashed documents */}
              {trashedDocList.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150"
                >
                  <FileText className="w-4 h-4 opacity-50 shrink-0 text-[var(--vscode-icon-foreground)]" />
                  <span className="flex-1 truncate text-sm text-[var(--vscode-foreground)] opacity-70">
                    {doc.title || t('doclist.untitled')}
                  </span>
                  <button
                    onClick={() => handleRestoreDoc(doc.id)}
                    className="p-1 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                    title={t('doclist.restore')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteDoc(doc.id, doc.title || t('doclist.untitled'))}
                    className="p-1 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                    title={t('doclist.permanentlyDelete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Trashed assets (document-private attachments) */}
              {trashedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150"
                >
                  <Paperclip className="w-4 h-4 opacity-50 shrink-0 text-[var(--vscode-icon-foreground)]" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate text-sm text-[var(--vscode-foreground)] opacity-70">
                      {asset.originalName}
                    </span>
                    <span className="truncate text-xs text-[var(--vscode-descriptionForeground)]">
                      {t('doclist.trashedAssetFrom').replace(
                        '{name}',
                        docTitleFor(asset.docId),
                      )}
                      {asset.sizeBytes > 0
                        ? ` · ${formatFileSize(asset.sizeBytes)}`
                        : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => restoreTrashedAsset(asset.id)}
                    className="p-1 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                    title={t('doclist.restore')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteAsset(asset.id, asset.originalName)}
                    className="p-1 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                    title={t('doclist.permanentlyDelete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
