# Notion 块模型重构计划

## 现状分析

### 当前架构与目标对比

| 设计决策 | 目标 (Notion 模型) | 当前实现 | 差距 |
|---------|-------------------|---------|------|
| **块模型** | 块树：`id` + `type` + `content` + `children` | 扁平数组 `Block[]`，无 `children` | 需加 `children` 字段，改数据结构 |
| **富文本标注** | `content` = 文本段数组 `[{text, annotations}]` | `content` = raw HTML 字符串 | **核心改动**：HTML → 富文本数组 |
| **Editor core** | contentEditable + 事件系统 | `useSurfaceEditor` 已实现 | 基本匹配，需适配新数据格式 |

### 核心问题

**最大的差距在富文本存储方式**：
- 当前 `syncBlockToStore` 做的是 `onUpdateBlock(blockId, { content: el.innerHTML })` — 直接存 HTML
- 目标是存 `RichText[]` = `{ text: string, annotations: Annotations }[]`
- 需要在 DOM ↔ 数据模型之间做双向转换

---

## 重构方案

### 第一阶段：数据模型重构

#### 1.1 新增类型定义 (`src/types/richText.ts`)

```ts
// 富文本标注
export interface RichTextAnnotations {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  color?: string;        // CSS color 或 Notion 风格的 color token
  href?: string;         // 链接 URL
}

// 单个富文本段
export interface RichText {
  text: string;
  annotations: RichTextAnnotations;
}
```

#### 1.2 修改 `src/types/document.ts`

```ts
export interface Block {
  id: string;
  type: BlockType;
  content: RichText[];        // ← 从 string 改为 RichText[]
  children?: string[];        // ← 新增：子块 ID 数组
  properties?: BlockProperties;
}
```

> **注意**：代码块、图片等非文本块的 `content` 含义不同。代码块 content 存原始代码字符串。采用策略：
> - 文本类块 (text, heading, callout, toggle)：`content` = `RichText[]`
> - 代码块：`content` = `RichText[]`，其中 `content[0].text` 存原始代码（与 Notion 一致）
> - 图片/附件等：`content` 保持为资源路径字符串
>
> 为避免类型冲突，`Block.content` 改为 `RichText[] | string` 联合类型，运行时按 `type` 区分。

### 第二阶段：HTML ↔ RichText 转换层

#### 2.1 新建 `src/lib/htmlToRichText.ts`

将 `contentEditable` 的 DOM 节点解析成 `RichText[]`：
- 遍历 DOM 子节点（递归处理嵌套标签）
- `<b>`/`<strong>` → `annotations.bold = true`
- `<i>`/`<em>` → `annotations.italic = true`
- `<u>` → `annotations.underline = true`
- `<s>`/`<strike>`/`style="text-decoration:line-through"` → `annotations.strikethrough = true`
- `<a href>` → `annotations.href = url`
- `<span style="color:...">` → `annotations.color = ...`
- 相邻同标注的文本段合并

#### 2.2 新建 `src/lib/richTextToHtml.ts`

将 `RichText[]` 渲染成 HTML 字符串，供 `BlockLine` 设置 `innerHTML`：
- 遍历 `RichText[]`
- 每段按 annotations 生成 `<span class="rt-bold">`、`<a href>` 等
- 合并空标注段为纯文本

### 第三阶段：编辑器核心适配

#### 3.1 修改 `useSurfaceEditor.ts`

**`syncBlockToStore`**（第 108-113 行）：
```ts
// 之前：
onUpdateBlock(blockId, { content: el.innerHTML });

// 之后：
const richText = htmlToRichText(el);
onUpdateBlock(blockId, { content: richText });
```

**`executeSlashCommand`**（第 181-183 行）：
```ts
// 清空时传空数组
onUpdateBlock(blockId, { type, content: [], properties: getDefaultProperties(type) });
```

**`detectMarkdownShortcut`**：把 `line.innerHTML = content` 改为 `line.innerHTML = richTextToHtml([{text: content, annotations:{}}])`。

