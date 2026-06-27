/**
 * Help document data — a pre-written `Block[]` rendered by HelpSection
 * using the same TipTap editor as a real document.
 *
 * This is the single source of truth for help content. It uses exactly the
 * same `Block[]` data model as any user-created document, so what the user
 * sees in the Help tab is visually identical to a real document.
 */

import type { Block, RichText, TableData } from '../types';

// ── RichText helpers (keep the data below readable) ─────────────────────

/** Plain text segment. */
const t = (text: string): RichText => ({ text, annotations: {} });
/** Bold text segment. */
const b = (text: string): RichText => ({ text, annotations: { bold: true } });
/** Inline code segment (rendered as `<code>` via the code annotation). */
const code = (text: string): RichText => ({ text, annotations: { code: true } });

// ── Platform-aware shortcut text ────────────────────────────────────────

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';
const SHIFT = isMac ? '⇧' : 'Shift';
const ALT = isMac ? '⌥' : 'Alt';

// ── Block factory helpers ───────────────────────────────────────────────

let _id = 0;
const nid = () => `block-help-${_id++}`;

const heading2 = (...content: RichText[]): Block => ({
  id: nid(),
  type: 'heading-2',
  content,
});

const heading3 = (...content: RichText[]): Block => ({
  id: nid(),
  type: 'heading-3',
  content,
});

const text = (...content: RichText[]): Block => ({
  id: nid(),
  type: 'text',
  content,
});

const quote = (...content: RichText[]): Block => ({
  id: nid(),
  type: 'quote',
  content,
});

const bulletList = (items: RichText[][]): Block => ({
  id: nid(),
  type: 'bullet-list',
  content: items as unknown as RichText[],
});

const orderedList = (items: RichText[][]): Block => ({
  id: nid(),
  type: 'ordered-list',
  content: items as unknown as RichText[],
});

const divider = (): Block => ({
  id: nid(),
  type: 'divider',
  content: [],
});

const codeBlock = (codeStr: string, language = 'plaintext'): Block => ({
  id: nid(),
  type: 'code',
  content: [{ text: codeStr, annotations: {} }],
  properties: { language },
});

/**
 * Build a table block.
 * @param rows Array of rows. Each row is an array of cells.
 *             Each cell is RichText[][] (paragraphs of inline content).
 *             First row is automatically the header.
 */
const table = (rows: RichText[][][], header = true): Block => {
  const tableData: TableData = {
    rows: rows.map((cells, rowIdx) => ({
      isHeader: header && rowIdx === 0,
      cells: cells.map((paragraphs) => ({ content: [paragraphs] })),
    })),
  };
  return {
    id: nid(),
    type: 'table',
    content: [],
    properties: { tableData },
  };
};

// ── The document blocks ─────────────────────────────────────────────────

