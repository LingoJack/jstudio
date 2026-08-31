# 如何添加编辑器块类型

> 本文档面向需要在 JStudio 编辑器中新增一种"块"(block) 类型的开发者。
> 以 **Collapsible（折叠块）** 为完整示例，逐步讲解涉及的每一个文件和概念。

---

## 架构总览

JStudio 的编辑器基于 **TipTap** (ProseMirror) 构建。一个"块类型"在系统中贯穿以下 5 层：

```
┌────────────────────────────────────────────────────────────────────┐
│  ① TypeScript 类型层    types/document.ts                          │
│     BlockType 联合类型 + BlockProperties 字段                      │
├────────────────────────────────────────────────────────────────────┤
│  ② TipTap 扩展层        lib/xxxExtension.ts                        │
│     自定义 Node 定义 + 命令 + NodeView 绑定                        │
├────────────────────────────────────────────────────────────────────┤
│  ③ NodeView 组件层      components/XxxView.tsx                     │
│     React 组件，定义该块在编辑器中的可视化外观和交互                │
├────────────────────────────────────────────────────────────────────┤
│  ④ 数据适配层           lib/tiptapAdapter.ts                       │
│     JStudio Block ↔ TipTap JSONContent 双向转换                    │
├────────────────────────────────────────────────────────────────────┤
│  ⑤ 入口注册层           components/BlockEditor.tsx +               │
│                         lib/tiptapExtensions.tsx (斜杠命令)         │
│     扩展注册 + / 命令菜单入口                                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 逐步指南

### ① 类型层 — `src/types/document.ts`

**1a. 在 `BlockType` 联合类型中添加新类型：**

```ts
export type BlockType =
  | 'text'
  | 'heading-1'
  // ...existing...
  | 'collapsible';   // ← 新增
```

**1b. 在 `BlockProperties` 接口中添加该块特有的属性：**

```ts
export interface BlockProperties {
  // ...existing...
  collapsibleOpen?: boolean;        // 是否展开
  collapsibleSummary?: string;      // 标题文本
  collapsibleChildren?: unknown[];  // 子节点（序列化的 TipTap JSONContent[]）
}
```

> **命名约定**：属性名以块类型为前缀（如 `collapsible*`），避免与其他块的属性混淆。

---

### ② TipTap 扩展层 — `src/lib/xxxExtension.ts`

创建一个自定义 Node。参照 `src/lib/collapsibleExtension.ts`：

```ts
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CollapsibleView from '../components/CollapsibleView';

// 声明命令类型，让 editor.chain() 有类型提示
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsible: {
      setCollapsible: (attrs?: { open?: boolean }) => ReturnType;
    };
  }
}

