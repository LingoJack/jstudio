# Notion 风格块控件 + 跨块选中 + 数据清理

## 一、当前问题

### 1. 旧数据残留
旧的预设文档 `doc-canvas-lab` 残留在 `~/.jdata/studio/` 中（扁平文件 `documents/doc-canvas-lab.json`），`index.json` 仍引用它。需要在 init 时检测并清理遗留的旧文档。

### 2. 缺少块级 hover 控件
Notion 中每个块左侧 hover 时显示两个图标：
- **拖拽手柄 (⋮⋮)**：点击弹出菜单（删除、复制、转换为...），拖拽可重排块
- **添加按钮 (+)**：在下方添加新块

当前代码中完全没有这些控件。

### 3. 无法跨块选中文字
每个 `contentEditable` div 是独立的 `isolation` 辠界。浏览器原生 `Selection` API 可以跨多个 contentEditable 创建 Range（只要它们没有 `user-select: none` 或其他干扰），但当前布局可能阻止了它。需要确认 CSS 布局允许原生跨块选择。

## 二、实现方案

### Part A: 清理旧数据

修改 `documentsSlice.ts` 的 `init()`：
- 加载 index 后，检测每个 meta 的 title，如果是旧的预设标题（"Canvas 涂鸦画板"等）→ 跳过
- 更稳妥的做法：直接清空 `~/.jdata/studio/` 中的旧 `documents/*.json` 扁平文件（仅限已知预设 ID），然后重建 index

**更简单的方案**：在 init 时，如果检测到只有旧预设文档，就直接清空重来。

### Part B: 块 hover 控件（BlockHandle）

**新建 `components/blocks/BlockHandle.tsx`**

```
块布局变为：
┌──────────────────────────────────────────┐
│ [⋮⋮] [+]  │  块内容（text/heading/image...）  │
│ hover显示  │                                │
└──────────────────────────────────────────┘
```

- `⋮⋮` 按钮：点击 → 弹出上下文菜单（删除块、在上方插入、在下方插入、复制块、转换为文本/标题）
- `+` 按钮：点击 → 在下方插入空文本块并聚焦
- 两个按钮只在 `group-hover/block` 时显示，默认透明

**修改 `BlockRouter.tsx`**：
- 在 wrapper div 中加入 `<BlockHandle>`，绑定 hover 显示逻辑
- 传入 `onDeleteBlock`、`onInsertBlockBelow`、`onDuplicateBlock` 等回调

**修改 `BlockEditor.tsx`**：
- 新增 `duplicateBlock` 逻辑（在 editorSlice 或 BlockEditor 中）
- 将 `deleteBlock`、`insertBlockBelow` 传递到 BlockRouter

### Part C: 跨块选中

**关键原理**（来自 Notion 调研）：
> 每个 text block 是独立的 contentEditable div。浏览器原生 Selection 可以跨多个 contentEditable 跨选——只要这些 div 在同一个可选择的容器内，且没有 CSS 阻止。

**当前问题诊断**：
当前布局使用 `space-y-2` 排列块容器，每个块的 contentEditable 应该可以跨选。但需要确保：
1. 块的 wrapper div 没有设置 `user-select: none`
2. 块之间没有 `pointer-events` 干扰
3. `select-text` class 在容器上（当前已有）

**修复措施**：
1. 确保 `BlockEditor` 容器和所有块 wrapper 都允许文本选择
2. 在 `EditableText` 组件中确认 `whitespace-pre-wrap` 不阻止跨块选择
3. 移除任何可能阻止 `mousedown` 默认行为的代码（如某些 onClick handler 调用了 preventDefault）

**验证**：修复后在浏览器中拖拽鼠标应该能跨多个块选中文字。

### Part D: 块上下文菜单

**新建 `components/blocks/BlockContextMenu.tsx`**

菜单项：
| 菜单项 | 行为 |
|--------|------|
| 删除 | 删除当前块 |
| 复制 | 复制当前块到剪贴板后粘贴在下方 |
| 在上方插入 | 在当前块上方插入空文本块 |
| 在下方插入 | 在当前块下方插入空文本块 |
| 转换为 → | 子菜单：文本、标题1、标题2、标题3 |

## 三、修改清单

### 新建文件
| 文件 | 说明 |
|------|------|
| `components/blocks/BlockHandle.tsx` | hover 时的 ⋮⋮ 和 + 按钮 |
| `components/blocks/BlockContextMenu.tsx` | 点击 ⋮⋮ 弹出的菜单 |

### 修改文件
| 文件 | 变化 |
|------|------|
| `components/blocks/BlockRouter.tsx` | 集成 BlockHandle，调整布局为 flex |
| `components/BlockEditor.tsx` | 传入 duplicateBlock 回调，确保跨块选择布局 |
| `store/editorSlice.ts` | 新增 duplicateBlock 方法 |
| `store/storeHelpers.ts` | StoreState 新增 duplicateBlock |
| `store/documentsSlice.ts` | init 时清理旧预设数据 |
| `components/blocks/types.ts` | BlockRouterProps 新增 onDuplicateBlock |
| `components/blocks/TextBlock.tsx` | 确保不阻止跨块选择 |

## 四、实施顺序

1. **Part A** — 清理旧数据（最小改动，先让用户看到效果）
2. **Part C** — 跨块选中修复（检查并修复 CSS 布局）
3. **Part B** — 块 hover 控件 + 上下文菜单
4. 验证构建
