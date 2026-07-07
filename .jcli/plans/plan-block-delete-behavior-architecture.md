# Block 删除行为架构优化方案

## 问题分析

### 问题 1：CollapsibleView 标题无法输入

**根因定位**：

CollapsibleView 在 wrapper 上注册了原生事件监听器来阻止事件冒泡到 ProseMirror：

```typescript
el.addEventListener('keydown', keydownShield);  // bubble phase
el.addEventListener('beforeinput', beforeinputShield);
```

问题在于：**React 17+ 使用事件委托机制**，所有合成事件都在 root/document 上通过原生监听器捕获。当 `keydown` 事件在 input 上被原生 `stopPropagation()` 阻止冒泡后：

1. 事件不会冒泡到 root/document
2. React 的合成事件系统看不到这个事件  
3. React 注册的 `onChange` handler 不会被触发

**修复方案**：

移除 `keydownShield` 和 `beforeinputShield`，只保留 `mousedownShield`。

理由：
- `mousedownShield` 阻止 ProseMirror 放置光标到表单控件之外 → 必须保留
- 表单控件自己会处理 keydown 和 beforeinput/input 事件 → 不需要阻止
- ProseMirror 的 `handleKeyDown` 只处理编辑器内的文本块，对 `contentEditable={false}` 区域内的表单控件天然不处理 → 不需要阻止

但为了保险，可以在 ProseMirror 的全局 handler 中检查事件目标是否是表单控件。

### 问题 2：删除逻辑分散、低内聚

**现状**：
- `blockNavigation.ts` 的 `onBackspace` 硬编码处理 codeBlock 和 collapsible
- 每次新增块类型都要修改 blockNavigation.ts
- 违反了"开闭原则"和"单一职责原则"

**期望**：
- 每个块类型在自己的 Extension 中定义删除行为
- 统一的注册机制和入口调用
- 高内聚、低耦合

---

## 架构设计方案

### 方案：BlockBehaviorRegistry + 块级 Behavior Hook

#### 核心思想

1. **每个 Extension 定义自己的删除判定逻辑**
2. **BlockNavigation 作为统一调度器，查询 Registry 执行对应逻辑**
3. **Registry 提供 `register` / `canDelete` / `delete` API**

#### 实现细节

```typescript
// src/lib/editor/blockBehaviorRegistry.ts

export interface BlockBehaviorHandler {
  /** 块类型名称（如 'codeBlock', 'collapsible'） */
  nodeType: string;
  
  /**
   * 判断当前状态是否可以删除该块。
   * @param editor TipTap editor 实例
   * @param $head 当前光标位置
   * @returns true 表示可以删除，false 表示不处理
   */
  canDelete: (editor: Editor, $head: ResolvedPos) => boolean;
  
  /**
   * 执行删除操作。
   * @param editor TipTap editor 实例
   * @param $head 当前光标位置
   * @returns true 表示已处理，false 表示未处理
   */
  delete: (editor: Editor, $head: ResolvedPos) => boolean;
}

class BlockBehaviorRegistry {
  private handlers: Map<string, BlockBehaviorHandler> = new Map();
  
  register(handler: BlockBehaviorHandler) {
    this.handlers.set(handler.nodeType, handler);
  }
  
  /** 
   * 查询是否有 handler 可以处理当前删除请求。
   * 从当前光标位置向上遍历祖先节点，找到第一个注册的 handler。
   */
  handleBackspace(editor: Editor): boolean {
    const { selection } = editor.state;
    if (!selection.empty) return false;
    const $head = selection.$head;
    
    // 从当前 parent 向上遍历，找到注册的 handler
    for (let d = $head.depth; d >= 1; d--) {
      const node = $head.node(d);
      const handler = this.handlers.get(node.type.name);
      if (handler && handler.canDelete(editor, $head)) {
        return handler.delete(editor, $head);
      }
    }
    return false;
  }
}

export const blockBehaviorRegistry = new BlockBehaviorRegistry();
```

