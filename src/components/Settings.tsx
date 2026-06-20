import { Info, Settings2, Terminal, PenLine, BookOpen, type LucideIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { TranslationKey } from '../lib/i18n';
import { useStore } from '../store/useStore';
import type { SettingsSectionId } from '../store/uiSlice';
import GeneralSection from './settings/GeneralSection';
import EditorSection from './settings/EditorSection';
import TerminalSection from './settings/TerminalSection';
import AboutSection from './settings/AboutSection';
import HelpSection from './settings/HelpSection';

// ────────────────────────────────────────────────
// Settings sections
// ────────────────────────────────────────────────
type SectionId = SettingsSectionId;

interface NavItem {
  id: SectionId;
  labelKey: TranslationKey;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'general', labelKey: 'settings.general', icon: Settings2 },
  { id: 'editor', labelKey: 'settings.editor', icon: PenLine },
  { id: 'terminal', labelKey: 'settings.terminal', icon: Terminal },
  { id: 'help', labelKey: 'settings.help', icon: BookOpen },
  { id: 'about', labelKey: 'settings.about', icon: Info },
];

const SECTIONS: Record<SectionId, () => React.ReactElement> = {
  general: GeneralSection,
  editor: EditorSection,
  terminal: TerminalSection,
  help: HelpSection,
  about: AboutSection,
};

export default function Settings() {
  const { t } = useI18n();
  const activeSection = useStore((s) => s.settingsActiveSection);
  const setActiveSection = useStore((s) => s.setSettingsActiveSection);
  const ActiveSection = SECTIONS[activeSection];

  return (
    <div className="w-full h-full flex bg-[var(--vscode-editor-background)]">
      {/* ── Left navigation ── */}
      <nav className="w-60 shrink-0 bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col py-5 select-none">
        {/* Title */}
        <div className="px-5 mb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
            {t('settings.title')}
          </h2>
        </div>

        {/* Nav items */}
        <div className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors duration-150 cursor-pointer ${
                  active
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                    : 'text-[var(--vscode-sideBar-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                }`}
              >
                <Icon className="w-5 h-5 opacity-70" />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Right content ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="px-10 py-5 border-b border-[var(--vscode-sideBar-border)] shrink-0">
          <h3 className="text-lg font-semibold text-[var(--vscode-foreground)]">
            {t(NAV_ITEMS.find((n) => n.id === activeSection)!.labelKey)}
          </h3>
        </div>

        {/* Content — scrollable, centered for readability */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-10 py-8">
            <ActiveSection />
          </div>
        </div>
      </div>
    </div>
  );
}
