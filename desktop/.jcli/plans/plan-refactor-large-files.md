# 大文件拆分重构计划

## 目标

将三个职责过于集中、行数过大的文件拆分为高内聚低耦合的模块，在不改变任何运行时行为的前提下提升可维护性。同时消除跨组件的重复逻辑（侧边栏 hover 展开代码、内联浮动菜单 JSX）。

**执行顺序**：

1. **Step 0**：消除侧边栏 hover 重复逻辑（AgentSidebar + BrowserSidebar 改用共享 `useSidebarHover`）
2. **Step 1**：提取 AgentSidebar / BrowserSidebar 内联菜单为独立组件
3. **Step 2**：useGraphInit.ts 拆分
4. **Step 3**：DocumentSidebar.tsx 拆分（含内联菜单提取）
5. **Step 4**：EditorCursorTrail.ts 拆分

**核心原则**：
- 纯提取，零行为变更
- 每个拆出的模块单一职责
- 保持现有导入路径不变（通过 barrel re-export）
- 每拆一个模块后立即 `npm run build` 验证

---

## Step 0：消除侧边栏 hover 重复逻辑

### 问题

项目已有共享 hook `src/components/documents/hooks/useSidebarHover.ts`（136 行），`DocumentSidebar` 已使用。但：

- **`AgentSidebar.tsx`**（655 行）内联了一套 hover 逻辑（248~331 行，~80 行）：`hoverExpanded` state、`hoverCollapseTimer` ref、`isSidebarHovered` ref、`scheduleCollapse`、`handleHoverEnter/Leave`、`leftPanelHovered` effect、`suppressCollapse` 重新评估 effect —— 与 `useSidebarHover` 几乎完全相同，注释中甚至写着"mirrors DocumentSidebar"。
- **`BrowserSidebar.tsx`**（324 行）内联了简化版 hover 逻辑（63~127 行，~60 行）：`expanded` state、`collapseTimer` ref、`isSidebarHovered` ref、`handleEnter/Leave`、`leftPanelHovered` effect —— 逻辑一致但变量名不同。

三处合计约 160 行重复代码。

### 方案

#### 0-A：泛化 `useSidebarHover` hook

当前 `useSidebarHover` 要求 `sidebarPinned` + `toggleSidebarPinned` 参数。BrowserSidebar 没有钉住概念，需要将这两个参数改为可选：

```ts
// src/components/documents/hooks/useSidebarHover.ts 修改
export interface UseSidebarHoverParams {
  leftPanelHovered: boolean;
  suppressCollapse?: boolean;        // 新增可选，默认 false
  sidebarPinned?: boolean;           // 改为可选，默认 false
  toggleSidebarPinned?: () => void;  // 改为可选，默认 no-op
}
```

- `handleHoverEnter` / `handleHoverLeave` 中 `if (sidebarPinned) return` 改为 `if (sidebarPinned ?? false) return`
- `handleTogglePin` 仅在 `toggleSidebarPinned` 存在时调用
- `leftPanelHovered` effect 和 `suppressCollapse` effect 中的 `sidebarPinned` 检查同样用 `?? false`
- 默认 `suppressCollapse = false`

**对 DocumentSidebar 的影响**：零。它已传入所有参数，行为不变。

#### 0-B：AgentSidebar 改用 `useSidebarHover`

删除 248~331 行的内联 hover 逻辑，替换为：

```tsx
const anyFloatingMenuOpen = !!workspaceMenuPos || !!expandGroup;
const suppressCollapse = anyFloatingMenuOpen || showWorkspaceModal;

const {
  hoverExpanded,
  handleHoverEnter,
  handleHoverLeave,
  handleTogglePin,
} = useSidebarHover({
  sidebarPinned,
  leftPanelHovered,
  toggleSidebarPinned,
  suppressCollapse,
});
```