#### Extension 中注册删除行为

```typescript
// src/lib/editor/extensions/codeBlockExtension.tsx 中添加

import { blockBehaviorRegistry } from '../blockBehaviorRegistry';

// 在 extension 定义后注册
blockBehaviorRegistry.register({
  nodeType: 'codeBlock',
  canDelete: (editor, $head) => {
    const parent = $head.parent;
    if (parent.type.name !== 'codeBlock') return false;
    return parent.content.size === 0; // 只有完全空才能删除
  },
  delete: (editor, $head) => {
    const blockPos = $head.before(1);
    editor.chain().focus().setNodeSelection(blockPos).deleteSelection().run();
    return true;
  },
});
```

```typescript
// src/lib/editor/extensions/collapsibleExtension.ts 中添加

blockBehaviorRegistry.register({
  nodeType: 'collapsible',
  canDelete: (editor, $head) => {
    // 检查是否在 collapsible 内的空段落中
    const parent = $head.parent;
    if (parent.type.name !== 'paragraph' || parent.content.size !== 0) return false;
    
    // 向上找到 collapsible 祖先
    for (let d = $head.depth; d > 1; d--) {
      const ancestor = $head.node(d);
      if (ancestor.type.name === 'collapsible') {
        const summary = (ancestor.attrs.summary as string) ?? '';
        const hasOnlyOneEmptyChild =
          ancestor.childCount === 1 &&
          ancestor.firstChild?.type.name === 'paragraph' &&
          ancestor.firstChild.content.size === 0;
        return hasOnlyOneEmptyChild && summary.trim() === '';
      }
    }
    return false;
  },
  delete: (editor, $head) => {
    for (let d = $head.depth; d > 1; d--) {
      const ancestor = $head.node(d);
      if (ancestor.type.name === 'collapsible') {
        const collapsiblePos = $head.before(d);
        editor.chain().focus().setNodeSelection(collapsiblePos).deleteSelection().run();
        return true;
      }
    }
    return false;
  },
});
```

#### BlockNavigation 改为调度器

```typescript
// src/lib/editor/blockNavigation.ts 修改

import { blockBehaviorRegistry } from './blockBehaviorRegistry';

const onBackspace = () => {
  // 先查询 Registry，看是否有块定义了自己的删除行为
  if (blockBehaviorRegistry.handleBackspace(editor)) {
    return true;
  }
  // 默认行为：ProseMirror 自己处理
  return false;
};
```

---

## 实施步骤

### Step 1：修复 CollapsibleView 输入问题（优先）

**修改 `src/components/editor/nodes/CollapsibleView.tsx`**：

移除 `keydownShield` 和 `beforeinputShield`，只保留 `mousedownShield`：

```typescript
useEffect(() => {
  const el = wrapperRef.current;
  if (!el) return;

  const mousedownShield = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (SHIELD_TAGS.has(target.tagName) || target.closest('input, textarea, select, button')) {
      e.stopPropagation();
    }
  };

  // 只保留 mousedown，移除 keydown 和 beforeinput
  el.addEventListener('mousedown', mousedownShield);
  return () => {
    el.removeEventListener('mousedown', mousedownShield);
  };
}, []);
```

**原理**：
- React 17+ 使用事件委托，事件冒泡到 root 后才触发合成事件
- 原生 `stopPropagation()` 阻止冒泡后，React 看不到事件
- `mousedownShield` 阻止 ProseMirror 放置光标 → 必须保留
- `keydown`/`beforeinput` 对表单控件无影响 → 可以移除

### Step 2：创建 BlockBehaviorRegistry

**新建 `src/lib/editor/blockBehaviorRegistry.ts`**：