export const CollapsibleExtension = Node.create({
  name: 'collapsible',
  group: 'block',          // 块级节点
  content: 'block+',       // 可嵌套任意块级内容（如果不需要嵌套则省略）
  isolating: true,         // 隔离内部内容（防止跨边界合并）
  defining: true,          // 粘贴时保持类型

  addAttributes() {
    return {
      open:    { default: true },
      summary: { default: '' },
    };
  },

  parseHTML()  { return [{ tag: 'div[data-type="collapsible"]' }]; },
  renderHTML() { return ['div', { 'data-type': 'collapsible' }, 0]; },

  addCommands() {
    return {
      setCollapsible: (attrs) => ({ commands }) => {
        return commands.insertContent([
          { type: 'collapsible', attrs: { open: true, ...attrs }, content: [{ type: 'paragraph' }] },
          { type: 'paragraph' },  // 后面追加空段落，方便继续编辑
        ]);
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleView);
  },
});
```

**关键决策点：**

| 问题 | 选项 |
|------|------|
| 内容是否可嵌套？ | 是 → `content: 'block+'`；否 → `atom: true`（如图片、分割线） |
| 是否需要交互 UI？ | 是 → 用 `ReactNodeViewRenderer`；否 → 纯 `renderHTML` 即可 |
| 是否隔离内容？ | 嵌套块建议设 `isolating: true` |

---

### ③ NodeView 组件层 — `src/components/XxxView.tsx`

如果块需要自定义 UI（如折叠箭头、语言选择器），创建 React NodeView。

参照 `src/components/CollapsibleView.tsx` 的核心模式：

```tsx
import { type NodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

export default function CollapsibleView({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs['open'] as boolean;

  return (
    <NodeViewWrapper className="my-3">
      {/* 非编辑区域：必须设 contentEditable={false} */}
      <div contentEditable={false} onClick={() => updateAttributes({ open: !open })}>
        {/* 交互控件 */}
      </div>

      {/* 可编辑区域：NodeViewContent 提供 ProseMirror 的 contentDOM */}
      {/* ⚠️ 必须始终渲染！收起时用 CSS hidden 隐藏，不能条件渲染 */}
      <NodeViewContent className={open ? '' : 'hidden'} />
    </NodeViewWrapper>
  );
}
```

**核心约束（踩坑总结）：**

1. **`NodeViewContent` 必须始终在 DOM 中**。ProseMirror 需要它作为 contentDOM。条件渲染（`{open && <NodeViewContent/>}`）会导致编辑器崩溃。收起时用 CSS `hidden` class。
2. **交互控件区域必须设 `contentEditable={false}`**，否则 ProseMirror 会将其纳入选区，导致光标行为异常。
3. **样式复用**：如果你的块有通用的视觉外壳（如折叠容器），先提取到 `components/ui/` 作为公共组件，再在 NodeView 中引用。

---

### ④ 数据适配层 — `src/lib/tiptapAdapter.ts`

JStudio 有自己的 `Block` 数据模型（存储到文件系统），TipTap 使用 `JSONContent`。需要在 `tiptapAdapter.ts` 中实现双向转换。

**需要修改 4 个函数：**

```ts
// 1. JStudio 类型 → TipTap 类型名
function ourTypeToTiptapType(type: BlockType): string {
  switch (type) {
    // ...existing...
    case 'collapsible': return 'collapsible';  // ← 新增
  }
}

// 2. TipTap 类型名 → JStudio 类型
function tiptapTypeToOurType(type: string): BlockType {
  switch (type) {
    // ...existing...
    case 'collapsible': return 'collapsible';  // ← 新增
  }
}

// 3. JStudio Block → TipTap JSONContent（加载文档时）
function ourBlockToTiptapJSON(block: Block): JSONContent {
  // 在 switch 中新增 case 'collapsible'
  case 'collapsible': {
    json.attrs = {
      open: block.properties?.collapsibleOpen ?? true,
      summary: block.properties?.collapsibleSummary ?? '',
    };
    json.content = block.properties?.collapsibleChildren ?? [{ type: 'paragraph' }];
    break;
  }
}

// 4. TipTap JSONContent → JStudio Block（保存文档时）
function tiptapJSONToOurBlock(node: JSONContent): Block {
  // 在 switch 中新增 case 'collapsible'
  case 'collapsible': {
    block.properties = {
      collapsibleOpen: attrs.open ?? true,
      collapsibleSummary: attrs.summary ?? '',
      collapsibleChildren: node.content ?? [],
    };
    break;
  }
}
```

---

### ⑤ 入口注册层

**5a. 在 `src/components/BlockEditor.tsx` 注册扩展：**

```ts
import { CollapsibleExtension } from '../lib/collapsibleExtension';

// 在 useEditor({ extensions: [...] }) 中添加
extensions: [
  // ...existing...
  CollapsibleExtension,  // ← 新增
],
```

**5b. 在 `src/lib/tiptapExtensions.tsx` 添加斜杠命令：**

```ts
{
  title: 'Collapsible',
  description: '可折叠/展开的内容区域',
  icon: '▼',
  aliases: ['collapsible', 'collapse', 'fold', '折叠', '收起', '展开'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setCollapsible().run(),
},
```

> `aliases` 支持中英文模糊匹配，用户输入 `/coll` 或 `/折叠` 都能匹配。

---

## 完整 Checklist

新增一个块类型时，逐项检查：

- [ ] `src/types/document.ts` — `BlockType` 添加新类型
- [ ] `src/types/document.ts` — `BlockProperties` 添加属性字段
- [ ] `src/lib/xxxExtension.ts` — 新建 TipTap Node 扩展
- [ ] `src/components/XxxView.tsx` — 新建 NodeView 组件（如需要自定义 UI）
- [ ] `src/lib/tiptapAdapter.ts` — 4 个转换函数各添加 `case`
- [ ] `src/components/BlockEditor.tsx` — 注册扩展
- [ ] `src/lib/tiptapExtensions.tsx` — 添加斜杠命令
- [ ] `npx tsc --noEmit` — 类型检查通过

---

## 参考实现

| 块类型 | 扩展文件 | NodeView | 特点 |
|--------|----------|----------|------|
| 文本/标题 | StarterKit 内置 | 无 | 最基础 |
| 图片 | `imageExtension` | 无 | atom 节点 |
| 代码块 | `codeBlockExtension` | `CodeBlockView` | 有语言选择器 + 复制按钮 |
| 文件附件 | `fileExtension` | `FileView` | atom 节点 + 自定义命令 |
| **折叠块** | `collapsibleExtension` | `CollapsibleView` | 可嵌套内容 + 属性交互 |

> **最佳实践**：开始实现前，先找一个与你需求最接近的已有块类型，阅读它的完整代码路径，然后模仿其结构。
