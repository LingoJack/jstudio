# 计划：Slash 菜单支持表格（/table）

## 目标

在 `/` 斜杠菜单中添加 `/table` 命令，使用户可以通过输入 `/table` 插入一个可编辑的表格块。表格基于 TipTap 原生 Table 扩展，支持行/列增删、单元格编辑、Tab 键导航。

## 涉及文件（6 个）

| # | 文件 | 改动 |
|---|------|------|
| 1 | `package.json` | 安装 `@tiptap/extension-table` (+row/header/cell) |
| 2 | `src/types/document.ts` | 新增 `'table'` BlockType + TableData 相关类型 |
| 3 | `src/lib/tiptapAdapter.ts` | 添加 table ↔ TipTap JSON 双向转换 |
| 4 | `src/lib/tiptapExtensions.tsx` | 添加 `/table` slash 命令 |
| 5 | `src/components/BlockEditor.tsx` | 注册 Table 系列扩展 |
| 6 | `src/styles/vscode-theme.css` | 表格样式（边框、表头、选中态、hover 控件） |

## 详细方案

### 1. 安装依赖

```bash
npm install @tiptap/extension-table@^3.26.0 \
  @tiptap/extension-table-row@^3.26.0 \
  @tiptap/extension-table-header@^3.26.0 \
  @tiptap/extension-table-cell@^3.26.0
```

> 版本与现有 `@tiptap/*` 保持一致 (`^3.26.0`)。

### 2. 类型定义 (`src/types/document.ts`)

在 `BlockType` 联合类型中新增 `'table'`：

```typescript
export type BlockType =
  | 'text'
  | 'heading-1' | 'heading-2' | 'heading-3'
  | 'code'
  | 'image'
  | 'file'
  | 'table'; // ← 新增
```

新增表格数据类型（不依赖 TipTap，使用我们的 RichText）：

```typescript
/** 表格单元格 */
export interface TableCellData {
  /** 单元格内的段落（通常每格一段） */
  content: RichText[][];
  /** 合并单元格用 */
  colspan?: number;
  rowspan?: number;
}

/** 表格行 */
export interface TableRowData {
  isHeader: boolean;
  cells: TableCellData[];
}

/** 序列化的表格结构 */
export interface TableData {
  rows: TableRowData[];
}
```

在 `BlockProperties` 中新增 `tableData?: TableData`。

### 3. 适配器转换 (`src/lib/tiptapAdapter.ts`)

**类型映射**：
- `ourTypeToTiptapType`: `'table' → 'table'`
- `tiptapTypeToOurType`: `'table' → 'table'`

**ourBlockToTiptapJSON (table → TipTap)**：
将 `TableData` 结构展开为 TipTap 的嵌套 table/tableRow/tableHeader|tableCell/paragraph JSON。

```
TableData.rows → tableNode.content: [
  { type: 'tableRow', content: [
    { type: 'tableHeader'|'tableCell', attrs: { colspan, rowspan }, content: [
      { type: 'paragraph', content: RichText → inline }
    ]}
  ]}
]
```

**tiptapJSONToOurBlock (TipTap → table)**：
遍历 TipTap table 节点的 content，逐行/逐格提取：
- `tableRow` → `TableRowData`
- `tableHeader` / `tableCell` → `TableCellData`（读取 colspan/rowspan attrs，将内部 paragraph 的 inline content 转回 `RichText[]`）

### 4. Slash 命令 (`src/lib/tiptapExtensions.tsx`)

在 `slashCommands` 数组中新增：

```typescript
{
  title: 'Table',
  description: 'Insert a table',
  icon: '⊞',  // 或使用 lucide Table 图标的文字表示
  aliases: ['table', 'grid', '矩阵'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range)
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run(),
},
```

### 5. 编辑器注册 (`src/components/BlockEditor.tsx`)

在 extensions 数组中注册：

```typescript
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';

// extensions: [
//   ...
//   Table.configure({ resizable: false }),
//   TableRow,
//   TableHeader,
//   TableCell,
// ]
```

### 6. CSS 样式 (`src/styles/vscode-theme.css`)

在 `.ProseMirror` 样式区块内添加表格样式：

- **表格容器**：`overflow-x: auto`，圆角边框
- **边框**：使用 `var(--vscode-widget-border)` 统一细线
- **表头**：背景 `var(--vscode-editor-inactiveSelectionBackground)`，粗体
- **单元格**：padding `6px 12px`，min-width
- **选中单元格**：`.selectedCell` 蓝色半透明背景
- **悬停控件**：行/列首尾出现 `+` 按钮（CSS-only，使用 TipTap 的 addRowBefore/After 命令）
- **暗色模式**：通过 CSS 变量自动适配

关键 CSS 类名（TipTap 默认生成）：
- `.tableWrapper` — 包裹容器
- `table` — 表格本体
- `th`, `td` — 单元格
- `.selectedCell` — 选中态
- `.column-resize-handle` — 列宽拖拽柄（如果启用 resizable）

## 数据流验证

```
用户输入 /table → insertTable(3×3) → TipTap table 节点
      ↓ onUpdate (debounce 300ms)
editor.getJSON() → tiptapJSONToOurBlocks() → Block{ type:'table', properties:{ tableData:{...} } }
      ↓ store.setActiveDocBlocks()
保存到 document.json
      ↓ 重新加载
ourBlocksToTiptapJSON() → TipTap setContent → 表格恢复渲染
```

## 不在本次范围

- 列宽拖拽调整（`resizable: true`）—— 后续可加
- 单元格合并/拆分 UI 按钮 —— 后续可加自定义 NodeView 工具栏
- 从 HTML 粘贴表格的解析 —— 现有 paste handler 不处理表格
