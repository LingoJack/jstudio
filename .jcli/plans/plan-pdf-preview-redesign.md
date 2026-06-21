# PDF 预览重新设计方案

## 问题分析

当前 PDF 预览直接使用 `<iframe src={dataUrl}>` — 浏览器原生 PDF Viewer。这导致：

1. **无法双指缩放** — 浏览器原生 Viewer 不响应 trackpad pinch 手势
2. **内部按钮丑陋** — 原生 Viewer 有自己的下载/打印/缩放工具栏，与应用 VSCode 暗色主题完全不一致
3. **无法定制** — 不能隐藏/替换原生工具栏，不能集成暗色模式
4. **选中态冲突** — 需要透明遮罩层 workaround（iframe 吞掉鼠标事件）

## 方案：引入 `react-pdf`（wojtekmaj/react-pdf）

**不是自己实现的组件** — 当前就是一个裸 `<iframe>` 标签。换成 `react-pdf` 是行业标配方案（11K+ stars，基于 Mozilla pdf.js）。

它把 PDF 每页渲染成 `<canvas>`，我们获得 100% 的 UI 控制权。

### 新增依赖
- `react-pdf` (v9.x，兼容 React 19)
- `pdfjs-dist` (react-pdf 的底层依赖，自动安装)

### pdf.js Worker 配置（Vite）

在 `PdfPreview` 组件顶层设置：
```ts
import { pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```
Vite 原生支持 `new URL(..., import.meta.url)` 语法，无需额外插件。

### 改动文件清单

| 文件 | 改动 |
|------|------|
| `package.json` | 新增 `react-pdf` 依赖 |
| **`src/components/PdfPreview.tsx`** (新建) | 核心预览组件 |
| `src/components/FileView.tsx` | `category === 'pdf'` 时渲染 `<PdfPreview>` 替代 `<iframe>` |
| `src/components/PreviewWindowApp.tsx` | `category === 'pdf'` 时渲染 `<PdfPreview>` 替代 `<iframe>` |
| `src/styles/vscode-theme.css` | 新增 PDF 预览相关样式 |

### PdfPreview 组件设计

```
┌──────────────────────────────────────────┐
│  ←  3/12  →    🔍− 100% 🔍+   ⤢ 适配宽度  │  ← 自定义工具栏（VSCode 风格）
├──────────────────────────────────────────┤
│                                          │
│         ┌──────────────┐                │
│         │              │                │
│         │   PDF 页面    │  ← canvas 渲染 │
│         │  (第 3 页)    │               │
│         │              │                │
│         └──────────────┘                │
│                                          │
├──────────────────────────────────────────┤
│  (拖拽区域：Ctrl+滚轮缩放 / 双指捏合)      │
└──────────────────────────────────────────┘
```

**交互能力：**
- **Ctrl/⌘ + 滚轮**：缩放（0.5x ~ 4x）
- **双击**：重置缩放到适配宽度
- **工具栏按钮**：上/下翻页、缩放、适配宽度
- **键盘**（选中时）：方向键翻页
- **加载态**：Spinner + "正在加载 PDF…"

**Props：**
```ts
interface PdfPreviewProps {
  src: string;           // data URL 或文件 URL
  className?: string;
  fillContainer?: boolean; // 在 FileView 内联时 false（有 resize handle），
                           // 在 PreviewWindow 时 true（撑满窗口）
}
```

**懒加载**：`PdfPreview` 用 `React.lazy()` 引入，只在首次遇到 PDF 块时加载 pdf.js（约 300KB），不影响首屏性能。

### 为什么不用其他方案

| 方案 | 否决原因 |
|------|----------|
| 保留 `<iframe>` + CSS hack | 无法控制原生 Viewer 的 UI 和手势 |
| 直接用 `pdfjs-dist` 不包 react | 需要手写 canvas 渲染/页面管理/文本层，重复造轮子 |
| `@react-pdf/renderer` | 这是**生成** PDF 的库，不是预览库 |
