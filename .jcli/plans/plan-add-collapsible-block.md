# 新增折叠块 (Collapsible Block) 类型

## 目标

在文档编辑器中新增一种「折叠块」(collapsible) 块类型，用户通过 `/collapse` 或 `/折叠` 斜杠命令插入。折叠块包含一个始终可见的标题行和一个可展开/收起的内容区域，视觉样式参考设置页 `HelpSection` 中的 `CollapsibleSection`（圆角边框 + 带背景的 header 行 + ChevronDown 旋转动画）。

同时将折叠块的**视觉外壳提取为公共组件** `components/ui/Collapsible.tsx`，让 HelpSection 和编辑器块共用同一套样式。

---

## 涉及文件

### 新建文件（3 个）

| 文件 | 说明 |
|------|------|
| `src/components/ui/Collapsible.tsx` | 公共折叠容器组件（纯展示，不含 TipTap 依赖） |
| `src/lib/collapsibleExtension.ts` | TipTap 自定义 Node 扩展（`collapsible` 节点 + `setCollapsible` 命令） |
| `src/components/CollapsibleView.tsx` | 编辑器内 ReactNodeView，使用公共 Collapsible 的样式类 |

### 修改文件（5 个）

| 文件 | 改动 |
|------|------|
| `src/components/BlockEditor.tsx` | 注册 `CollapsibleExtension` |
| `src/lib/tiptapExtensions.tsx` | 新增 `/collapse`（折叠块）斜杠命令 |
| `src/lib/tiptapAdapter.ts` | 新增 `collapsible` ↔ TipTap `collapsible` 节点双向转换 |
| `src/types/document.ts` | `BlockType` 联合类型增加 `'collapsible'`；`BlockProperties` 增加折叠块字段 |
| `src/components/settings/HelpSection.tsx` | `CollapsibleSection` 改为引用公共 `Collapsible` 组件；`BLOCK_TYPES` 列表新增「折叠块」 |

---

## 实现细节

### 1. 公共组件 `src/components/ui/Collapsible.tsx`

从 HelpSection 的 `CollapsibleSection` 提取而来。纯 React 展示组件，不依赖 TipTap。

```tsx
interface CollapsibleProps {
  open: boolean;
  onToggle: () => void;
  /** header 区域内容（chevron 之后渲染） */
  header: React.ReactNode;
  /** 可折叠的主体内容 */
  children: React.ReactNode;
  className?: string;
}
```

视觉效果（与现有 HelpSection 一致）：
- 外层：`rounded-lg border border-[var(--vscode-widget-border)] overflow-hidden`
- Header 行：`flex items-center gap-2 px-4 py-2.5 bg-[var(--vscode-list-hoverBackground)] hover:bg-[var(--vscode-list-activeSelectionBackground)] cursor-pointer`
- ChevronDown 图标：`w-4 h-4 transition-transform duration-200`，展开时 `rotate-180`
- Body：`px-4 py-3`，收起时 `hidden`

> **导出 class 常量**：同时导出 `COLLAPSIBLE_HEADER_CLASS`、`COLLAPSIBLE_WRAPPER_CLASS` 等字符串常量，供编辑器 NodeView 在需要时复用（因 NodeView 需要配合 TipTap 的 `NodeViewWrapper` / `NodeViewContent`，不能直接用组件 children）。

### 2. TipTap 扩展 `src/lib/collapsibleExtension.ts`

参照 `fileExtension.ts` 的模式创建自定义 Node：

```ts
Collapsible = Node.create({
  name: 'collapsible',
  group: 'block',
  content: 'block+',        // 可嵌套任意块级内容
  isolating: true,           // 隔离内部内容，防止合并到外部
  defining: true,

  addAttributes() {
    return {
      open:    { default: true },
      summary: { default: '' },
    };
  },

  parseHTML()  → [{ tag: 'div[data-type="collapsible"]' }],
  renderHTML() → ['div', { 'data-type': 'collapsible' }, 0],

  addCommands() → {
    setCollapsible: (attrs) => insertContent({
      type: 'collapsible',
      attrs: { open: true, summary: '', ...attrs },
      content: [{ type: 'paragraph' }],  // 默认一个空段落
    }) + 后面追加一个空段落（方便继续编辑）
  },

  addNodeView() → ReactNodeViewRenderer(CollapsibleView),
})
```

命令类型声明：
```ts
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsible: {
      setCollapsible: (attrs?: { open?: boolean; summary?: string }) => ReturnType;
    };
  }
}
```

### 3. ReactNodeView `src/components/CollapsibleView.tsx`

使用 `@tiptap/react` 的 `NodeViewWrapper` + `NodeViewContent`：

