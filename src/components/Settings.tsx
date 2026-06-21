import { useState, useCallback } from 'react';
import { Info, Settings2, Terminal, PenLine, BookOpen, Keyboard, ChevronRight, type LucideIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { TranslationKey } from '../lib/i18n';
import { useStore } from '../store/useStore';
import type { SettingsSectionId } from '../store/uiSlice';
import { useCollapsibleTree } from './ui/useCollapsibleTree';
import { NavBranch } from './ui/NavTree';
import GeneralSection from './settings/GeneralSection';
import EditorSection from './settings/EditorSection';
import TerminalSection from './settings/TerminalSection';
import ShortcutsSection from './settings/ShortcutsSection';
import AboutSection from './settings/AboutSection';
import HelpSection from './settings/HelpSection';

// ────────────────────────────────────────────────
// Settings sections
// ────────────────────────────────────────────────
type SectionId = SettingsSectionId;

/** A navigatable sub-item (leaf with anchor) or a collapsible group (branch with children). */
interface NavSubNode {
  /** DOM anchor id for leaf nodes */
  anchorId?: string;
  labelKey: TranslationKey;
  /** Nested children — if present, this node is a collapsible group, not a leaf. */
  children?: NavSubNode[];
}

interface NavItem {
  id: SectionId;
  labelKey: TranslationKey;
  icon: LucideIcon;
  subItems?: NavSubNode[];
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
    id: 'shortcuts',
    labelKey: 'settings.shortcuts',
    icon: Keyboard,
    subItems: [
      { anchorId: 'settings-shortcuts-general', labelKey: 'shortcut.category.general' },
      {
        labelKey: 'shortcut.category.terminal',
        children: [
          { anchorId: 'settings-shortcuts-terminal-tabs', labelKey: 'shortcut.category.terminalTabs' },
          { anchorId: 'settings-shortcuts-terminal-panes', labelKey: 'shortcut.category.terminalPanes' },
        ],
      },
      { anchorId: 'settings-shortcuts-editor-blocks', labelKey: 'shortcut.category.editorBlocks' },
      { anchorId: 'settings-shortcuts-reference', labelKey: 'shortcut.reference' },
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
  shortcuts: ShortcutsSection,
  help: HelpSection,
  about: AboutSection,
};

// ──────────────────────────────────────────────────────────────────
// SubNode — recursive sub-item renderer.
// Leaf nodes (with anchorId) are clickable navigation targets.
// Branch nodes (with children) are collapsible groups that render
// their children inside a nested NavBranch.
// ──────────────────────────────────────────────────────────────────

function SubNode({
  node,
  sectionId,
  active,
  activeAnchor,
  onLeafClick,
  isExpanded,
  toggle,
  expand,
}: {
  node: NavSubNode;
  sectionId: SectionId;
  active: boolean;
  activeAnchor: string | undefined;
  onLeafClick: (sectionId: SectionId, anchorId: string) => void;
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  expand: (id: string) => void;
}) {
  const { t } = useI18n();

  // ── Branch node (collapsible group) ──
  if (node.children && node.children.length > 0) {
    const groupId = `${sectionId}-${node.labelKey}`;
    const open = isExpanded(groupId);
    // Auto-expand when a descendant is the active anchor
    const descendantActive = node.children.some(
      (child) => active && activeAnchor === child.anchorId,
    );
    if (descendantActive && !open) expand(groupId);

    return (
      <div>
        <button
          onClick={() => toggle(groupId)}
          className="w-full flex items-center gap-2 pl-4 pr-3 py-1.5 -ml-px text-[13px] transition-colors duration-150 cursor-pointer border-l-2 border-transparent text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
        >
          <ChevronRight
            className={`w-3 h-3 opacity-50 transition-transform duration-200 shrink-0 ${open ? 'rotate-90' : ''}`}
          />
          <span>{t(node.labelKey)}</span>
        </button>
        {open && (
          <NavBranch className="ml-4">
            {node.children.map((child) => (
              <SubNode
                key={child.labelKey}
                node={child}
                sectionId={sectionId}
                active={active}
                activeAnchor={activeAnchor}
                onLeafClick={onLeafClick}
                isExpanded={isExpanded}
                toggle={toggle}
                expand={expand}
              />
            ))}
          </NavBranch>
        )}
      </div>
    );
  }

  // ── Leaf node (clickable anchor) ──
  const subActive = active && activeAnchor === node.anchorId;
  return (
    <button
      onClick={() => node.anchorId && onLeafClick(sectionId, node.anchorId)}
      className={`w-full flex items-center gap-2 pl-4 pr-3 py-1.5 -ml-px text-[13px] transition-colors duration-150 cursor-pointer border-l-2 ${
        subActive
          ? 'border-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)] font-medium'
          : 'border-transparent text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      <span>{t(node.labelKey)}</span>
    </button>
  );
}

export default function Settings() {
  const { t } = useI18n();
  const activeSection = useStore((s) => s.settingsActiveSection);
  const setActiveSection = useStore((s) => s.setSettingsActiveSection);
  const ActiveSection = SECTIONS[activeSection];

  // Collapsible nav state — shared hook also used by DocumentList folders.
  const { toggle, expand, isExpanded } = useCollapsibleTree(
    new Set([
      activeSection,
      // Default-expand the nested Terminal group under Shortcuts.
      'shortcuts-shortcut.category.terminal',
    ]),
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
                <button
                  onClick={() => handleMainClick(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors duration-150 cursor-pointer ${
                    active
                      ? hasSubs
                        ? 'text-[var(--vscode-foreground)] font-medium'
                        : 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                      : 'text-[var(--vscode-sideBar-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                  }`}
                >
                  <Icon className="w-5 h-5 opacity-70 shrink-0" />
                  <span className="flex-1 text-left">{t(item.labelKey)}</span>
                  {hasSubs && (
                    <ChevronRight
                      className={`w-3.5 h-3.5 opacity-50 transition-transform duration-200 shrink-0 ${
                        open ? 'rotate-90' : ''
                      }`}
                    />
                  )}
                </button>

                {/* Sub-items (recursive — supports nested groups) */}
                {hasSubs && open && (
                  <NavBranch className="mt-0.5 mb-1 ml-[18px]">
                    {item.subItems!.map((sub) => (
                      <SubNode
                        key={sub.labelKey}
                        node={sub}
                        sectionId={item.id}
                        active={active}
                        activeAnchor={activeAnchor}
                        onLeafClick={handleSubClick}
                        isExpanded={isExpanded}
                        toggle={toggle}
                        expand={expand}
                      />
                    ))}
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
