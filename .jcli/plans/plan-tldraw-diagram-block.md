# 集成 tldraw 画板块（架构图 / 需求图 + 放大编辑窗口）

## 概述

在 JStudio 编辑器中新增一个 **tldraw 画板块**，用户可通过 `/diagram`（或 `/画板`）斜杠命令插入。块内嵌一个迷你 tldraw 画板，可直接编辑；点击「放大」按钮弹出**全屏模态编辑窗口**进行沉浸式绘图。画板数据以 JSON 字符串存储在节点属性中，随文档持久化。

---

## 涉及的文件

### 新建文件（5 个）

| 文件 | 职责 |
|------|------|
| `src/lib/tldrawExtension.ts` | TipTap Node 扩展定义（atom block，存 `snapshot` JSON） |
| `src/components/TldrawView.tsx` | React NodeView — 嵌入式画板 + 工具栏（放大/对齐/缩放） |
| `src/components/TldrawEditorModal.tsx` | 全屏模态编辑窗口（最大化的 tldraw + 关闭/确认按钮） |
| `src/components/TldrawCanvas.tsx` | 可复用的 tldraw 画板组件（`<Tldraw>` 封装，嵌入式/全屏共用） |
| `src/styles/tldraw-block.css` | tldraw 块的局部样式 + 模态遮罩样式 |

### 修改文件（4 个）

| 文件 | 改动 |
|------|------|
| `src/types/document.ts` | `BlockType` 增加 `'diagram'`；`BlockProperties` 增加 `diagramSnapshot?: string`、`diagramWidth?: number`、`diagramAlign?: 'left' \| 'center'` |
| `src/lib/tiptapAdapter.ts` | 双向转换：`diagram` ↔ `diagramBlock` 节点类型 |
| `src/lib/tiptapExtensions.tsx` | slashCommands 数组新增「Diagram」命令 |
| `src/components/BlockEditor.tsx` | `extensions` 数组注册 `TldrawExtension`；import 新扩展 |

---

## 详细设计

### 1. 类型定义 — `src/types/document.ts`

```typescript
// BlockType 联合类型末尾增加
| 'diagram';

// BlockProperties 增加字段
/** Diagram (tldraw) block: serialized TLDraw snapshot JSON string. */
diagramSnapshot?: string;
/** Diagram block: display width (px). */
diagramWidth?: number;
/** Diagram block: alignment. */
diagramAlign?: 'left' | 'center';
```

### 2. TipTap 扩展 — `src/lib/tldrawExtension.ts`

完全遵循 `fileExtension.ts` / `linkExtension.ts` 的模式：

- **节点名**: `diagramBlock`
- **group**: `block`，**atom**: `true`，**draggable**: `false`
- **属性**:
  - `snapshot: string`（默认 `''`）— tldraw 序列化 JSON
  - `width: number | null`（默认 `null`）— 显示宽度
  - `align: 'left' | 'center'`（默认 `'center'`）
- **命令**: `setDiagram(attrs?)` — 插入 diagramBlock + 后跟空 paragraph
- **NodeView**: `ReactNodeViewRenderer(TldrawView)`
- **parseHTML**: `div[data-type="diagram-block"]`

```typescript
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagramBlock: {
      setDiagram: (attrs?: Partial<DiagramNodeAttributes>) => ReturnType;
    };
  }
}
```

### 3. TldrawCanvas — `src/components/TldrawCanvas.tsx`

封装 `<Tldraw>` 组件的通用画板，被嵌入式和全屏模式共用：

```typescript
interface TldrawCanvasProps {
  /** 初始快照 JSON（首次加载） */
  initialSnapshot: string;
  /** 每次画板内容变更时回调（含 debounce） */
  onChange: (snapshotJson: string) => void;
  /** 是否只读（嵌入式缩略预览模式可用） */
  readOnly?: boolean;
  /** 是否隐藏 UI（仅全屏 false） */
  hideUi?: boolean;
}
```