保留 `isCollapsed` / `effectiveWidth` / `isOverlay` / `overlayShift` 派生计算（这些是组件特定逻辑，不属于 hook）。

#### 0-C：BrowserSidebar 改用 `useSidebarHover`

删除 63~127 行的内联 hover 逻辑，替换为：

```tsx
const { hoverExpanded: expanded } = useSidebarHover({
  leftPanelHovered,
});
```

BrowserSidebar 没有 `sidebarPinned` / `toggleSidebarPinned` / `suppressCollapse`，全部使用默认值。

### 验证
- `npm run build` 通过
- 手动测试三个侧边栏：hover 展开/收起、pin 钉住、ActivityBar 联动、打开菜单时不会收起、菜单关闭后正确判断鼠标位置
- Git commit

---

## Step 1：提取 AgentSidebar / BrowserSidebar 内联菜单

### 问题

- **AgentSidebar.tsx** 579~628 行：workspace dropdown MenuList 内联在 render 中（~50 行 JSX）
- **BrowserSidebar.tsx** 270~318 行：tab context menu 内联在 render 中（~50 行 JSX），且用了 IIFE 包裹 `tabs.find()` 查找

### 方案

#### 1-A：`AgentWorkspaceMenu.tsx`

```
src/components/agent/
├── AgentSidebar.tsx
├── WorkspaceList.tsx
├── WorkspaceSelectModal.tsx    # Step 3 中提取
└── AgentWorkspaceMenu.tsx      # 新建
```

```tsx
interface AgentWorkspaceMenuProps {
  x: number;
  y: number;
  existingWorkspaces: string[];
  activeAgentWorkspace: string;
  onOpenDirectory: () => void;
  onClearWorkspace: () => void;
  onSelectWorkspace: (ws: string) => void;
}
```

提取 579~628 行的 MenuList JSX。

#### 1-B：`BrowserTabContextMenu.tsx`

```
src/components/panels/
├── BrowserSidebar.tsx
└── BrowserTabContextMenu.tsx    # 新建
```

```tsx
interface BrowserTabContextMenuProps {
  x: number;
  y: number;
  tab: LinkPreviewTabInfo | undefined;
  onRefresh: (tabId: string) => void;
  onOpenInBrowser: (url: string) => void;
  onClose: (tabId: string) => void;
}
```

提取 270~318 行的 MenuList JSX（消除 IIFE，tab 查找在组件外完成后传入）。

### 验证
- `npm run build` 通过
- 手动测试：workspace 下拉菜单切换/打开目录/清除、tab 右键刷新/打开/关闭
- Git commit

---

## Step 2：useGraphInit.ts（1016 行 -> ~120 行 + 10 个子模块）

### 问题

整个文件是一个 `useEffect(() => { ... }, [])`，函数体 870 行，编排了 18 种不同职责。任何 bug 修复都需通读全文。

### 拆分策略

将 effect 体拆为多个独立的 setup 函数，每个接收 `graph` + 相关 refs/params，返回一个 cleanup 函数。主 `useEffect` 只负责创建 graph、依次调用各 setup、收集并执行 cleanup。

### 目录结构

