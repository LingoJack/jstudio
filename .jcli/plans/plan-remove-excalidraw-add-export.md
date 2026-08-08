# 方案：移除 Excalidraw 遗留引擎 + 添加导出 PNG/SVG 功能

## Part 1：移除 Excalidraw 遗留引擎

### 删除文件（2 个）

1. **`src/components/editor/nodes/ExcalidrawCanvas.tsx`** - 整个 Excalidraw 封装组件，不再需要
2. **`src/components/editor/hooks/useDiagramRenderer.ts`** - 唯一职责是检测快照格式以决定是否走 Excalidraw，移除后不再需要

### 修改文件（11 个）

#### 1. `src/components/editor/nodes/DiagramBlockView.tsx`
- 删除 `import { ExcalidrawCanvas }`
- 删除 `import { useDiagramRenderer }`
- 删除 `const { useLegacyExcalidraw } = useDiagramRenderer(snapshot);`
- 渲染区从三元判断改为直接渲染 `<GraphCanvas>`
- 顶部注释 `excalidraw` -> `diagram (jgraph)`
- 同步更新 `useDiagramEditMode` 返回的变量名（见第 11 项）

#### 2. `src/components/windows/DiagramWindowApp.tsx`
- 删除 `import { ExcalidrawCanvas }`
- 删除 `import { detectSnapshotKind }`
- 渲染区从 `detectSnapshotKind(...) === 'excalidraw' ? <ExcalidrawCanvas/> : <GraphCanvas/>` 改为直接 `<GraphCanvas/>`
- 顶部注释更新

#### 3. `src/components/editor/nodes/graph/graphSnapshot.ts`
- `SnapshotKind` 类型移除 `'excalidraw'` 成员，简化为 `'empty' | 'jgraph' | 'unknown'`
- `detectSnapshotKind()` 移除 Excalidraw 特征检测分支（`elements` 数组 / `type === 'excalidraw'`）
- 顶部注释和兼容策略说明中移除 Excalidraw 相关描述

#### 4. `src/index.css`
- 删除 `@import "@excalidraw/excalidraw/index.css";`

#### 5. `src/styles/vscode-theme.css`（约 3309-3347 行）
- 删除所有 `.excalidraw` 相关 CSS 规则（隐藏 UI 元素、`.excalidraw-canvas-root` 等）
- **保留** `.diagram-window-loading`、`.diagram-window-error`、`@keyframes diagram-spin`（DiagramWindowApp 仍在用）

#### 6. `src/lib/editor/slashMenu/commands/diagram.ts`
- aliases 数组移除 `'excalidraw'`

#### 7. `src/types/document.ts`
- 注释 `Diagram (excalidraw)` -> `Diagram (jgraph)`
- 注释 `Serialized excalidraw scene JSON string` -> `Serialized diagram snapshot JSON string`

#### 8. `src/components/editor/hooks/useNodeToolbarNav.ts`
- 注释中的 `Excalidraw` 引用更新为通用描述（第 23、252-253 行等）

#### 9. `src/components/editor/nodes/graph/GraphCanvas.tsx`
- 顶部注释中"与 ExcalidrawCanvas 完全同签名"、"与 Excalidraw 的关键差异"等描述更新

#### 10. `package.json`
- 移除 `"@excalidraw/excalidraw": "^0.18.1"` 依赖

#### 11. `src/components/editor/hooks/useDiagramEditMode.ts`
- 变量名 `excalidrawRootRef` -> `rootRef`，`handleExcalidrawRoot` -> `handleRootRef`
- 接口 `UseDiagramEditModeResult` 中字段同步重命名
- 第 31 行 `querySelector('.excalidraw')` 移除（GraphCanvas 无此 class），直接聚焦 `root`
- 顶部注释移除 Excalidraw 引用
- DiagramBlockView 调用处同步更新

---

## Part 2：添加导出 PNG / SVG 功能

### 新建文件（1 个）

**`src/lib/export/download.ts`** - 通用下载工具

```ts
/** 触发浏览器下载（Tauri webview 兼容） */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 下载 SVG 字符串 */
export function downloadSvg(svgString: string, filename: string): void {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  downloadBlob(blob, filename);
}
```

### 修改文件（1 个）

**`src/components/editor/nodes/graph/GraphCanvas.tsx`**

#### 新增导出逻辑

```ts
// 导出 SVG：克隆容器内的 <svg>，计算内容包围盒，设置 viewBox
const handleExportSvg = useCallback(() => {
  const container = containerRef.current;
  const graph = graphRef.current;
  if (!container || !graph) return;
  
  const svg = container.querySelector('svg');
  if (!svg) return;
  
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // 计算所有 cell 的包围盒
  const bounds = graph.getBounds(graph.getChildCells(graph.getDefaultParent()));
  if (bounds) {
    const padding = 20;
    clone.setAttribute('viewBox', `${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`);
    clone.setAttribute('width', String(bounds.width + padding * 2));
    clone.setAttribute('height', String(bounds.height + padding * 2));
  }
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  
  const svgString = new XMLSerializer().serializeToString(clone);
  downloadSvg(svgString, `diagram-${Date.now()}.svg`);
  setMoreMenuOpen(false);
}, []);

// 导出 PNG：SVG -> data URL -> canvas -> blob
const handleExportPng = useCallback(() => {
  // 先生成 SVG string（同上逻辑），然后：
  // const img = new Image();
  // img.onload = () => { canvas.drawImage(img); canvas.toBlob(...); };
  // 需要处理跨域和 background
}, []);
```

#### UI：在"更多"菜单中添加导出选项

在现有"AI 生成图表"按钮下方加分隔线 + 两个导出按钮：

```tsx
<div className="jgraph-dropdown-sep" />
<button className="jgraph-dropdown-item" title="导出为 PNG" onClick={handleExportPng}>
  <Download size={16} />
  <span>导出 PNG</span>
</button>
<button className="jgraph-dropdown-item" title="导出为 SVG" onClick={handleExportSvg}>
  <Download size={16} />
  <span>导出 SVG</span>
</button>
```

需要从 lucide-react 新增导入 `Download` 图标。

### 关键技术点

1. **SVG 导出**：maxGraph 容器内有一个 `<svg>` 元素，直接 `cloneNode` + `XMLSerializer` 序列化即可。需用 `graph.getBounds()` 计算内容包围盒并设置 `viewBox`，否则导出的 SVG 坐标系不对。

2. **PNG 导出**：把 SVG 序列化为 `data:image/svg+xml;base64,...`，用 `Image` 加载后绘制到 `<canvas>`，再 `canvas.toBlob()` 转 PNG。需要注意 maxGraph 的 SVG 中可能引用了外部 CSS，导出前需要把关键样式内联。

3. **背景色**：导出时根据 `darkMode` 设置 SVG 背景（白/黑），避免透明背景在浅色环境下不可见。

4. **只读态也可导出**：导出按钮放在"更多"菜单里，而"更多"菜单只在 `editing` 态显示。如果要支持只读态导出，需额外在 DiagramBlockView 的浮动工具栏也加一个导出按钮。本次先只在编辑态的"更多"菜单中提供，因为独立窗口（DiagramWindowApp）始终是编辑态，内嵌块可以点"编辑"进入后再导出。

---

## 实施顺序

1. 先删除 ExcalidrawCanvas.tsx 和 useDiagramRenderer.ts
2. 修改所有引用文件，移除 Excalidraw 路由
3. 清理 CSS 和 package.json
4. 运行 `npm run build` 确认编译通过
5. 新建 download.ts 工具
6. 在 GraphCanvas 添加导出逻辑和 UI
7. 再次 build 验证
