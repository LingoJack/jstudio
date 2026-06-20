import {
  BookOpen,
  Terminal as TerminalIcon,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { Collapsible } from '../ui/Collapsible';

// ──────────────────────────────────────────────────────────────────
// Platform detection
// ──────────────────────────────────────────────────────────────────

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';
const SHIFT = '⇧';
const ALT = isMac ? '⌥' : 'Alt';

// ──────────────────────────────────────────────────────────────────
// Data types
// ──────────────────────────────────────────────────────────────────

interface ShortcutRow {
  keys: string;
  action: string;
}

// ──────────────────────────────────────────────────────────────────
// Shortcut data
// ──────────────────────────────────────────────────────────────────

const SLASH_MENU_ROWS: ShortcutRow[] = [
  { keys: '/', action: '唤起斜杠命令菜单' },
];

const EDITOR_SHORTCUT_ROWS: ShortcutRow[] = [
  { keys: `${MOD}+B`, action: '加粗' },
  { keys: `${MOD}+I`, action: '斜体' },
  { keys: `${MOD}+U`, action: '下划线' },
  { keys: `${MOD}+${SHIFT}+S`, action: '删除线' },
  { keys: `${MOD}+E`, action: '行内代码' },
  { keys: `${MOD}+Z`, action: '撤销' },
  { keys: `${MOD}+${SHIFT}+Z`, action: '重做' },
  { keys: `${MOD}+Click`, action: '打开链接' },
];

const MARKDOWN_ROWS: ShortcutRow[] = [
  { keys: '# (空格)', action: '一级标题' },
  { keys: '## (空格)', action: '二级标题' },
  { keys: '### (空格)', action: '三级标题' },
  { keys: '> (空格)', action: '引用块' },
  { keys: '- (空格)', action: '无序列表' },
  { keys: '1. (空格)', action: '有序列表' },
  { keys: '``` (回车)', action: '代码块' },
  { keys: '--- (回车)', action: '分割线' },
];

const TERMINAL_TAB_ROWS: ShortcutRow[] = [
  { keys: `${MOD}+T`, action: '新建标签页' },
  { keys: `${MOD}+W`, action: '关闭当前标签页' },
  { keys: `${MOD}+${SHIFT}+←/→`, action: '切换到左 / 右标签页' },
  { keys: `${MOD}+${ALT}+←/→`, action: '切换标签页（备选）' },
];

const TERMINAL_PANE_ROWS: ShortcutRow[] = [
  { keys: `${MOD}+↵`, action: '分屏：在当前标签页中新增面板' },
  { keys: `${MOD}+${SHIFT}+W`, action: '仅关闭当前面板' },
  { keys: `${MOD}+←/→`, action: '在面板间切换焦点' },
  { keys: `${MOD}+${SHIFT}+F`, action: '移动当前面板位置' },
  { keys: `${MOD}+${SHIFT}+L`, action: '循环切换面板布局' },
];

const LAYOUT_ROWS: { name: string; desc: string }[] = [
  { name: 'Tall', desc: '左侧主面板 + 右侧竖排' },
  { name: 'Fat', desc: '顶部主面板 + 底部横排' },
  { name: 'Grid', desc: '最优网格排列' },
  { name: 'Horizontal', desc: '全部横向排列' },
  { name: 'Vertical', desc: '全部纵向排列' },
];

const BLOCK_TYPES: { name: string; desc: string }[] = [
  { name: '文本', desc: '普通段落' },
  { name: '标题 1 / 2 / 3', desc: '大、中、小标题' },
  { name: '引用', desc: '引用块' },
  { name: '列表', desc: '有序 / 无序列表' },
  { name: '代码块', desc: '支持 30+ 语言语法高亮' },
  { name: '表格', desc: '可调行列数的表格' },
  { name: '图片', desc: '粘贴或拖入图片' },
  { name: '附件', desc: '任意文件附件' },
  { name: '分割线', desc: '水平分割线' },
  { name: '折叠块', desc: '可折叠/展开的内容区域' },
];

// ──────────────────────────────────────────────────────────────────
// Collapsible section — built on the shared Collapsible component.
//
// Reuses the public `Collapsible` from `components/ui/Collapsible` so that
// the settings page and the editor's collapsible block share the exact
// same visual language (border, header background, chevron animation).
// ──────────────────────────────────────────────────────────────────

function CollapsibleSection({
  icon: Icon,
  title,
  children,
  defaultOpen = false,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      header={
        <>
          <Icon className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0" />
          <span className="text-sm font-medium text-[var(--vscode-foreground)]">
            {title}
          </span>
        </>
      }
    >
      <div className="space-y-4">{children}</div>
    </Collapsible>
  );
}

// ──────────────────────────────────────────────────────────────────
// Shortcut table
// ──────────────────────────────────────────────────────────────────

function ShortcutTable({ rows }: { rows: ShortcutRow[] }) {
  return (
    <div className="space-y-0.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-3 py-1.5">
          <div className="flex items-center gap-1 shrink-0 min-w-[42%]">
            {row.keys.split(' ').map((part, j) => (
              <kbd
                key={j}
                className="px-2 py-0.5 text-xs font-mono rounded border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
              >
                {part}
              </kbd>
            ))}
          </div>
          <span className="text-sm text-[var(--vscode-descriptionForeground)]">
            {row.action}
          </span>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Section heading
// ──────────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-medium text-[var(--vscode-foreground)] mb-2">
      {children}
    </h3>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-medium text-[var(--vscode-descriptionForeground)] uppercase tracking-wide mb-2">
      {children}
    </h4>
  );
}

// ──────────────────────────────────────────────────────────────────
// Tip callout
// ──────────────────────────────────────────────────────────────────

function TipCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 px-3.5 py-2.5 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]">
      <span className="text-sm text-[var(--vscode-descriptionForeground)] leading-relaxed">
        {children}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main HelpSection