```
src/components/editor/nodes/graph/
├── useGraphInit.ts          # 主 hook（~120 行）：创建 graph + 组合各 setup + cleanup
├── graphSetup/              # 新建子目录
│   ├── index.ts             # barrel re-export
│   ├── types.ts             # GraphSetupContext 接口（共享的 refs/params 类型）
│   ├── edgeFlowAnimation.ts # 边流动动画 + 阈值控制（原 158~208 行）
│   ├── vertexHandlers.ts    # VertexHandler.createSizerShape / createSelectionShape 覆写（原 242~281 行）
│   ├── connectionHandlers.ts# ConnectionHandler 配置：锚点图、容差、高亮、预览样式（原 283~399 行）
│   ├── interactionConfig.ts # isCloneEvent / rubberband / panning / grid / selectionHandler（原 417~459 行）
│   ├── borderHitTest.ts     # updateMouseEvent 覆写：边框命中穿透（原 461~494 行）
│   ├── defaultStyles.ts     # 默认 vertex/edge 样式表 + getAllConnectionConstraints（原 496~573 行）
│   ├── eventListeners.ts    # UndoManager + CHANGE + selection CHANGE + SCALE/TRANSLATE + CELLS_RESIZED + DOUBLE_CLICK（原 575~675 行）
│   ├── snapshotLoad.ts      # 初始快照灌入 + showGrid/autoActivation 同步（原 677~701 行）
│   ├── dragDraw.ts          # 拖拽绘制：SVG 预览 + mousedown/move/up + finishDraw（原 703~914 行）
│   └── wheelZoom.ts         # 滚轮缩放/平移 + ResizeObserver（原 916~992 行）
```

### 各模块详情

#### `graphSetup/types.ts`
```ts
export interface GraphSetupContext {
  graph: Graph;
  container: HTMLDivElement;
  graphRef: RefObject<Graph | null>;
  darkModeRef: RefObject<boolean>;
  autoActivationRef: RefObject<boolean>;
  applyingRef: RefObject<boolean>;
  showGridRef: RefObject<boolean>;
  pendingShapeRef: RefObject<GraphNodeShape | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  updateFlowAnimationRef: RefObject<(() => void) | null>;
  scheduleEmit: () => void;
  setShowGrid: (v: boolean) => void;
  setAutoActivation: (v: boolean) => void;
  setSelectedLabelAlign: (v: 'left' | 'center' | 'right' | null) => void;
  setSelectedFillColor: (v: string | null) => void;
  setSelectedSeqEdge: (v: 'call' | 'return' | null) => void;
  setFillPickerOpen: (v: boolean) => void;
  setPending: (shape: GraphNodeShape | null) => void;
}
// 每个 setup 函数签名：(ctx: GraphSetupContext) => (() => void) | void
```

#### `graphSetup/edgeFlowAnimation.ts`（~55 行）
- 覆写 `cellRenderer.initializeShape`：给 edge SVG `<g>` 加 `.jgraph-edge` 类，创建圆点 `<path>`
- 覆写 `shape.redraw`：redraw 后重新追加圆点 path 并同步 `d` 属性
- 设置 `updateFlowAnimationRef.current`：根据边数 toggle `.jgraph-flow-off`

#### `graphSetup/vertexHandlers.ts`（~45 行）
- `VertexHandler.prototype.createSizerShape`：圆形手柄（旋转手柄保持椭圆）
- `VertexHandler.prototype.createSelectionShape`：按节点形状显示选中框

#### `graphSetup/connectionHandlers.ts`（~120 行）
- ConnectionHandler.constraintHandler 配置：pointImage、highlightColor、getImageForConstraint、getTolerance、createHighlightShape
- ConnectionHandler 连线预览：livePreview、createEdgeState、getEdgeColor、drawPreview
- attachSequenceInteraction 调用

#### `graphSetup/interactionConfig.ts`（~45 行）
- `graph.isCloneEvent`（Cmd/Ctrl 拖动复制）
- RubberBandHandler.isForceRubberbandEvent -> false
- PanningHandler.isForcePanningEvent（Alt 拖动平移）
- 网格 + centerZoom + SelectionHandler guides

#### `graphSetup/borderHitTest.ts`（~35 行）
- `graph.updateMouseEvent` 覆写：点击图形内部穿透选中下层

#### `graphSetup/defaultStyles.ts`（~80 行）
- 默认 vertex 样式（fillColor、strokeColor、fontColor 等）
- 默认 edge 样式（edgeStyle、rounded、endArrow 等）
- `graph.getAllConnectionConstraints`：lifeline/activation/普通节点连接点分布

