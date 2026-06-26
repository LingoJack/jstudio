import { useEffect } from 'react';
import { Trash2, RotateCcw, X, Folder, FileText } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { IconButton } from './ui/IconButton';

interface TrashDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function TrashDialog({ open, onClose }: TrashDialogProps) {
  const { t } = useI18n();

  const trashedDocList = useStore((s) => s.trashedDocList);
  const trashedFolders = useStore((s) => s.trashedFolders);
  const restoreDocument = useStore((s) => s.restoreDocument);
  const restoreFolder = useStore((s) => s.restoreFolder);
  const deleteDocument = useStore((s) => s.deleteDocument);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const emptyTrash = useStore((s) => s.emptyTrash);
  const emptyTrashFolders = useStore((s) => s.emptyTrashFolders);

  // ── Esc to close ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const totalCount = trashedDocList.length + trashedFolders.length;

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

  const handleEmptyTrash = () => {
    if (totalCount === 0) return;
    if (!window.confirm(t('doclist.emptyTrashConfirm'))) return;
    emptyTrash();
    emptyTrashFolders();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editorBackground)] shadow-2xl"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
