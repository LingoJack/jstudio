import {
  Terminal as TerminalIcon,
  MousePointer2,
  Database,
  HelpCircle,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';

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
// Document-style section with anchor + icon
// ──────────────────────────────────────────────────────────────────

function DocSection({
  id,
  icon: Icon,
  title,
  children,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 first:mt-0 scroll-mt-8">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-[1.1em] h-[1.1em] text-[var(--vscode-descriptionForeground)]" />
        <h2 className="!mt-0">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Shortcut key row — document inline style using <code>
// ──────────────────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return <code>{children}</code>;
}

// ──────────────────────────────────────────────────────────────────
// Shortcut list — rendered as a definition list with bold keys
// ──────────────────────────────────────────────────────────────────

function ShortcutList({
  rows,
}: {
  rows: { keys: string; action: string }[];
}) {
  return (
    <ul className="!list-none !pl-0 !my-2 space-y-1">
      {rows.map((row, i) => (
        <li key={i} className="!pl-0 flex items-baseline gap-3">
          <span className="shrink-0 font-mono text-[0.9em]">
            {row.keys.split(' ').map((part, j, arr) => (
              <span key={j}>
                <code>{part}</code>
                {j < arr.length - 1 && (
                  <span className="text-[var(--vscode-descriptionForeground)] mx-1">
                    {'+'}
                  </span>
                )}
              </span>
            ))}
          </span>
          <span className="text-[var(--vscode-descriptionForeground)]">
            {row.action}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────
// Callout — blockquote with icon
// ──────────────────────────────────────────────────────────────────

function Callout({
  icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <div className="flex gap-3 px-4 py-3 rounded-lg bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] !my-4">
      <Icon className="w-4 h-4 shrink-0 mt-0.5 text-[var(--vscode-descriptionForeground)]" />
      <div className="text-sm text-[var(--vscode-descriptionForeground)] leading-relaxed flex-1 [&_p]:!my-0">
        {children}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Inline feature chip
// ──────────────────────────────────────────────────────────────────

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)]">
      {children}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────
// Shortcut data
// ──────────────────────────────────────────────────────────────────

const EDITOR_SHORTCUTS = [
  { keys: `${MOD} + B`, action: '加粗' },
  { keys: `${MOD} + I`, action: '斜体' },
  { keys: `${MOD} + U`, action: '下划线' },
  { keys: `${MOD} + ${SHIFT} + S`, action: '删除线' },
  { keys: `${MOD} + E`, action: '行内代码' },
  { keys: `${MOD} + Z`, action: '撤销' },
  { keys: `${MOD} + ${SHIFT} + Z`, action: '重做' },
  { keys: `${MOD} + Click`, action: '打开链接' },
];

const MARKDOWN_SHORTCUTS = [
  { keys: '# (空格)', action: '一级标题 H1' },
  { keys: '## (空格)', action: '二级标题 H2' },
  { keys: '### (空格)', action: '三级标题 H3' },
  { keys: '> (空格)', action: '引用块' },
  { keys: '- (空格)', action: '无序列表' },
  { keys: '1. (空格)', action: '有序列表' },
  { keys: '``` (回车)', action: '代码块' },
  { keys: '--- (回车)', action: '水平分割线' },
];

const NAVIGATION_SHORTCUTS = [
  { keys: 'Enter', action: '在下方新建段落' },
  { keys: 'Shift + Enter', action: '当前段落内换行' },
  { keys: 'Backspace（段落开头）', action: '与上一个段落合并' },
  { keys: '↑（首行）', action: '光标跳到上一个块' },
  { keys: '↓（末行）', action: '光标跳到下一个块' },
];

const TERMINAL_TAB_SHORTCUTS = [
  { keys: `${MOD} + T`, action: '新建标签页' },
  { keys: `${MOD} + W`, action: '关闭当前标签页' },
  { keys: `${MOD} + ${SHIFT} + ←/→`, action: '切换到左 / 右标签页' },
  { keys: `${MOD} + ${ALT} + ←/→`, action: '切换标签页（备选）' },
];

const TERMINAL_PANE_SHORTCUTS = [
  { keys: `${MOD} + ↵`, action: '分屏：在当前标签页中新增面板' },
  { keys: `${MOD} + ${SHIFT} + W`, action: '仅关闭当前面板' },
  { keys: `${MOD} + ←/→`, action: '在面板间切换焦点' },
  { keys: `${MOD} + ${SHIFT} + F`, action: '移动当前面板位置' },
  { keys: `${MOD} + ${SHIFT} + L`, action: '循环切换面板布局' },
];

const LAYOUTS = [
  { name: 'Tall', desc: '左侧主面板 + 右侧竖排' },
  { name: 'Fat', desc: '顶部主面板 + 底部横排' },
  { name: 'Grid', desc: '最优网格排列' },
  { name: 'Horizontal', desc: '全部横向排列' },
  { name: 'Vertical', desc: '全部纵向排列' },
];

// ──────────────────────────────────────────────────────────────────
// Main HelpSection — rendered as a read-only JStudio document
// ──────────────────────────────────────────────────────────────────

export default function HelpSection() {
  const { t } = useI18n();

  return (
    <div className="h-full overflow-y-auto">
      {/* Read-only badge — floats top-right */}
      <div className="sticky top-0 z-10 flex justify-end -mb-8 pt-2 pr-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-yellow)]" />
          只读文档
        </span>
      </div>

      {/* Document body — mirrors BlockEditor layout */}
      <article className="px-4 md:px-12 lg:px-20 pt-8 pb-16 select-text">
        {/* Document Title */}
        <div className="pb-2">
          <h1
            className="text-4xl font-bold text-[var(--vscode-editor-foreground)] mb-1"
            style={{ marginTop: 0 }}
          >
            {t('about.helpGuide')}
          </h1>
          <p className="text-sm text-[var(--vscode-descriptionForeground)]">
            {t('about.helpGuideDesc')}
          </p>
        </div>

        {/* ── ProseMirror document surface ── */}
        <div className="ProseMirror help-doc max-w-none" style={{ outline: 'none' }}>
          {/* ── 欢迎 ── */}
          <p>
            <strong>JStudio</strong> 是一款离线优先的本地笔记应用，采用 Notion
            风格的块编辑器。所有数据存储在你的本地文件系统中，无需注册、无需联网，隐私完全由你掌控。
          </p>
          <p>
            这篇帮助文档本身就是用 JStudio 的编辑器「写」出来的——你看到的每一个标题、每一段文字、每一处排版，都和你在真实文档中能创建的完全一致。
          </p>

          {/* ── 快速上手 ── */}
          <DocSection id="settings-help-quickstart" icon={ChevronRight} title="快速上手">
            <h3>三步开始</h3>
            <ol>
              <li>
                <strong>新建文档</strong> — 点击左侧文档列表头部的 <Kbd>+</Kbd> 按钮，即时创建一篇空白文档。
              </li>
              <li>
                <strong>开始书写</strong> — 直接在编辑区域输入文字，内容会自动保存到本地文件。
              </li>
              <li>
                <strong>插入内容块</strong> — 在空行输入 <Kbd>/</Kbd> 唤出斜杠命令菜单，选择要插入的块类型。
              </li>
            </ol>

            <Callout icon={MousePointer2}>
              <p>
                不需要手动保存。JStudio 采用防抖写入机制，每次编辑后 <strong>500ms</strong> 自动保存到磁盘。你随时关闭窗口都不会丢失数据。
              </p>
            </Callout>
          </DocSection>

          {/* ── 编辑器与块 ── */}
          <DocSection id="settings-help-editor" icon={ChevronRight} title="编辑器与块">
            <p>
              JStudio 的编辑器是一个统一的编辑面板（surface）。你书写的每一段文字、插入的每一种内容，都是一个「块」（Block）。块与块之间可以自由排列、拖拽、嵌套。
            </p>

            <h3>支持的块类型</h3>
            <p>在空行输入 <Kbd>/</Kbd> 可唤出斜杠命令菜单，快速插入以下内容：</p>
            <ul>
              <li><strong>文本</strong> — 普通段落，最基本的写作单元</li>
              <li><strong>标题 1 / 2 / 3</strong> — 三级标题，自动构建文档大纲</li>
              <li><strong>引用块</strong> — 突出引用文字，左侧带竖线</li>
              <li><strong>有序 / 无序列表</strong> — 自动编号或符号列表</li>
              <li><strong>代码块</strong> — 支持 30+ 语言语法高亮</li>
              <li><strong>表格</strong> — 可调行列数的结构化表格</li>
              <li><strong>图片</strong> — 直接粘贴或拖入图片，本地存储</li>
              <li><strong>附件</strong> — 任意文件类型附件</li>
              <li><strong>分割线</strong> — 水平分割，视觉区隔内容</li>
              <li><strong>折叠块</strong> — 可折叠 / 展开的内容区域，适合收纳长文</li>
            </ul>

            <h3>Markdown 快捷输入</h3>
            <p>在行首输入 Markdown 标记后按空格，自动转换为对应格式：</p>
            <ShortcutList rows={MARKDOWN_SHORTCUTS} />

            <h3>编辑器快捷键</h3>
            <ShortcutList rows={EDITOR_SHORTCUTS} />

            <h3>光标导航</h3>
            <ShortcutList rows={NAVIGATION_SHORTCUTS} />

            <Callout icon={MousePointer2}>
              <p>
                <strong>格式工具栏：</strong>选中任意文字，会自动浮现格式工具栏，可快速切换加粗、斜体、删除线、行内代码。
              </p>
              <p className="mt-2">
                <strong>文档大纲：</strong>点击编辑器右上角的大纲图标，可展开文档大纲面板，快速跳转到各标题。
              </p>
            </Callout>
          </DocSection>

          {/* ── 终端 ── */}
          <DocSection id="settings-help-terminal" icon={TerminalIcon} title="终端">
            <p>
              JStudio 内置了一个功能完整的终端模拟器，支持多标签页、分屏、光标拖尾动画等特性。你可以在写作的同时直接运行命令行工具，无需切换应用。
            </p>

            <h3>标签页管理</h3>
            <ShortcutList rows={TERMINAL_TAB_SHORTCUTS} />

            <h3>分屏与面板</h3>
            <ShortcutList rows={TERMINAL_PANE_SHORTCUTS} />

            <h3>面板布局</h3>
            <p>使用 <Kbd>{MOD} + {SHIFT} + L</Kbd> 在以下 5 种布局间循环切换：</p>
            <ul>
              {LAYOUTS.map((layout, i) => (
                <li key={i}>
                  <Chip>{layout.name}</Chip>
                  <span className="text-[var(--vscode-descriptionForeground)]"> — {layout.desc}</span>
                </li>
              ))}
            </ul>

            <h3>光标拖尾动画</h3>
            <p>
              终端光标移动时，会出现彗星尾巴般的拖尾动画效果（移植自 <strong>Kitty</strong> 终端）。拖尾形状会自动跟随光标样式（块状 / 下划线 / 竖线）变化。可在 <strong>「设置 → 终端」</strong> 中切换光标样式。
            </p>

            <h3>终端模板</h3>
            <p>
              在 <strong>「设置 → 终端 → 模板」</strong> 中可创建终端模板，预设名称和工作目录，方便一键启动特定项目的终端。
            </p>
          </DocSection>

          {/* ── 数据与存储 ── */}
          <DocSection id="settings-help-storage" icon={Database} title="数据与存储">
            <p>
              JStudio 是<strong>纯本地应用</strong>，不依赖任何云端服务。你的所有文档、图片、附件都存储在本地文件系统中，你可以随时备份、迁移或检视。
            </p>

            <h3>存储位置</h3>
            <pre><code>{`~/.jdata/studio/
├── index.json              # 文档元数据索引
├── settings.json           # 用户设置
└── documents/
    └── {docId}/            # 每篇文档独立文件夹
        ├── document.json   # 完整文档内容
        └── assets/         # 文档私有资源（图片、附件）`}</code></pre>

            <h3>设计原则</h3>
            <ul>
              <li>
                <strong>索引与内容分离</strong> — <code>index.json</code> 只存储轻量的元数据列表，侧边栏可瞬时渲染；完整文档按需从各自文件夹加载。
              </li>
              <li>
                <strong>每文档独立文件夹</strong> — 文档的所有资源（图片、附件）存在 <code>documents/&#123;id&#125;/assets/</code> 下，删除文档时整个文件夹一并清理，无残留。
              </li>
              <li>
                <strong>防抖写入</strong> — 文档和索引的保存都有 <strong>500ms</strong> 防抖，避免高频 IO 操作。
              </li>
              <li>
                <strong>无数据库依赖</strong> — 纯 JSON 文件存储，无 SQLite / IndexedDB，数据完全透明可读。
              </li>
            </ul>
          </DocSection>

          {/* ── 常见问题 ── */}
          <DocSection id="settings-help-faq" icon={HelpCircle} title="常见问题">
            <h3>数据安全吗？</h3>
            <p>
              完全安全。所有数据存储在本地 <code>~/.jdata/studio/</code> 目录下，不经过任何网络传输。建议定期备份该目录。
            </p>

            <h3>支持多设备同步吗？</h3>
            <p>
              当前版本为纯离线应用，暂不支持云端同步。你可以通过第三方同步工具（如 iCloud、Dropbox、Syncthing）同步 <code>~/.jdata/studio/</code> 目录实现多设备数据共享。
            </p>

            <h3>删除的文档能恢复吗？</h3>
            <p>
              删除文档会永久移除其独立文件夹，不可从应用内恢复。请谨慎操作，或提前做好目录级备份。
            </p>

            <h3>粘贴的图片存在哪里？</h3>
            <p>
              粘贴或拖入的图片会以文件形式存储在 <code>documents/&#123;docId&#125;/assets/</code> 下，与文档内容绑定，删除文档时一同清理。
            </p>

            <hr />

            <p className="text-[var(--vscode-descriptionForeground)] text-sm">
              还有问题？欢迎通过「关于」页面联系作者。
            </p>
          </DocSection>
        </div>
      </article>
    </div>
  );
}
