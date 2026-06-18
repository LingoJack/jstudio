import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { FileText, Plus } from 'lucide-react';

/**
 * EmptyState — placeholder shown in the main content area when there is
 * no active document to display (e.g. all documents deleted).
 *
 * Renders a centered icon, a hint, and a "New Document" button.
 */
export default function EmptyState() {
  const { t } = useI18n();
  const createDocument = useStore((s) => s.createDocument);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4">
      <FileText className="w-12 h-12 text-[var(--vscode-descriptionForeground)] opacity-40" />
      <div>
        <h3 className="font-semibold text-base text-[var(--vscode-foreground)]">
          {t('doclist.noMatch')}
        </h3>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mt-1.5">
          {t('doclist.newDocument')}
        </p>
      </div>
      <button
        onClick={createDocument}
        className="cursor-pointer bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] rounded px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors duration-150 mt-1"
      >
        <Plus className="w-4 h-4" />
        <span>{t('doclist.newDocument')}</span>
      </button>
    </div>
  );
}