**实现要点**:
- 使用 tldraw v5 的 `<Tldraw>` + `getSnapshot()` API
- 通过 `useEditor()` → `editor.store.listen()` 监听变更，500ms debounce 后调用 `onChange`
- 初始挂载时通过 `editor.store.mergeRecords()` 注入已有快照
- 导入 tldraw CSS: `import '@tldraw/assets/index.css'`（或按 tldraw v5 要求在 index.css 引入）

### 4. TldrawView — `src/components/TldrawView.tsx`

React NodeView，遵循 `LinkView.tsx` 的结构模式：

```
┌─ NodeViewWrapper ──────────────────────────────────┐
│  [浮动工具栏 — selected 时显示]                      │
│  [↙左] [↔中] | [🔍放大全屏] | [缩放滑块]              │
├─────────────────────────────────────────────────────┤
│                                                     │
│          嵌入式 tldraw 画板（固定高度 300px）         │
│                                                     │
│                              [↘ 拖拽缩放手柄]         │
└─────────────────────────────────────────────────────┘
```

- **空状态**（无 snapshot）：显示一个带边框占位区域 + 「点击开始绘图」按钮，点击后初始化空画板
- **有内容**：渲染 `<TldrawCanvas>` 高度 300px（或按 width 比例）
- **工具栏按钮**（复用 `useNodeToolbarNav` hook）:
  - 左对齐 / 居中对齐
  - **放大编辑**（Maximize2 图标）→ 打开模态窗口
- **缩放手柄**：复用 `useNodeResize` hook，拖拽改变 `width` 属性
- **数据保存**：`onChange` 回调 → `updateAttributes({ snapshot: json })`，debounce 防抖

**放大编辑交互**：
```typescript
const [isModalOpen, setIsModalOpen] = useState(false);
// 工具栏按钮 onClick={() => setIsModalOpen(true)}
// 模态关闭后 updateAttributes({ snapshot: modalSnapshot })
```

### 5. TldrawEditorModal — `src/components/TldrawEditorModal.tsx`

全屏模态编辑窗口：

```
┌─ 固定全屏遮罩（z-[9999]） ─────────────────────────┐
│  ┌─ 模态容器（m-6, rounded-xl, overflow-hidden） ──┐│
│  │  顶栏: [标题] ──────────────────── [✕ 关闭]      ││
│  ├──────────────────────────────────────────────────┤│
│  │                                                  ││
│  │        全尺寸 tldraw 画板（flex-1）               ││
│  │        完整工具栏 + 缩放控制                      ││
│  │                                                  ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

- **Props**: `{ open, initialSnapshot, onClose, onSave(snapshotJson) }`
- 使用 React `createPortal` 挂到 `document.body`，避免被编辑器的 `contentEditable` 拦截事件
- `open` 为 true 时渲染，否则返回 null
- 画板占满模态区域（`min-h-[70vh]`），充分利用屏幕空间
- 按 `Escape` 或点击关闭按钮 → `onSave(latestSnapshot)` + `onClose()`

### 6. 数据适配器 — `src/lib/tiptapAdapter.ts`

在现有映射函数中增加 diagram 双向转换：

```typescript
// ourTypeToTiptapType
case 'diagram': return 'diagramBlock';

// tiptapTypeToOurType
case 'diagramBlock': return 'diagram';

// ourBlockToTiptapJSON — case 'diagram'
json.attrs = {
  snapshot: block.properties?.diagramSnapshot ?? '',
  width: block.properties?.diagramWidth ?? null,
  align: block.properties?.diagramAlign ?? 'center',
};