**Backspace 合块**：`onDeleteBlock(blockId, line.innerHTML)` → `onDeleteBlock(blockId, JSON.stringify(htmlToRichText(line)))`。store 侧 merge 逻辑改为 merge `RichText[]`。

#### 3.2 修改 `editorSlice.ts`

- `deleteBlock` 的 `mergeContent` 参数从 HTML 字符串改为 `RichText[]`
- 合块逻辑：`prevBlock.content.concat(parseMergeContent(mergeContent))`
- `insertBlockBelow`/`appendBlockAtEnd`/`duplicateBlock`：新块 `content` 初始为 `[]` 而非 `''`

### 第四阶段：块组件渲染适配

#### 4.1 修改 `BlockLine.tsx`

- `html` prop 改为接收已渲染的 HTML 字符串（由父组件用 `richTextToHtml` 生成）
- 或直接改为接收 `RichText[]`，在组件内部 `richTextToHtml` 后 `el.innerHTML = html`

#### 4.2 文本类块组件

**TextBlock / HeadingBlock / CalloutBlock / ToggleBlock**：
```tsx
// 之前
<BlockLine html={block.content} ... />

// 之后
<BlockLine richText={block.content as RichText[]} ... />
```

### 第五阶段：数据迁移

#### 5.1 在 `migrate.ts` 中新增 v1 → v2 迁移

在 `migrateFromLocalStorage` 或新增 `migrateBlockContentV2` 中：
- 检测旧格式：`typeof block.content === 'string'`
- 将 HTML 字符串通过 `htmlToRichText` 解析为 `RichText[]`
- 代码块特殊处理：直接 `[{ text: oldContent, annotations: {} }]`
- 图片/附件等特殊块：content 保持为 string 不变

---

## 实施顺序

1. **类型层** — 新建 `richText.ts`，修改 `document.ts`
2. **转换层** — 新建 `htmlToRichText.ts` + `richTextToHtml.ts`
3. **编辑器** — 改 `useSurfaceEditor.ts` 的 sync/merge 逻辑
4. **Store** — 改 `editorSlice.ts` 的 block 操作
5. **组件** — 改 `BlockLine.tsx` 和各文本块组件
6. **迁移** — 在 `migrate.ts` 加旧数据迁移
7. **测试验证** — `npm run build` + 手动验证编辑功能

## 影响范围

| 文件 | 改动类型 |
|------|---------|
| `src/types/richText.ts` | **新增** |
| `src/types/document.ts` | 修改 |
| `src/lib/htmlToRichText.ts` | **新增** |
| `src/lib/richTextToHtml.ts` | **新增** |
| `src/components/blocks/useSurfaceEditor.ts` | 修改（核心） |
| `src/store/editorSlice.ts` | 修改 |
| `src/components/blocks/BlockLine.tsx` | 修改 |
| `src/components/blocks/TextBlock.tsx` | 修改 |
| `src/components/blocks/HeadingBlock.tsx` | 修改 |
| `src/components/blocks/CalloutBlock.tsx` | 修改 |
| `src/components/blocks/ToggleBlock.tsx` | 修改 |
| `src/components/blocks/CodeBlock.tsx` | 修改 |
| `src/components/blocks/shared.tsx` | 修改 |
| `src/lib/migrate.ts` | 修改（数据迁移） |

## 风险与权衡

1. **`children` 字段**：本次先加字段到数据模型，但**暂不实现完整的块树嵌套渲染**（如 toggle 展开子块）。因为嵌套涉及 BlockRouter 递归渲染、缩进 UI、拖拽层级等大量 UI 工作，应作为后续独立任务。本次确保 toggle 块继续以现有方式工作（`properties.isOpen` 控制 CSS）。

2. **性能**：每次 input 都要 DOM → RichText 解析，比之前直接取 `innerHTML` 开销略大。但 Notion 也是这么做的，且有 debounce/节流优化空间，可后续做。

3. **execCommand('bold')**：仍保留 `document.execCommand` 来操作 DOM（浏览器原生选区），只是同步到 store 时改为解析 DOM 成 RichText 而非存 raw HTML。`execCommand` 虽 deprecated 但所有浏览器仍支持，且 ProseMirror/Slate 早期也依赖它。
