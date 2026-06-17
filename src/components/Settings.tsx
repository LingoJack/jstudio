import { useState } from 'react';
import { Palette, Info, Settings2, type LucideIcon } from 'lucide-react';
import AppearanceSection from './settings/AppearanceSection';
import AboutSection from './settings/AboutSection';
import GeneralSection from './settings/GeneralSection';

// ────────────────────────────────────────────────
// Settings sections
// ────────────────────────────────────────────────
type SectionId = 'general' | 'appearance' | 'about';

interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'general', label: '通用', icon: Settings2 },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'about', label: '关于', icon: Info },
];

const SECTIONS: Record<SectionId, () => React.ReactElement> = {
  general: GeneralSection,
  appearance: AppearanceSection,
  about: AboutSection,
};

export default function Settings() {
  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const ActiveSection = SECTIONS[activeSection];

  return (
    <div className="w-full h-full flex bg-[var(--vscode-editor-background)]">
      {/* ── Left navigation ── */}
      <nav className="w-52 shrink-0 bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)] flex flex-col py-4 select-none">
        {/* Title */}
        <div className="px-4 mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
            设置
          </h2>
        </div>

        {/* Nav items */}
        <div className="flex-1 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs transition-colors duration-150 cursor-pointer ${
                  active
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                    : 'text-[var(--vscode-sideBar-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                }`}
              >
                <Icon className="w-4 h-4 opacity-70" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Right content ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="px-8 py-4 border-b border-[var(--vscode-sideBar-border)] shrink-0">
          <h3 className="text-sm font-semibold text-[var(--vscode-foreground)]">
            {NAV_ITEMS.find((n) => n.id === activeSection)?.label}
          </h3>
        </div>

        {/* Content — scrollable, centered for readability */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-8 py-6">
            <ActiveSection />
          </div>
        </div>
      </div>
    </div>
  );
}