#### `graphSetup/eventListeners.ts`（~105 行）
- UndoManager 创建 + UNDO 事件监听
- CHANGE -> scheduleEmit + updateFlowAnimation
- selection CHANGE -> 更新对齐/填充色/时序消息按钮状态
- SCALE/TRANSLATE/SCALE_AND_TRANSLATE -> scheduleEmit
- CELLS_RESIZED -> text 形状字号按比例缩放
- DOUBLE_CLICK -> 空白处自适应

#### `graphSetup/snapshotLoad.ts`（~30 行）
- parseGraphSnapshot + applySnapshotToGraph + batchUpdate
- 同步 showGrid / autoActivation 组件状态
- undoManager.clear()
- updateFlowAnimationRef.current()

#### `graphSetup/dragDraw.ts`（~215 行）
- SVG 预览元素创建
- ensurePreviewShape / applyPreviewSize
- onMouseDown / onMouseMove / finishDraw
- 诊断日志 onMouseUpDiag
- 返回 cleanup：removeEventListener + preview.remove()

#### `graphSetup/wheelZoom.ts`（~80 行）
- onWheel：Ctrl/Cmd+滚轮缩放（光标锚点）+ 普通滚轮平移
- ResizeObserver：sizeDidChange + 防抖 fitCenter
- 返回 cleanup：removeEventListener + resizeObs.disconnect()

#### 主 `useGraphInit.ts`（~120 行）
```ts
export function useGraphInit(params: UseGraphInitParams) {
  // 解构 params
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    InternalEvent.disableContextMenu(container);

    const graph = new Graph(container, undefined, [...getDefaultPlugins(), RubberBandHandler]);
    graphRef.current = graph;

    // 注册自定义形状
    registerCustomShapes();
    registerObstacleEdgeStyle();
    registerMindmapEdgeStyle();

    // 基本交互
    graph.setPanning(true);
    graph.setConnectable(true);
    // ... (setCellsEditable, setAllowDanglingEdges, etc.)

    // 主题配置
    const dark = darkModeRef.current;
    HandleConfig.size = HANDLE_SIZE;
    // ...

    const ctx: GraphSetupContext = { graph, container, /* ... all refs/params */ };

    // 依次调用各 setup，收集 cleanup
    const cleanups = [
      setupEdgeFlowAnimation(ctx),
      setupVertexHandlers(ctx),
      setupConnectionHandlers(ctx),
      setupInteractionConfig(ctx),
      setupBorderHitTest(ctx),
      setupDefaultStyles(ctx),
      setupEventListeners(ctx),
      setupSnapshotLoad(ctx),
      setupDragDraw(ctx),
      setupWheelZoom(ctx),
    ].filter(Boolean) as (() => void)[];

    return () => {
      cleanups.forEach(fn => fn());
      // 最终清理
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        emitSnapshot();
      }
      graph.destroy();
      graphRef.current = null;
      undoManagerRef.current = null;
    };
  }, []);
}
```

### 验证点
- `GraphCanvas.tsx` 的 `useGraphInit(...)` 调用不变（参数接口 `UseGraphInitParams` 保持不变）
- `npm run build` 通过
- 手动测试：创建图形、拖拽绘制、连线、缩放、平移、撤销/重做、时序图交互
- Git commit

---

## Step 3：DocumentSidebar.tsx（1086 行 -> ~280 行 + 5 个子模块）

### 问题

40+ 个 useStore 调用、10+ 个 UI 状态、文件 I/O 处理函数、5 个内联浮动菜单、递归树渲染，全部挤在一个组件中。

### 拆分策略

提取操作处理函数为自定义 hook，提取内联菜单 JSX 为独立组件，提取渲染辅助函数。组件本身只保留状态声明 + 组合 + 主 render 骨架。

### 目录结构

