import { useState, useCallback, useEffect } from 'react';
import { Info, Settings2, Terminal, PenLine, BookOpen, Keyboard, Bot, Bug, type LucideIcon } from 'lucide-react';
import { useI18n } from '../../lib/core/i18n';
import type { TranslationKey } from '../../lib/core/i18n';
import { useStore } from '../../store/useStore';
import type { SettingsSectionId } from '../../store/uiSlice';
import { useCollapsibleTree } from '../ui/useCollapsibleTree';
import { useDialogTransition } from '../ui/useDialogTransition';
import { NavBranch, NavRow, RailArrow, ActiveTitle } from '../ui/NavTree';
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
}: {
  node: NavSubNode;
  sectionId: SectionId;
  active: boolean;
  activeAnchor: string | undefined;
  onLeafClick: (sectionId: SectionId, anchorId: string) => void;
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
}) {
  const { t } = useI18n();

  // ── Branch node (collapsible group) ──
  if (node.children && node.children.length > 0) {
    const groupId = `${sectionId}-${node.labelKey}`;
    const open = isExpanded(groupId);

    return (
      <div>
        <NavRow
          level="secondary"
          expandable
          expanded={open}
          noHover
          bleed
          onClick={() => toggle(groupId)}
        >
          {t(node.labelKey)}
        </NavRow>
        {open && (
          <NavBranch className="ml-[12px]">
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
              />
            ))}
          </NavBranch>
        )}
      </div>
    );
  }

  // ── Leaf node (clickable anchor) ──
  const subActive = active && activeAnchor === node.anchorId;
  const label = t(node.labelKey);
  return (
    <NavRow
      level="secondary"
      noHover
      bleed
      onClick={() => node.anchorId && onLeafClick(sectionId, node.anchorId)}
    >
      {subActive ? (
        <>
          <RailArrow />
          <ActiveTitle text={label} />
        </>
      ) : (
        label
      )}
    </NavRow>
  );
}

export default function SettingsPanel() {
  const { t } = useI18n();
  const isOpen = useStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const activeSection = useStore((s) => s.settingsActiveSection);
  const setActiveSection = useStore((s) => s.setSettingsActiveSection);
  const ActiveSection = SECTIONS[activeSection];

  // Enter/exit animation — same dialog language as GlobalSearchDialog.
  const transition = useDialogTransition(isOpen);

  // Esc closes the dialog. BUBBLE phase on purpose: the shortcut recorders
  // (ShortcutsSection / GlobalShortcutsSection) listen in the CAPTURE phase
  // and stopPropagation(), which shields this handler — Esc still cancels a
  // recording instead of closing the whole dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, setSettingsOpen]);

  // Collapsible nav state — shared hook also used by DocumentSidebar folders.
  const { toggle, expand, isExpanded } = useCollapsibleTree(
    new Set([
      activeSection,
      // Default-expand the nested Terminal group under Shortcuts.
      'shortcuts-shortcut.category.terminal',
    ]),
  );
  const [activeAnchor, setActiveAnchor] = useState<string | undefined>(undefined);

  // Auto-expand groups containing the active anchor. Runs ONLY when the
  // anchor changes — doing this during SubNode render (per-render) made
  // manual collapse impossible: toggle() collapsed the group, then the
  // render-phase expand() immediately re-opened it.
  useEffect(() => {
    if (!activeAnchor) return;
    const item = NAV_ITEMS.find((i) => i.id === activeSection);
    if (!item?.subItems) return;
    const containsAnchor = (n: NavSubNode): boolean =>
      n.anchorId === activeAnchor || (n.children?.some(containsAnchor) ?? false);
    const walk = (nodes: NavSubNode[]) => {
      for (const n of nodes) {
        if (!n.children) continue;
        if (n.children.some(containsAnchor)) expand(`${activeSection}-${n.labelKey}`);
        walk(n.children);
      }
    };
    walk(item.subItems);
  }, [activeAnchor, activeSection, expand]);

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

  if (transition === 'closed') return null;
  const exiting = transition === 'exit';

  // Modal dialog (GlobalSearchDialog language: backdrop + centered panel).
  // The internal layout is unchanged — left nav + right content column.
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={() => setSettingsOpen(false)}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/30 ${
          exiting ? 'animate-dialog-backdrop-out' : 'animate-dialog-backdrop-in'
        }`}
      />
      <div
        className={`relative w-[min(1120px,95vw)] h-[min(720px,90vh)] overflow-hidden flex rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-editor-background)] shadow-2xl ${
          exiting ? 'animate-dialog-panel-out' : 'animate-dialog-panel-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
      {/* ── Left navigation ── */}
      <nav className="w-60 shrink-0 bg-[var(--vscode-sideBar-background)] flex flex-col py-5 select-none">
        {/* Title */}
        <div className="px-5 mb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
            {t('settings.title')}
          </h2>
        </div>

        {/* Nav items — DocumentSidebar language: gapless bleed rows, a
            guide-line branch under expanded groups, and the active row
            marked by a rail arrow + accent text (no background pill).
            The list container mirrors the doc list's framed scroller
            (rounded-md border pl-2) so the scrollbar reads the same. */}
        <div className="flex-1 overflow-y-auto rounded-md border border-transparent pl-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            const open = isExpanded(item.id);
            const hasSubs = !!item.subItems;
            const label = t(item.labelKey);

            return (
              <div key={item.id}>
                {/* Main header */}
                <NavRow
                  level="primary"
                  noHover
                  bleed
                  className="font-medium"
                  icon={<Icon className="w-5 h-5 opacity-70 shrink-0" />}
                  expandable={hasSubs}
                  expanded={open}
                  onClick={() => handleMainClick(item)}
                >
                  {/* Active main row: accent text only — the rail arrow is
                      redundant next to the section icon. */}
                  {active ? <ActiveTitle text={label} /> : label}
                </NavRow>

                {/* Sub-items (recursive — supports nested groups). The
                    guide line hangs at the parent row's icon center. */}
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
    </div>
  );
}
