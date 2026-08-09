import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X, History, FileText } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { useAnimatedExit } from '../ui/useDialogTransition';
import { storage } from '../../lib/core/storage';
import type { DocBackup } from '../../types/storage';
import { toast } from '../../lib/core/toast';
import { formatFileSize } from '../../lib/editor/fileUtils';
import type { Document } from '../../types';
import DocumentPanel from '../editor/sectionEditor/DocumentPanel';

interface BackupRestoreDialogProps {
  docId: string;
  docTitle: string;
  onClose: () => void;
}

export default function BackupRestoreDialog({
  docId,
  docTitle,
  onClose,
}: BackupRestoreDialogProps) {
  const { t } = useI18n();
  const { exiting, close } = useAnimatedExit(onClose);
  const [backups, setBackups] = useState<DocBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DocBackup | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Load backup list on open.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    storage
      .listDocBackups(docId)
      .then((list) => {
        if (cancelled) return;
        setBackups(list);
        setSelected(list[0] ?? null);
      })
      .catch((e) => {
        if (!cancelled) toast.error(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  // Load preview when selection changes.
  useEffect(() => {
    if (!selected) {
      setPreviewDoc(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    storage
      .readDocBackup(docId, selected.id)
      .then((doc) => {
        if (cancelled) return;
        setPreviewDoc(doc);
      })
      .catch((e) => {
        if (!cancelled) {
          setPreviewDoc(null);
          console.error('Failed to read backup preview:', e);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docId, selected]);

  // Esc to close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  const handleRestore = async () => {
    if (!selected || restoring) return;
    if (!window.confirm(t('backup.restoreConfirm'))) return;
    setRestoring(true);
    try {
      await storage.restoreDocBackup(docId, selected.id);
      // Reload the document in the store so the editor picks up the restored
      // content (reloadDoc bumps a nonce that editors watch).
      await useStore.getState().reloadDoc(docId);
      toast.success(t('backup.restoreSuccess', { title: docTitle }));
      close();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (ms: number) => {
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? t('backup.unknownTime') : d.toLocaleString();
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${
        exiting
          ? 'animate-dialog-backdrop-out'
          : 'animate-dialog-backdrop-in'
      }`}
      onClick={close}
    >
      <div
        className={`flex flex-col w-[min(1280px,96vw)] h-[min(900px,92vh)] rounded-lg border bg-[var(--vscode-menu-background)] border-[var(--vscode-menu-border)] shadow-2xl overflow-hidden ${
          exiting
            ? 'animate-dialog-panel-out'
            : 'animate-dialog-panel-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--vscode-widget-border)]">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 shrink-0 text-[var(--vscode-icon-foreground)]" />
            <span className="font-medium text-[var(--vscode-foreground)] truncate">
              {t('backup.title')}
            </span>
            <span className="text-sm text-[var(--vscode-descriptionForeground)] truncate">
              · {docTitle}
            </span>
          </div>
          <button
            onClick={close}
            className="p-1 rounded hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: list + preview */}
        <div className="flex flex-1 min-h-0">
          {/* Backup list */}
          <div className="w-[260px] shrink-0 overflow-y-auto border-r border-[var(--vscode-widget-border)]">
            {loading ? (
              <div className="p-4 text-sm text-[var(--vscode-descriptionForeground)]">
                {t('backup.loading')}
              </div>
            ) : backups.length === 0 ? (
              <div className="p-4 text-sm text-[var(--vscode-descriptionForeground)]">
                {t('backup.noBackups')}
              </div>
            ) : (
              backups.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className={`w-full text-left px-3 py-2 border-b border-[var(--vscode-widget-border)] cursor-pointer transition-colors ${
                    selected?.id === b.id
                      ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                      : 'hover:bg-[var(--vscode-list-hoverBackground)]'
                  }`}
                >
                  <div className="text-xs text-[var(--vscode-foreground)]">
                    {formatDate(b.timestampMs)}
                  </div>
                  <div className="text-[11px] text-[var(--vscode-descriptionForeground)] mt-0.5 flex items-center gap-2">
                    <span>{t('backup.blockCount', { count: b.blockCount })}</span>
                    <span>·</span>
                    <span>{formatFileSize(b.size)}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Preview pane */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <span className="text-sm">
                  {backups.length === 0 ? t('backup.noBackups') : t('backup.preview')}
                </span>
              </div>
            ) : loadingPreview ? (
              <div className="flex items-center justify-center h-full text-sm text-[var(--vscode-descriptionForeground)]">
                {t('backup.loading')}
              </div>
            ) : previewDoc ? (
              <DocumentPanel
                key={selected.id}
                doc={{ title: previewDoc.title || docTitle, blocks: previewDoc.blocks }}
                readOnly
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <span className="text-sm">{t('backup.noBackups')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--vscode-widget-border)]">
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            {backups.length > 0 ? t('backup.totalCount', { count: backups.length }) : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={close}
              className="px-3 py-1.5 text-sm rounded border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
            >
              {t('backup.close')}
            </button>
            <button
              onClick={handleRestore}
              disabled={!selected || restoring}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('backup.restore')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