```
src/components/documents/
├── DocumentSidebar.tsx          # 主组件（~280 行）：状态声明 + 组合 hooks + render 骨架
├── DocumentSidebarMoreMenu.tsx  # 新建：More 下拉菜单（New/Import/Sort/Trash 子菜单）
├── DocumentSidebarMenus.tsx     # 新建：FolderContextMenu + BatchMenu + BatchMoveMenu
├── DocumentTreeRenderer.tsx     # 新建：renderDoc + renderNode + renderSearchResults
├── hooks/
│   ├── useSidebarHover.ts       # 已有（Step 0 中泛化）
│   ├── useSidebarResize.ts      # 已有
│   ├── useBatchSelection.ts     # 已有
│   ├── useDocDragDrop.ts        # 已有
│   └── useDocSidebarActions.ts  # 新建：文件系统操作（import/export/copy/path）
```

### 各模块详情

#### `hooks/useDocSidebarActions.ts`（~120 行）
提取所有文件系统 / import / export 处理函数为一个 hook，返回处理函数集合：
- `handleOpenInFinder`
- `handleCopyPath`
- `handleCopyRelativePath`
- `handleImportMarkdown`
- `handleImportMarkdownDirectory`
- `handleExportBundle`
- `handleImportBundle`
- `handleCopyAsMarkdown`

输入参数：`importDocumentFromMarkdown`, `importMarkdownDirectory`, `exportDocumentBundle`, `importDocumentBundle`, `addToast`, `tRef`

#### `DocumentSidebarMoreMenu.tsx`（~110 行）
提取 More 下拉菜单（原 768~874 行）为独立组件：
```tsx
interface MoreMenuProps {
  x: number;
  y: number;
  docSortKey: string;
  docSortDirection: string;
  onNewDocument: () => void;
  onNewFolder: () => void;
  onImportMarkdown: () => void;
  onImportDirectory: () => void;
  onImportBundle: () => void;
  onSortByKey: (key: 'created' | 'title') => void;
  onSortByDirection: (dir: 'asc' | 'desc') => void;
  onOpenTrash: () => void;
}
```

#### `DocumentSidebarMenus.tsx`（~120 行）
合并三个较小的浮动菜单：
- `FolderContextMenu`（原 933~992 行）
- `BatchContextMenu`（原 1020~1045 行）
- `BatchMoveMenu`（原 1047~1072 行）

每个导出为独立组件，通过 props 接收位置和回调。

#### `DocumentTreeRenderer.tsx`（~200 行）
提取递归树渲染逻辑：
```tsx
interface TreeRendererProps {
  tree: FolderTreeNode;
  folders: Folder[];
  activeDocId: string | null;
  selectedIds: Set<string>;
  renamingId: string | null;
  renameValue: string;
  renamingFolderId: string | null;
  folderRenameValue: string;
  draggingDocId: string | null;
  dragOverTarget: string | null;
  flashFolderId: string | null;
  // callbacks...
  onDocPointerDown, onDocClick, onContextMenu, onDocDoubleClick,
  onFolderClick, onFolderContextMenu, onFolderDoubleClick,
  onRenameChange, onCommitRename, onFolderRenameChange, onCommitFolderRename,
}
```
导出 `DocumentTreeRenderer` 和 `SearchResultsList` 两个组件。

#### 主 `DocumentSidebar.tsx`（~280 行）
- 状态声明（保留）
- 组合 `useDocSidebarActions` hook
- 组合已有的 `useSidebarHover` / `useBatchSelection` / `useDocDragDrop`
- 渲染骨架：collapsed mode | header + search + `<DocumentSidebarMoreMenu>` | tree list `<DocumentTreeRenderer>` | `<DocumentSidebarMenus>` | dialogs | resize handle

### 验证点
- 所有导入 `DocumentSidebar` 的文件路径不变（default export 保持）
- `npm run build` 通过
- 手动测试：搜索、新建文档/文件夹、导入导出、右键菜单、批量操作、拖拽、rename、pin/hover 展开
- Git commit

---