// ──────────────────────────────────────────────────────────────────

export default function HelpSection() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      {/* ── Intro ── */}
      <div className="flex items-center gap-2.5 mb-1">
        <BookOpen className="w-5 h-5 text-[var(--vscode-descriptionForeground)]" />
        <h2 className="text-base font-semibold text-[var(--vscode-foreground)]">
          {t('about.helpGuide')}
        </h2>
      </div>
      <p className="text-sm text-[var(--vscode-descriptionForeground)]">
        {t('about.helpGuideDesc')}
      </p>

      {/* ── Editor & Blocks ── */}
      <CollapsibleSection
        icon={PenLine}
        title={t('about.help.editor')}
        defaultOpen
      >
        {/* Slash menu */}
        <div>
          <SectionHeading>{t('about.help.slashMenu')}</SectionHeading>
          <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-3">
            {t('about.help.slashMenuDesc')}
          </p>
          <ShortcutTable rows={SLASH_MENU_ROWS} />
        </div>

        {/* Block types */}
        <div>
          <SubHeading>{t('about.help.blockTypes')}</SubHeading>
          <div className="grid grid-cols-2 gap-2">
            {BLOCK_TYPES.map((bt, i) => (
              <div
                key={i}
                className="flex flex-col gap-0.5 px-3 py-2 rounded-md bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]"
              >
                <span className="text-sm font-medium text-[var(--vscode-foreground)]">
                  {bt.name}
                </span>
                <span className="text-xs text-[var(--vscode-descriptionForeground)]">
                  {bt.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Editor shortcuts */}
        <div>
          <SectionHeading>{t('about.help.editorShortcuts')}</SectionHeading>
          <ShortcutTable rows={EDITOR_SHORTCUT_ROWS} />
        </div>

        {/* Markdown shortcuts */}
        <div>
          <SectionHeading>{t('about.help.markdownShortcuts')}</SectionHeading>
          <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-3">
            {t('about.help.markdownShortcutsDesc')}
          </p>
          <ShortcutTable rows={MARKDOWN_ROWS} />
        </div>

        {/* Tips */}
        <div className="space-y-2.5 pt-2 border-t border-[var(--vscode-widget-border)]">
          <TipCallout>{t('about.help.formatToolbar')}</TipCallout>
          <TipCallout>{t('about.help.outline')}</TipCallout>
        </div>
      </CollapsibleSection>

      {/* ── Terminal ── */}
      <CollapsibleSection
        icon={TerminalIcon}
        title={t('about.help.terminal')}
      >
        {/* Tabs */}
        <div>
          <SectionHeading>{t('about.help.terminalTabs')}</SectionHeading>
          <ShortcutTable rows={TERMINAL_TAB_ROWS} />
        </div>

        {/* Split panes */}
        <div className="pt-3 border-t border-[var(--vscode-widget-border)]">
          <SectionHeading>{t('about.help.terminalSplit')}</SectionHeading>
          <ShortcutTable rows={TERMINAL_PANE_ROWS} />
        </div>

        {/* Layouts */}
        <div className="pt-3 border-t border-[var(--vscode-widget-border)]">
          <SectionHeading>{t('about.help.terminalLayout')}</SectionHeading>
          <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-3">
            {t('about.help.terminalLayoutDesc')}
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {LAYOUT_ROWS.map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-md bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)]"
              >
                <span className="text-sm font-medium text-[var(--vscode-foreground)] shrink-0 min-w-[90px]">
                  {row.name}
                </span>
                <span className="text-sm text-[var(--vscode-descriptionForeground)]">
                  {row.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cursor trail */}
        <div className="pt-3 border-t border-[var(--vscode-widget-border)]">
          <SectionHeading>{t('about.help.cursorTrail')}</SectionHeading>
          <TipCallout>{t('about.help.cursorTrailDesc')}</TipCallout>
        </div>

        {/* Templates */}
        <div className="pt-3 border-t border-[var(--vscode-widget-border)]">
          <SectionHeading>{t('about.help.terminalTemplates')}</SectionHeading>
          <TipCallout>{t('about.help.terminalTemplatesDesc')}</TipCallout>
        </div>
      </CollapsibleSection>
    </div>
  );
}
