import { useState, useCallback } from 'react';
import { Info, Settings2, Terminal, PenLine, BookOpen, ChevronRight, type LucideIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { TranslationKey } from '../lib/i18n';
import { useStore } from '../store/useStore';
import type { SettingsSectionId } from '../store/uiSlice';
import { useCollapsibleTree } from './ui/useCollapsibleTree';
import { NavBranch, NavRow } from './ui/NavTree';
import GeneralSection from './settings/GeneralSection';
import EditorSection from './settings/EditorSection';
import TerminalSection from './settings/TerminalSection';
import AboutSection from './settings/AboutSection';
import HelpSection from './settings/HelpSection';

// ────────────────────────────────────────────────
// Settings sections
// ────────────────────────────────────────────────
type SectionId = SettingsSectionId;

interface NavSubItem {
  /** DOM anchor id, e.g. 'settings-general-language' */
  anchorId: string;
  labelKey: TranslationKey;
}

interface NavItem {
  id: SectionId;
  labelKey: TranslationKey;
  icon: LucideIcon;
  subItems?: NavSubItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'general',
    labelKey: 'settings.general',
    icon: Settings2,
    subItems: [
      { anchorId: 'settings-general-language', labelKey: 'general.language' },
      { anchorId: 'settings-general-theme', labelKey: 'appearance.theme' },
      { anchorId: 'settings-general-activityBarBorder', labelKey: 'appearance.activityBarBorder' },
      { anchorId: 'settings-general-activityBarItems', labelKey: 'appearance.activityBarItems' },
      { anchorId: 'settings-general-dataLocation', labelKey: 'general.dataLocation' },
      { anchorId: 'settings-general-jcli', labelKey: 'jcli.title' },
    ],
  },
  {
    id: 'editor',
    labelKey: 'settings.editor',
    icon: PenLine,
    subItems: [
      { anchorId: 'settings-editor-latinFont', labelKey: 'general.latinFont' },
      { anchorId: 'settings-editor-cjkFont', labelKey: 'general.cjkFont' },
      { anchorId: 'settings-editor-fontSize', labelKey: 'general.fontSize' },
      { anchorId: 'settings-editor-lineHeight', labelKey: 'general.lineHeight' },
    ],
  },
  {
    id: 'terminal',
    labelKey: 'settings.terminal',
    icon: Terminal,
    subItems: [
      { anchorId: 'settings-terminal-themeDark', labelKey: 'appearance.terminalThemeDark' },
      { anchorId: 'settings-terminal-themeLight', labelKey: 'appearance.terminalThemeLight' },
      { anchorId: 'settings-terminal-fontFamily', labelKey: 'terminal.fontFamily' },
      { anchorId: 'settings-terminal-cursorStyle', labelKey: 'terminal.cursorStyle' },
      { anchorId: 'settings-terminal-fontSize', labelKey: 'general.terminalFontSize' },
    ],
  },
  {
    id: 'help',
    labelKey: 'settings.help',
    icon: BookOpen,
    subItems: [
      { anchorId: 'settings-help-editor', labelKey: 'about.help.editor' },
      { anchorId: 'settings-help-terminal', labelKey: 'about.help.terminal' },
    ],
  },
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

  // Collapsible nav state — shared hook also used by DocumentList folders.
  const { toggle, expand, isExpanded } = useCollapsibleTree(
    new Set([activeSection]),
  );
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);

  /** Scroll a setting block into view within the content scroll area. */
  const scrollToAnchor = useCallback((anchorId: string) => {
    // Use double-rAF so the target section component has rendered its DOM.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(anchorId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }, []);

  /** Click on a main nav item header. */
  const handleMainClick = (item: NavItem) => {
    const wasActive = activeSection === item.id;

    if (item.subItems) {
      if (wasActive) {
        // Already on this section → just toggle expansion.
        toggle(item.id);
      } else {
        // Switching to a new section → activate + expand.
        setActiveSection(item.id);
        setActiveAnchor(null);
        expand(item.id);
        // Reset scroll to top for a fresh view.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = document.getElementById('settings-content-top');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }
    } else {
      // No sub-items — behave like a plain section switch.
      if (!wasActive) {
        setActiveSection(item.id);
        setActiveAnchor(null);
      }
    }
  };

  /** Click on a sub-item: jump to section + scroll to the setting block. */
  const handleSubClick = (sectionId: SectionId, anchorId: string) => {
    if (activeSection !== sectionId) {
      setActiveSection(sectionId);
      expand(sectionId);
    }
    setActiveAnchor(anchorId);
    scrollToAnchor(anchorId);
  };

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
        <div className="flex-1 overflow-y-auto px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            const open = isExpanded(item.id);
            const hasSubs = !!item.subItems;

            return (
              <div key={item.id}>
                {/* Main header */}
                <NavRow
                  onClick={() => handleMainClick(item)}
                  level="primary"
                  active={active}
                  plainActive={hasSubs}
                  icon={<Icon className="w-5 h-5 opacity-70" />}
                  expandable={hasSubs}
                  expanded={open}
                >
                  {t(item.labelKey)}
                </NavRow>

                {/* Sub-items */}
                {hasSubs && open && (
                  <NavBranch className="mt-0.5 mb-1 ml-[18px]">
                    {item.subItems!.map((sub) => {
                      const subActive = active && activeAnchor === sub.anchorId;
                      return (
                        <NavRow
                          key={sub.anchorId}
                          level="secondary"
                          lined
                          active={subActive}
                          onClick={() => handleSubClick(item.id, sub.anchorId)}
                        >
                          {t(sub.labelKey)}
                        </NavRow>
                      );
                    })}
                  </NavBranch>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* ── Right content ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Content — scrollable, centered for readability */}
        <div className="flex-1 overflow-y-auto">
          {/* Scroll sentinel — lets us jump to top when switching sections */}
          <div id="settings-content-top" className="h-0 w-full" aria-hidden />
          <div className="max-w-2xl mx-auto px-10 py-8">
            <ActiveSection />
          </div>
        </div>
      </div>
    </div>
  );
}