## Step 4：EditorCursorTrail.ts（1388 行 -> ~450 行 + 4 个子模块）

### 问题

单类 1388 行，混合了光标轨迹渲染、DOM Selection/Range 测量、文本节点遍历、字形测量、原生 input/textarea caret 镜像测量、blink 动画、glyph overlay 管理等多种职责。

### 拆分策略

将纯函数性质的 DOM 工具（文本节点遍历、字形测量、坐标转换）提取到独立模块。类本身保留状态管理和 BaseCursorTrail 生命周期方法。原生 caret 测量逻辑提取到独立模块。

### 目录结构

```
src/components/ui/cursor/
├── EditorCursorTrail.ts       # 主类（~450 行）：状态 + 生命周期 + updateTarget + render
├── BaseCursorTrail.ts         # 不变
├── trailMath.ts               # 不变
├── shaders.ts                 # 不变
├── editorCaretUtils.ts        # 新建：纯 DOM 工具函数（文本节点遍历 + 字形测量 + 坐标转换）
├── nativeCaretMirror.ts       # 新建：原生 input/textarea caret 镜像测量
├── editorBlink.ts             # 新建：blink 动画计算
└── editorCursorTrailTypes.ts  # 新建：共享类型（GlyphFont 等）
```

### 各模块详情

#### `editorCursorTrailTypes.ts`（~15 行）
```ts
export interface GlyphFont {
  fontStyle: string;
  fontWeight: string;
  fontSize: string;
  fontFamily: string;
  letterSpacing: string;
}

export interface MeasuredGlyph {
  width: number;
  onChar: boolean;
  before: boolean;
  cover: { text: string; rect: DOMRect; font: GlyphFont } | null;
}
```

#### `editorBlink.ts`（~30 行）
提取 blink 常量和计算函数：
```ts
export const BLINK_SOLID_MS = 400;
export const BLINK_PERIOD_MS = 700;
export const THROTTLE_FPS = 20;

export function computeBlink(
  cursorVisibleStartTime: number,
  cursorStyle: EditorCursorStyle,
): number { ... }
```

#### `editorCaretUtils.ts`（~350 行）
提取所有纯 DOM 操作函数（不依赖 `this`），接收必要的上下文参数：
- `findAdjacentTextPosition(caret, dir, root)` - 原 findAdjacentTextPosition
- `firstTextNode(node)` / `lastTextNode(node)` - 原文本节点遍历
- `nextTextNode(node, root)` / `previousTextNode(node, root)`
- `measureCodePoint(node, offset, text, dir, cursorStyle, metricsAt)` - 原 measureCodePoint
- `measureGlyphAt(caret, fontSize, root, cursorStyle, metricsAt)` - 原 measureGlyphAt
- `clipPreCaretRect(rect, range)` - 原 clipPreCaretRect
- `toCanvasLocal(rect, fontSize, lineHeight, glyph, cursorStyle, canvas, cssW, cssH)` - 原 toCanvasLocal
- `measureCaretViaTempSpan(lineHeight, clipPre, toCanvasLocal)` - 原 measureCaretViaTempSpan

这些函数全部是纯函数，接收参数而非访问 `this`。`metricsAt` 作为回调传入（因为需要访问 metricsCache）。

#### `nativeCaretMirror.ts`（~200 行）
提取原生 input/textarea caret 镜像测量：
- `syncNativeMirror(input, cs)` - 创建/更新隐藏 mirror div
- `measureNativeCaretRect(input, metricsAt, toCanvasLocal)` - 通过 mirror 测量原生 caret

返回 `{ left, right, top, bottom } | null`。