```tsx
function CollapsibleView({ node, updateAttributes, deleteNode }) {
  const { open, summary } = node.attrs;

  return (
    <NodeViewWrapper className="my-2">
      {/* 外壳：复用 Collapsible 组件的视觉样式 */}
      <div className={COLLAPSIBLE_WRAPPER_CLASS}>
        {/* Header（不可编辑区域） */}
        <div
          contentEditable={false}
          className={COLLAPSIBLE_HEADER_CLASS}
          onClick={() => updateAttributes({ open: !open })}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          <input
            type="text"
            value={summary}
            onChange={e => updateAttributes({ summary: e.target.value })}
            placeholder="折叠块标题..."
            onClick={e => e.stopPropagation()}  // 防止点击输入框触发折叠
            className="flex-1 bg-transparent border-none focus:outline-none text-sm font-medium ..."
          />
        </div>

        {/* Content（TipTap 可编辑区域 — 始终在 DOM 中，仅用 CSS 控制显隐） */}
        <NodeViewContent
          className={`px-4 py-3 ${open ? '' : 'hidden'}`}
        />
      </div>
    </NodeViewWrapper>
  );
}
```

**关键点**：
- `NodeViewContent` **必须始终渲染**（不能条件渲染），否则 ProseMirror 的 contentDOM 丢失会导致崩溃。收起时用 `hidden` class 隐藏。
- Header 行设置 `contentEditable={false}`，防止 ProseMirror 将其纳入选区。
- 点击 header 切换 `open` 属性；点击 summary input 时 `stopPropagation` 避免误触折叠。

### 4. BlockEditor.tsx — 注册扩展

```ts
import { CollapsibleExtension } from '../lib/collapsibleExtension';
// ...
extensions: [
  // ...existing...
  CollapsibleExtension,
],
```

### 5. tiptapExtensions.tsx — 斜杠命令

在 `slashCommands` 数组中新增：

```ts
{
  title: 'Collapsible',
  description: '可折叠/展开的内容区域',
  icon: '▼',
  aliases: ['collapse', 'collapsible', 'toggle', 'fold', '折叠', '收起', '展开'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setCollapsible().run(),
},
```

### 6. tiptapAdapter.ts — 双向转换

**`ourTypeToTiptapType`** 增加：
```ts
case 'collapsible': return 'collapsible';
```

**`tiptapTypeToOurType`** 增加：
```ts
case 'collapsible': return 'collapsible';
```

**`ourBlockToTiptapJSON`** 增加 `collapsible` case：
- `attrs: { open, summary }` 从 `properties.collapsibleOpen` / `properties.collapsibleSummary` 取值
- `content` 从 `properties.collapsibleChildren`（序列化的 JSONContent[]）还原

**`tiptapJSONToOurBlock`** 增加 `collapsible` case：
- `open` → `properties.collapsibleOpen`
- `summary` → `properties.collapsibleSummary`
- `node.content`（子节点 JSON）→ `properties.collapsibleChildren`

### 7. types/document.ts — 类型扩展

```ts
export type BlockType =
  | ...existing...
  | 'collapsible';

export interface BlockProperties {
  ...existing...
  /** Collapsible block: whether the body is expanded. */
  collapsibleOpen?: boolean;
  /** Collapsible block: the always-visible summary/title text. */
  collapsibleSummary?: string;
  /** Collapsible block: serialized child blocks (TipTap JSONContent[]). */
  collapsibleChildren?: unknown[];
}
```

### 8. HelpSection.tsx — 改用公共组件 + 更新块类型列表

- 删除内联的 `CollapsibleSection` 函数，改为引用 `components/ui/Collapsible`
- `BLOCK_TYPES` 数组新增 `{ name: '折叠块', desc: '可折叠/展开的内容区域' }`

---

## 视觉效果

**展开状态**：
```
┌─────────────────────────────────────────┐
│ ▼  [折叠块标题___________________]      │  ← header (hover 高亮)
├─────────────────────────────────────────┤
│   这是折叠块内的内容...                  │  ← 可编辑区域
│   可以放置任意类型的块                    │
└─────────────────────────────────────────┘
```

**收起状态**：
```
┌─────────────────────────────────────────┐
│ ▶  [折叠块标题___________________]      │
└─────────────────────────────────────────┘
```

---

## 验证步骤

1. `npx tsc --noEmit` — 类型检查通过
2. `npm run dev` — 启动前端
3. 功能测试：
   - 在空行输入 `/collapse` 或 `/折叠` 能唤起并插入折叠块
   - 点击 header 能展开/收起
   - summary 输入框能编辑标题
   - 折叠块内能输入文字、插入图片/表格等
   - 切换文档后再切回，折叠块内容和展开状态保持
4. 设置页帮助文档中的折叠区域样式不受影响（因为改用了公共组件）
