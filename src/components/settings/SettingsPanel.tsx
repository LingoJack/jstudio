import { useState, useCallback } from 'react';
import { Info, Settings2, Terminal, PenLine, BookOpen, Keyboard, Bot, Bug, type LucideIcon } from 'lucide-react';
import { useI18n } from '../../lib/core/i18n';
import type { TranslationKey } from '../../lib/core/i18n';
import { useStore } from '../../store/useStore';
import type { SettingsSectionId } from '../../store/uiSlice';
import { useCollapsibleTree } from '../ui/useCollapsibleTree';
import { NavBranch, NavRow } from '../ui/NavTree';
import GeneralSection from './GeneralSection';
import AgentModelSection from './AgentModelSection';
import EditorSection from './EditorSection';
import TerminalSection from './TerminalSection';
import ShortcutsSection from './ShortcutsSection';
import AboutSection from './AboutSection';
import HelpSection from './HelpSection';
import DebugSection from './DebugSection';

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
      
      { anchorId: 'settings-general-activityBarItems', labelKey: 'appearance.activityBarItems' },
      { anchorId: 'settings-general-dataLocation', labelKey: 'general.dataLocation' },
      { anchorId: 'settings-general-jcli', labelKey: 'jcli.title' },
    ],
  },
  {
    id: 'agent',
    labelKey: 'settings.agent',
    icon: Bot,
    subItems: [
      { anchorId: 'settings-agent-providers', labelKey: 'agent.providers' },
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
      { anchorId: 'settings-shortcuts-global', labelKey: 'settings.globalShortcuts' },
      { anchorId: 'settings-shortcuts-reference', labelKey: 'shortcut.reference' },
    ],
  },
  {
    id: 'help',
    labelKey: 'settings.help',
    icon: BookOpen,
  },
  { id: 'about', labelKey: 'settings.about', icon: Info },
  { id: 'debug', labelKey: 'settings.debug', icon: Bug },
];

const SECTIONS: Record<SectionId, () => React.ReactElement> = {
  general: GeneralSection,
  agent: AgentModelSection,
  editor: EditorSection,
  terminal: TerminalSection,
  shortcuts: ShortcutsSection,
  help: HelpSection,
  about: AboutSection,
  debug: DebugSection,
};

// ──────────────────────────────────────────────────────────────────
// SubNode — recursive sub-item renderer using NavRow.
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
        <NavRow
          level="secondary"
          expandable
          expanded={open}
          noHover
          onClick={() => toggle(groupId)}
        >
          {t(node.labelKey)}
        </NavRow>
        {open && (
          <NavBranch plain className="ml-4">
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
    <NavRow
      level="secondary"
      active={subActive}
      noHover
      onClick={() => node.anchorId && onLeafClick(sectionId, node.anchorId)}
    >
      {t(node.labelKey)}
    </NavRow>
  );
}

export default function SettingsPanel() {
  const { t } = useI18n();
  const activeSection = useStore((s) => s.settingsActiveSection);
  const setActiveSection = useStore((s) => s.setSettingsActiveSection);
  const ActiveSection = SECTIONS[activeSection];

  // Collapsible nav state — shared hook also used by DocumentSidebar folders.
  const { toggle, expand, isExpanded } = useCollapsibleTree(
    new Set([
      activeSection,
      // Default-expand the nested Terminal group under Shortcuts.
      'shortcuts-shortcut.category.terminal',
    ]),
  );
  const [activeAnchor, setActiveAnchor] = useState<string | undefined>(undefined);

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
        setActiveAnchor(undefined);
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
        setActiveAnchor(undefined);
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
      <nav className="w-60 shrink-0 bg-[var(--vscode-sideBar-background)] flex flex-col py-5 select-none">
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
                  level="primary"
                  plainActive={hasSubs}
                  active={active}
                  noHover
                  icon={<Icon className="w-5 h-5 opacity-70 shrink-0" />}
                  expandable={hasSubs}
                  expanded={open}
                  onClick={() => handleMainClick(item)}
                >
                  {t(item.labelKey)}
                </NavRow>

                {/* Sub-items (recursive — supports nested groups) */}
                {hasSubs && open && (
                  <NavBranch plain className="mt-0.5 mb-1 ml-[18px]">
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
        {/* Help section renders as a full-width document via DocumentPanel
            (which manages its own scrolling); other settings sections use
            a centered narrow column with external scroll. */}
        {activeSection === 'help' ? (
          <>
            <div id="settings-content-top" className="h-0 w-full" aria-hidden />
            <div className="flex-1 min-h-0">
              <ActiveSection />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Scroll sentinel — lets us jump to top when switching sections */}
            <div id="settings-content-top" className="h-0 w-full" aria-hidden />
            <div className="max-w-4xl mx-auto px-10 py-8">
              <ActiveSection />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