#### 主 `EditorCursorTrail.ts`（~450 行）
保留：
- 类字段声明（editorEl, scrollContainer, nativeHosts, contentHosts, cursorStyle, dirty, cachedRect, metricsVersion, metricsCache, glyphEl, coveredGlyph, invertColor）
- 构造函数
- `resolveInvertColor()`
- Public API：`setCursorStyle`, `registerNativeCaretHost`, `registerContentCaretHost`, `unregisterNativeCaretHost`, `unregisterContentCaretHost`, `markDirty`, `activate`, `resize`, `invalidateMetrics`, `start`, `stop`, `dispose`
- `shouldThrottle`, `throttleFps`
- `updateTarget` - 调用提取的 `measureCaretRect`
- `getRenderOptions` - 调用提取的 `computeBlink`
- `syncGlyphOverlay`
- `measureCaretRect` - 编排函数：判断 activeEl 类型，调用 `measureNativeCaretRect` 或 DOM Selection 测量路径
- `findContentHost`
- `metricsAt` - 保留在类内（访问 metricsCache）

将 `measureCaretRect` 中调用的子方法委托给 `editorCaretUtils` 和 `nativeCaretMirror` 模块的纯函数。

### 验证点
- 所有导入 `EditorCursorTrail` 的文件路径不变
- `npm run build` 通过
- 手动测试：bar/block/underline 三种光标样式、中英文混排、代码块内 caret、input/textarea caret、blink 动画、section 间焦点切换
- Git commit

---

## 执行顺序与验证流程

### Step 0: 消除侧边栏 hover 重复逻辑
1. 泛化 `useSidebarHover`（`sidebarPinned`/`toggleSidebarPinned`/`suppressCollapse` 改为可选）
2. AgentSidebar 替换内联 hover 逻辑为 `useSidebarHover` 调用
3. BrowserSidebar 替换内联 hover 逻辑为 `useSidebarHover` 调用
4. `npm run build` + 手动测试三个侧边栏
5. Git commit

### Step 1: 提取 AgentSidebar / BrowserSidebar 内联菜单
1. 创建 `AgentWorkspaceMenu.tsx`，提取 workspace dropdown MenuList
2. 创建 `BrowserTabContextMenu.tsx`，提取 tab context menu（消除 IIFE）
3. `npm run build` + 手动测试
4. Git commit

### Step 2: useGraphInit.ts 拆分
1. 创建 `graphSetup/` 目录 + `types.ts`
2. 逐个提取 setup 函数（每提取 2-3 个 build 一次）
3. 重写主 `useGraphInit.ts` 为组合器
4. `npm run build` + 手动测试画布功能
5. Git commit

### Step 3: DocumentSidebar.tsx 拆分
1. 创建 `hooks/useDocSidebarActions.ts`
2. 创建 `DocumentSidebarMoreMenu.tsx`
3. 创建 `DocumentSidebarMenus.tsx`
4. 创建 `DocumentTreeRenderer.tsx`
5. 精简主 `DocumentSidebar.tsx`
6. `npm run build` + 手动测试侧边栏功能
7. Git commit

### Step 4: EditorCursorTrail.ts 拆分
1. 创建 `editorCursorTrailTypes.ts` + `editorBlink.ts`
2. 创建 `editorCaretUtils.ts`（提取纯 DOM 函数）
3. 创建 `nativeCaretMirror.ts`
4. 精简主 `EditorCursorTrail.ts`
5. `npm run build` + 手动测试光标轨迹
6. Git commit

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| useGraphInit setup 函数间有隐式顺序依赖 | 按 effect 体中的原始顺序逐一提取，保持调用顺序一致 |
| editorCaretUtils 纯函数需要访问 metricsCache | 通过回调参数传入 `metricsAt` 函数 |
| 拆分后循环引用 | 所有新模块只依赖底层模块（maxgraph/core、graphTheme 等），不反向依赖 useGraphInit |
| 行为意外变化 | 每步拆分后 build + 手动测试，Git 分步 commit 便于回滚 |
| useSidebarHover 泛化影响 DocumentSidebar | 可选参数有默认值，DocumentSidebar 传入的值不变，行为完全一致 |