export function getHelpBlocks(): Block[] {
  _id = 0; // reset counter on each call
  return [
    // ════════ 欢迎 ════════
    text(
      b('JStudio'),
      t(' 是一款离线优先的本地笔记应用，采用 Notion 风格的块编辑器。所有数据存储在你的本地文件系统中，无需注册、无需联网，隐私完全由你掌控。'),
    ),
    text(
      t('这篇帮助文档本身就是用 JStudio 的编辑器「写」出来的——你看到的每一个标题、每一段文字、每一处排版，都和你在真实文档中能创建的完全一致。'),
    ),

    // ════════ 快速上手 ════════
    heading2(t('快速上手')),

    heading3(t('三步开始')),
    orderedList([
      [
        b('新建文档'),
        t(' — 点击左侧文档列表头部的 '),
        code('+'),
        t(' 按钮，即时创建一篇空白文档。'),
      ],
      [
        b('开始书写'),
        t(' — 直接在编辑区域输入文字，内容会自动保存到本地文件。'),
      ],
      [
        b('插入内容块'),
        t(' — 在空行输入 '),
        code('/'),
        t(' 唤出斜杠命令菜单，选择要插入的块类型。'),
      ],
    ]),

    quote(
      b('自动保存'),
      t('：不需要手动保存。JStudio 采用防抖写入机制，每次编辑后 500ms 自动保存到磁盘。你随时关闭窗口都不会丢失数据。'),
    ),

    // ════════ 编辑器与块 ════════
    heading2(t('编辑器与块')),
    text(
      t('JStudio 的编辑器是一个统一的编辑面板（surface）。你书写的每一段文字、插入的每一种内容，都是一个「块」（Block）。块与块之间可以自由排列、拖拽、嵌套。'),
    ),

    heading3(t('支持的块类型')),
    text(
      t('在空行输入 '),
      code('/'),
      t(' 可唤出斜杠命令菜单，快速插入以下内容：'),
    ),
    bulletList([
      [b('文本'), t(' — 普通段落，最基本的写作单元')],
      [b('标题 1 / 2 / 3'), t(' — 三级标题，自动构建文档大纲')],
      [b('引用块'), t(' — 突出引用文字，左侧带竖线')],
      [b('有序 / 无序列表'), t(' — 自动编号或符号列表')],
      [b('待办列表'), t(' — 可勾选的清单项，跟踪任务状态')],
      [b('代码块'), t(' — 支持 30+ 语言语法高亮')],
      [b('表格'), t(' — 可调行列数的结构化表格')],
      [b('图片'), t(' — 直接粘贴或拖入图片，本地存储')],
      [b('附件'), t(' — 任意文件类型附件')],
      [b('分割线'), t(' — 水平分割，视觉区隔内容')],
      [b('折叠块'), t(' — 可折叠 / 展开的内容区域，适合收纳长文')],
    ]),

    heading3(t('Markdown 快捷输入')),
    text(t('在行首输入 Markdown 标记后按空格，自动转换为对应格式：')),
    table([
      [[code('# (空格)')], [t('一级标题 H1')]],
      [[code('## (空格)')], [t('二级标题 H2')]],
      [[code('### (空格)')], [t('三级标题 H3')]],
      [[code('> (空格)')], [t('引用块')]],
      [[code('- (空格)')], [t('无序列表')]],
      [[code('1. (空格)')], [t('有序列表')]],
      [[code('[] (空格)')], [t('待办列表（未完成）')]],
      [[code('[x] (空格)')], [t('待办列表（已完成）')]],
      [[code('- [ ] (空格)')], [t('待办列表（GFM 语法）')]],
      [[code('``` (回车)')], [t('代码块')]],
      [[code('--- (回车)')], [t('水平分割线')]],
    ]),

    heading3(t('编辑器快捷键')),
    table([
      [[code(`${MOD} + B`)], [t('加粗')]],
      [[code(`${MOD} + I`)], [t('斜体')]],
      [[code(`${MOD} + U`)], [t('下划线')]],
      [[code(`${MOD} + ${SHIFT} + S`)], [t('删除线')]],
      [[code(`${MOD} + E`)], [t('行内代码')]],
      [[code(`${MOD} + Z`)], [t('撤销')]],
      [[code(`${MOD} + ${SHIFT} + Z`)], [t('重做')]],
      [[code(`${MOD} + Click`)], [t('打开链接')]],
    ]),

    heading3(t('光标导航')),
    table([
      [[code('Enter')], [t('在下方新建段落')]],
      [[code('Shift + Enter')], [t('当前段落内换行')]],
      [[code('Backspace（段落开头）')], [t('与上一个段落合并')]],
      [[code('↑（首行）')], [t('光标跳到上一个块')]],
      [[code('↓（末行）')], [t('光标跳到下一个块')]],
    ]),

    quote(
      b('格式工具栏'),
      t('：选中任意文字，会自动浮现格式工具栏，可快速切换加粗、斜体、删除线、行内代码。'),
    ),

    // ════════ 终端 ════════
    heading2(t('终端')),
    text(
      t('JStudio 内置了一个功能完整的终端模拟器，支持多标签页、分屏、光标拖尾动画等特性。你可以在写作的同时直接运行命令行工具，无需切换应用。'),
    ),

    heading3(t('标签页管理')),
    table([
      [[code(`${MOD} + T`)], [t('新建标签页')]],
      [[code(`${MOD} + W`)], [t('关闭当前标签页')]],
      [[code(`${MOD} + ${SHIFT} + ←/→`)], [t('切换到左 / 右标签页')]],
      [[code(`${MOD} + ${ALT} + ←/→`)], [t('切换标签页（备选）')]],
    ]),

    heading3(t('分屏与面板')),
    table([
      [[code(`${MOD} + ↵`)], [t('分屏：在当前标签页中新增面板')]],
      [[code(`${MOD} + ${SHIFT} + W`)], [t('仅关闭当前面板')]],
      [[code(`${MOD} + ←/→`)], [t('在面板间切换焦点')]],
      [[code(`${MOD} + ${SHIFT} + F`)], [t('移动当前面板位置')]],
      [[code(`${MOD} + ${SHIFT} + L`)], [t('循环切换面板布局')]],
    ]),

    heading3(t('面板布局')),
    text(
      t('使用 '),
      code(`${MOD} + ${SHIFT} + L`),
      t(' 在以下 5 种布局间循环切换：'),
    ),
    bulletList([
      [b('Tall'), t(' — 左侧主面板 + 右侧竖排')],
      [b('Fat'), t(' — 顶部主面板 + 底部横排')],
      [b('Grid'), t(' — 最优网格排列')],
      [b('Horizontal'), t(' — 全部横向排列')],
      [b('Vertical'), t(' — 全部纵向排列')],
    ]),

    heading3(t('光标拖尾动画')),
    text(
      t('终端光标移动时，会出现彗星尾巴般的拖尾动画效果（移植自 '),
      b('Kitty'),
      t(' 终端）。拖尾形状会自动跟随光标样式（块状 / 下划线 / 竖线）变化。可在「设置 → 终端」中切换光标样式。'),
    ),

    heading3(t('终端模板')),
    text(
      t('在「设置 → 终端 → 模板」中可创建终端模板，预设名称和工作目录，方便一键启动特定项目的终端。'),
    ),

    // ════════ 数据与存储 ════════
    heading2(t('数据与存储')),
    text(
      t('JStudio 是'),
      b('纯本地应用'),
      t('，不依赖任何云端服务。你的所有文档、图片、附件都存储在本地文件系统中，你可以随时备份、迁移或检视。'),
    ),

    heading3(t('存储位置')),
    codeBlock(
      `~/.jdata/studio/
├── index.json              # 文档元数据索引
├── settings.json           # 用户设置
└── documents/
    └── {docId}/            # 每篇文档独立文件夹
        ├── document.json   # 完整文档内容
        └── assets/         # 文档私有资源（图片、附件）`,
    ),

    heading3(t('设计原则')),
    bulletList([
      [
        b('索引与内容分离'),
        t(' — '),
        code('index.json'),
        t(' 只存储轻量的元数据列表，侧边栏可瞬时渲染；完整文档按需从各自文件夹加载。'),
      ],
      [
        b('每文档独立文件夹'),
        t(' — 文档的所有资源存在 documents/{id}/assets/ 下，删除文档时整个文件夹一并清理，无残留。'),
      ],
      [
        b('防抖写入'),
        t(' — 文档和索引的保存都有 500ms 防抖，避免高频 IO 操作。'),
      ],
      [
        b('无数据库依赖'),
        t(' — 纯 JSON 文件存储，无 SQLite / IndexedDB，数据完全透明可读。'),
      ],
    ]),

    // ════════ 常见问题 ════════
    heading2(t('常见问题')),

    heading3(t('数据安全吗？')),
    text(
      t('完全安全。所有数据存储在本地 '),
      code('~/.jdata/studio/'),
      t(' 目录下，不经过任何网络传输。建议定期备份该目录。'),
    ),

    heading3(t('支持多设备同步吗？')),
    text(
      t('当前版本为纯离线应用，暂不支持云端同步。你可以通过第三方同步工具（如 iCloud、Dropbox、Syncthing）同步 '),
      code('~/.jdata/studio/'),
      t(' 目录实现多设备数据共享。'),
    ),

    heading3(t('删除的文档能恢复吗？')),
    text(
      t('删除文档会永久移除其独立文件夹，不可从应用内恢复。请谨慎操作，或提前做好目录级备份。'),
    ),

    heading3(t('粘贴的图片存在哪里？')),
    text(
      t('粘贴或拖入的图片会以文件形式存储在 documents/{docId}/assets/ 下，与文档内容绑定，删除文档时一同清理。'),
    ),

    divider(),

    text(t('还有问题？欢迎通过「关于」页面联系作者。')),
  ];
}