```typescript
import type { Editor, ResolvedPos } from '@tiptap/core';

export interface BlockBehaviorHandler {
  nodeType: string;
  canDelete: (editor: Editor, $head: ResolvedPos) => boolean;
  delete: (editor: Editor, $head: ResolvedPos) => boolean;
}

class BlockBehaviorRegistry {
  private handlers: Map<string, BlockBehaviorHandler> = new Map();
  
  register(handler: BlockBehaviorHandler) {
    this.handlers.set(handler.nodeType, handler);
  }
  
  handleBackspace(editor: Editor): boolean {
    const { selection } = editor.state;
    if (!selection.empty) return false;
    const $head = selection.$head;
    
    for (let d = $head.depth; d >= 1; d--) {
      const node = $head.node(d);
      const handler = this.handlers.get(node.type.name);
      if (handler && handler.canDelete(editor, $head)) {
        return handler.delete(editor, $head);
      }
    }
    return false;
  }
}

export const blockBehaviorRegistry = new BlockBehaviorRegistry();
```

### Step 3：重构 codeBlockExtension

**修改 `src/lib/editor/extensions/codeBlockExtension.tsx`**：

在文件末尾添加注册：

```typescript
import { blockBehaviorRegistry } from '../blockBehaviorRegistry';

blockBehaviorRegistry.register({
  nodeType: 'codeBlock',
  canDelete: (editor, $head) => {
    const parent = $head.parent;
    return parent.type.name === 'codeBlock' && parent.content.size === 0;
  },
  delete: (editor, $head) => {
    const blockPos = $head.before(1);
    editor.chain().focus().setNodeSelection(blockPos).deleteSelection().run();
    return true;
  },
});
```

### Step 4：重构 collapsibleExtension

**修改 `src/lib/editor/extensions/collapsibleExtension.ts`**：

在文件末尾添加注册：

```typescript
import { blockBehaviorRegistry } from '../blockBehaviorRegistry';

blockBehaviorRegistry.register({
  nodeType: 'collapsible',
  canDelete: (editor, $head) => {
    const parent = $head.parent;
    if (parent.type.name !== 'paragraph' || parent.content.size !== 0) return false;
    
    for (let d = $head.depth; d > 1; d--) {
      const ancestor = $head.node(d);
      if (ancestor.type.name === 'collapsible') {
        const summary = (ancestor.attrs.summary as string) ?? '';
        const hasOnlyOneEmptyChild =
          ancestor.childCount === 1 &&
          ancestor.firstChild?.type.name === 'paragraph' &&
          ancestor.firstChild.content.size === 0;
        return hasOnlyOneEmptyChild && summary.trim() === '';
      }
    }
    return false;
  },
  delete: (editor, $head) => {
    for (let d = $head.depth; d > 1; d--) {
      const ancestor = $head.node(d);
      if (ancestor.type.name === 'collapsible') {
        const collapsiblePos = $head.before(d);
        editor.chain().focus().setNodeSelection(collapsiblePos).deleteSelection().run();
        return true;
      }
    }
    return false;
  },
});
```

### Step 5：简化 BlockNavigation

**修改 `src/lib/editor/blockNavigation.ts`**：

```typescript
import { blockBehaviorRegistry } from './blockBehaviorRegistry';

const onBackspace = () => {
  // 委托给 Registry 处理
  return blockBehaviorRegistry.handleBackspace(editor);
};
```

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/lib/editor/blockBehaviorRegistry.ts` | 新建 |
| `src/lib/editor/blockNavigation.ts` | 修改 - 简化 onBackspace |
| `src/lib/editor/extensions/codeBlockExtension.tsx` | 修改 - 注册删除行为 |
| `src/lib/editor/extensions/collapsibleExtension.ts` | 修改 - 注册删除行为 |
| `src/components/editor/nodes/CollapsibleView.tsx` | 修改 - 修复 input 问题（如需要） |

---

## 预期结果

1. **每个块类型自己定义删除逻辑** - 高内聚
2. **BlockNavigation 只做调度** - 低耦合
3. **新增块类型只需在自己的 Extension 中注册** - 开闭原则
4. **CollapsibleView 标题可正常输入**
5. **空 collapsible 块可通过 Backspace 删除**