// tiptapJSONToOurBlock — case 'diagram'
block.content = [];
block.properties = {
  diagramSnapshot: typeof attrs.snapshot === 'string' ? attrs.snapshot : '',
  diagramWidth: typeof attrs.width === 'number' ? attrs.width : undefined,
  diagramAlign: attrs.align === 'left' ? 'left' : 'center',
};
```

### 7. Slash 命令 — `src/lib/tiptapExtensions.tsx`

在 `slashCommands` 数组中（Table 之后、Divider 之前）插入：

```typescript
{
  title: 'Diagram',
  description: '绘制架构图、流程图、需求图',
  icon: '▦',  // 或用一个更合适的字符
  aliases: ['diagram', 'draw', 'tldraw', '画板', '架构图', '流程图', '需求图'],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setDiagram().run(),
},
```

### 8. BlockEditor 注册 — `src/components/BlockEditor.tsx`

```typescript
import { TldrawExtension } from '../lib/tldrawExtension';
// ...
extensions: [
  // ... 现有扩展
  TldrawExtension,   // ← 新增
],
```

### 9. 样式 — `src/styles/tldraw-block.css`

- 嵌入式画板容器：`border`, `rounded-lg`, `overflow: hidden`, VSCode 主题变量
- 工具栏样式：复用 `.link-block-toolbar` 的设计模式
- 模态遮罩：`fixed inset-0 z-[9999] bg-black/50 flex`
- 确保在 `index.css` 中引入 tldraw 的 CSS（如果需要）

**tldraw CSS 引入**：在 `src/main.tsx` 或 `src/index.css` 顶部添加：
```css
@import '@tldraw/tldraw/tldraw.css';
```
（需验证 tldraw v5 的确切 CSS 导入路径）

---

## 关键技术决策

### 为什么数据存在节点属性（而非文件系统）

tldraw snapshot 是一个紧凑的 JSON 字符串，通常几十 KB。存为节点属性意味着：
- **自包含**：复制块 / 导出文档时数据完整跟随
- **无需文件管理**：不增加资源文件的 CRUD 复杂度
- **与现有模式一致**：table 块也是将结构存在 properties 中

如果未来用户画特别复杂的图导致 snapshot 过大（>500KB），可以再考虑迁移到文件系统存储。

### 为什么用模态而非原生 WebviewWindow

项目已有的 `PreviewWindowApp` + WebviewWindow 机制主要用于网页预览（需要真实浏览器引擎）。tldraw 是纯前端 React 组件，用 **React 模态** 更合适：
- 数据传递简单（props 回调，无需 IPC 序列化）
- 关闭时直接 `onSave` 回调，无跨窗口同步延迟
- 不增加 Rust 端命令

### tldraw 的 dark mode

tldraw 支持暗色模式。需检测项目当前的 `.dark` CSS 类，传给 `<Tldraw>` 的 `preferences` 属性（或使用 `defaultUserPreferences`）。

---

## 实施顺序

1. ✅ 类型定义（`document.ts`）
2. ✅ tldraw CSS 引入（`index.css`）
3. ✅ TldrawCanvas 组件（可复用画板）
4. ✅ TldrawEditorModal 组件（全屏模态）
5. ✅ TldrawView 组件（NodeView + 嵌入式）
6. ✅ TldrawExtension（TipTap Node）
7. ✅ tiptapAdapter 双向转换
8. ✅ Slash 命令注册
9. ✅ BlockEditor 扩展注册
10. ✅ 样式文件
11. ✅ 构建验证（`npx tsc --noEmit` + `npm run build`）

---

## 风险与注意事项

1. **tldraw 与 TipTap 的事件冲突**：tldraw 内部有大量 pointer/keyboard 事件，必须确保 tldraw 容器 `contentEditable={false}`，阻止事件冒泡到 ProseMirror
2. **bundle 体积**：tldraw 较大（~2MB gzip），但已是依赖项，确认 Vite 能正确 tree-shake
3. **CSS 隔离**：tldraw 注入大量全局样式（`.tl-*` 前缀），需验证不破坏编辑器现有样式
4. **首次渲染性能**：tldraw 首次挂载较重，NodeView 需懒加载或在 visible 时才初始化
