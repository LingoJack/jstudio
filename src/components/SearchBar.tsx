import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { Search } from 'lucide-react';

/**
 * Command palette trigger button.
 *
 * Rendered centered in the title bar. Clicking it opens the
 * command palette overlay (`CommandPalette`). The element is
 * styled like the old search input for visual continuity.
 */
export default function SearchBar() {
  const { t } = useI18n();
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 w-96 max-w-[60%]"
      data-tauri-drag-region={false}
    >
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--vscode-icon-foreground)] opacity-60 pointer-events-none" />
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        data-tauri-drag-region={false}
        className="w-full h-7 text-left text-sm pl-8 pr-12 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-descriptionForeground)] opacity-80 hover:opacity-100 hover:border-[var(--vscode-focusBorder)] focus:outline-none focus:border-[var(--vscode-focusBorder)] transition-all duration-150 cursor-pointer flex items-center"
      >
        <span className="truncate">{t('palette.placeholder')}</span>
      </button>
      <kbd
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] opacity-60 pointer-events-none"
        data-tauri-drag-region={false}
      >
        {t('palette.shortcutHint')}
      </kbd>
    </div>
  );
}
