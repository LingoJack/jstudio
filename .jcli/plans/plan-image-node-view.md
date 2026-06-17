# Plan: Image Node View Enhancement

## 需求

1. **占位框**：`/image` 命令先插入一个占位框，允许用户先预留位置，之后可以点击占位框来选择图片文件
2. **边框**：图片需要有边框
3. **调节大小**：支持拖拽调节图片大小
4. **居中**：支持切换图片是否居中显示

## 方案

使用自定义 React NodeView 替换 Tiptap 默认 Image 渲染，配合 Tiptap v3 内置的 resize 能力。

### 1. 扩展 Image 属性 (`src/lib/imageExtension.ts`)

扩展 Tiptap Image，添加 `align` 属性（`'left' | 'center'`），保持原有的 `src`, `alt`, `title`, `width`, `height`。

```ts
// 基于 Image.extend() 添加 align 属性 + ReactNodeViewRenderer
// align: { default: 'center', values: ['left', 'center'] }
```

同时在 `renderMarkdown` / `parseMarkdown` 中保留 width/height/align 信息（存入 HTML 属性或 markdown 扩展语法）。

### 2. Image NodeView 组件 (`src/components/ImageView.tsx`)

```
┌─────────────────────────────────────────┐
│  (选中时显示工具栏)                       │
│  [居中/左对齐切换]                       │
│ ┌───────────────────────────────────┐   │
│ │                                    │   │
│ │              <img>                 │   │
│ │        (可拖拽右下角调大小)          │   │
│ │                                    │   │
│ └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**两种状态**：

- **无 src（占位框）**：显示虚线边框占位区 + "点击选择图片" 文案 + 上传图标，点击触发文件选择对话框
- **有 src（正常图片）**：显示图片，带实线边框；选中时显示对齐切换按钮 + 右下角拖拽 resize 手柄

**核心逻辑**：
- `handlePlaceholderClick()` → 调用 `@tauri-apps/plugin-dialog` 的 `open()` 选文件 → 读取并转 base64 → `updateAttributes({ src, alt })`
- Resize：用一个右下角拖拽手柄，mousedown 开始监听 mousemove，按比例计算新 width → `updateAttributes({ width, height })`
- 对齐切换：`updateAttributes({ align: 'center' | 'left' })`，通过 NodeViewWrapper 的 flex 对齐方式实现
- 边框：CSS 给 img 加 `border: 1px solid var(--vscode-widget-border)` + `border-radius: 8px`

### 3. Slash Menu 改造 (`src/lib/tiptapExtensions.tsx`)

`/image` 命令改为：**先插入占位框**（`setImage({ src: '' })`），不再立即弹文件选择框。用户点击占位框后才选文件。

### 4. CSS 样式 (`src/styles/vscode-theme.css`)

```css
/* 图片占位框 */
.image-node-placeholder { ... }
/* 图片容器（对齐用） */
.image-node-wrapper[data-align="center"] { ... }
/* 图片边框 */
.image-node-wrapper img { border: 1px solid ...; border-radius: 8px; }
/* Resize 手柄 */
.image-resize-handle { ... }
/* 对齐工具栏 */
.image-toolbar { ... }
```

### 5. 数据层适配 (`src/lib/tiptapAdapter.ts`)

`ourBlockToTiptapJSON` / `tiptapJSONToOurBlock` 中 image case 增加 `width`, `height`, `align` 属性的读写（存入 `block.properties`）。

`BlockProperties` 类型新增：
```ts
width?: number;
height?: number;
align?: 'left' | 'center';
```

### 涉及文件

| 文件 | 操作 |
|------|------|
| `src/lib/imageExtension.ts` | **新建** — Image 扩展 + align 属性 + ReactNodeViewRenderer |
| `src/components/ImageView.tsx` | **新建** — React NodeView 组件 |
| `src/lib/tiptapExtensions.tsx` | **修改** — `/image` 改为插入占位框 |
| `src/components/BlockEditor.tsx` | **修改** — 用自定义 ImageExtension 替换原生 Image |
| `src/lib/tiptapAdapter.ts` | **修改** — image case 增加 width/height/align |
| `src/types/document.ts` | **修改** — BlockProperties 增加 width/height/align |
| `src/styles/vscode-theme.css` | **修改** — 添加图片相关样式 |
