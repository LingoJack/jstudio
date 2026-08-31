# Hook / 子组件提取重构计划

## 总体原则

1. **逐个文件、逐个提取单元进行**：每完成一个提取单元（hook 或组件），构建验证通过后立即 commit，用户确认后再进入下一个
2. **纯搬迁，不改逻辑**：不改变任何运行时行为，仅将代码从大组件搬到独立文件
3. **遵循现有模式**：参考 `useGraphExport`（hook）、`LanguageDropdown`（组件）的提取风格
4. **ref + setter 传参**：hook 接收 refs 和 state setters 作为参数，避免引入额外渲染周期
5. **无测试覆盖前提下的安全策略**：每个提取单元都先 `pnpm build` 确认编译通过，再 commit

---

## 优先级排序（风险从低到高）

| 顺序 | 文件 | 行数 | 风险 | 理由 |
|------|------|------|------|------|
| 1 | CodeBlockView.tsx | 714 | 低 | 已有 LanguageDropdown 提取先例；action buttons 纯 JSX 耦合低 |
| 2 | GraphCanvas.tsx | 1910 | 中高 | 已有 useGraphExport/useGraphTheme 先例；GraphToolbar 纯 JSX 可安全提取 |
| 3 | DocumentPanel.tsx | 1276 | 高 | 光标轨迹 + 分段加载涉及大量共享 ref/闭包 |
| 4 | DocumentSidebar.tsx | 1421 | 最高 | 拖拽 + hover 逻辑深度交织，共享 ref 最多 |

---

## 第一步：CodeBlockView.tsx（714 行 → 目标 ~400 行）

### 提取单元 1-A：`useMermaidPreview` hook

**目标文件**：`src/components/editor/nodes/code-block/useMermaidPreview.ts`

**提取内容**：
- `mermaidSvg` / `mermaidError` state
- `mermaidPreviewRef`
- `mermaid.initialize` effect（darkMode 依赖）
- `renderMermaid` effect（showMermaidPreview / mermaidSource / isDarkMode 依赖）
- preview flag reset effect（语言切换时清 htmlPreview/mermaidPreview）

**参数**：`{ isDarkMode, isMermaid, showMermaidPreview, mermaidSource, node, updateAttributes }`
**返回**：`{ mermaidSvg, mermaidError, mermaidPreviewRef }`

**风险点**：mermaid.render 是异步的，需保持 effect 依赖数组不变

### 提取单元 1-B：`useHtmlPreview` hook

**目标文件**：`src/components/editor/nodes/code-block/useHtmlPreview.ts`

**提取内容**：
- `previewContainerRef` / `iframeRef`
- 原生 DOM iframe 管理 effect（创建/更新/销毁 iframe）

**参数**：`{ showHtmlPreview, htmlSource, collapsed, t }`
**返回**：`{ previewContainerRef }`

**风险点**：React 19 sandbox workaround 逻辑需原样搬迁

### 提取单元 1-C：`CodeBlockActions` 组件

**目标文件**：`src/components/editor/nodes/code-block/CodeBlockActions.tsx`

**提取内容**：
- collapse toggle 按钮
- htmlPreviewBtn / mermaidPreviewBtn / openWindowBtn / copyBtn 四个 action button 的 JSX
- 内部 `copied` state + `handleCopy` callback

**Props**：
```ts
interface CodeBlockActionsProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isHtml: boolean;
  isMermaid: boolean;
  hasContent: boolean;
  showHtmlPreview: boolean;
  showMermaidPreview: boolean;
  mermaidSvg: string | null;
  htmlSource: string;
  isDarkMode: boolean;
  onToggleHtmlPreview: () => void;
  onToggleMermaidPreview: () => void;
  t: TranslationFunction;
}
```

**风险点**：`copied` state 完全内聚，无需外部传入

### 提取单元 1-D：`useCodeBlockTitle` hook（可选，视前 3 步效果）

**目标文件**：`src/components/editor/nodes/code-block/useCodeBlockTitle.ts`

**提取内容**：
- `localTitle` / `isEditingTitle` state
- `titleInputRef` / `cursorTrailTitleRef`
- sync effect / auto-focus effect
- `startEditingTitle` / `commitTitle` callbacks

---

## 第二步：GraphCanvas.tsx（1910 行 → 目标 ~1000 行）

### 提取单元 2-A：`GraphToolbar` 组件

**目标文件**：`src/components/editor/nodes/graph/GraphToolbar.tsx`

**提取内容**：工具栏 JSX（行 1582-1877，约 300 行纯按钮 JSX）

**Props**（大量但都是原始值 + 回调）：
```ts
interface GraphToolbarProps {
  pendingShape: GraphNodeShape | null;
  recentShapes: GraphNodeShape[];
  showGrid: boolean;
  autoActivation: boolean;
  selectedLabelAlign: LabelAlign | null;
  selectedFillColor: string | null;
  selectedSeqEdge: 'call' | 'return' | null;
  fillPickerOpen: boolean;
  shapesMenuOpen: boolean;
  moreMenuOpen: boolean;
  darkMode: boolean;
  // refs for click-outside
  shapesMenuRef: RefObject<HTMLDivElement>;
  moreMenuRef: RefObject<HTMLDivElement>;
  fillPickerRef: RefObject<HTMLDivElement>;
  // callbacks
  onTogglePending, onSelectShape, onShapesEnter, onShapesLeave,
  onUndo, onRedo, onDelete, onSetLabelAlign, onToggleSeqMessage,
  onSetFillColor, onToggleFillPicker, onToggleGrid, onToggleAutoActivation,
  onToggleShapesMenu, onToggleMoreMenu,
  onExportSvg, onExportPng, onCopyImage, onCopySvg,
  onZoomIn, onZoomOut, onFit,
  onOpenMermaidImport, onOpenAiGraphImport,
}
```

**风险点**：纯 JSX 搬迁，逻辑零修改，风险最低

### 提取单元 2-B：`useGraphKeyboard` hook

**目标文件**：`src/components/editor/nodes/graph/useGraphKeyboard.ts`

**提取内容**：键盘事件 effect（行 1253-1407）
- Del 删除、Cmd+Z 撤销/重做、Cmd+C/X/V 复制粘贴、Cmd+D 克隆
- 方向键微移、Tab/Enter 思维导图生发
- window 级 Tab/Enter 捕获
- canvas mousedown focus

**参数**：`{ editing, rootRef, containerRef, graphRef, undoManagerRef, pendingShapeRef, setPending, darkModeRef }`

**风险点**：键盘处理闭包引用较多 ref，需确保全部传入

### 提取单元 2-C：`useGraphInit` hook（最高风险，最后做）

**目标文件**：`src/components/editor/nodes/graph/useGraphInit.ts`

**提取内容**：初始化 useEffect（行 328-1200，约 870 行）
- Graph 实例创建 + 插件注册
- 自定义形状注册
- VertexHandler / ConnectionHandler 覆写
- 连接点约束逻辑
- UndoManager 绑定
- 模型变化/选中变化/视口变化监听
- 拖拽绘制（mousedown/mousemove/mouseup）
- 滚轮缩放/平移
- ResizeObserver
- 初始快照灌入
- cleanup 函数

**参数**（大量 ref + callback）：
```ts
interface UseGraphInitParams {
  containerRef: RefObject<HTMLDivElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  graphRef: MutableRefObject<Graph | null>;
  undoManagerRef: MutableRefObject<UndoManager | null>;
  pendingShapeRef: MutableRefObject<GraphNodeShape | null>;
  darkModeRef: MutableRefObject<boolean>;
  initialSnapshotRef: RefObject<string>;
  showGridRef: MutableRefObject<boolean>;
  autoActivationRef: MutableRefObject<boolean>;
  applyingRef: MutableRefObject<boolean>;
  lastEmittedRef: MutableRefObject<string>;
  emitNowRef: MutableRefObject<() => void>;
  updateFlowAnimationRef: MutableRefObject<() => void>;
  scheduleEmit: () => void;
  emitSnapshot: () => void;
  setShowGrid: (v: boolean) => void;
  setAutoActivation: (v: boolean) => void;
  setSelectedLabelAlign: (v: LabelAlign | null) => void;
  setSelectedFillColor: (v: string | null) => void;
  setSelectedSeqEdge: (v: 'call' | 'return' | null) => void;
  setFillPickerOpen: (v: boolean) => void;
}
```

**风险点**：
- 闭包深度耦合：effect 内部定义了大量局部函数（onMouseDown, onMouseMove, finishDraw, onWheel 等），引用了 `graph`, `container`, `scheduleEmit`, `setShowGrid` 等
- `emitNowRef.current = scheduleEmit` 的桥接赋值时机需保持
- cleanup 函数中 `emitSnapshot()` flush 需保留

---

## 第三步：DocumentPanel.tsx（1276 行 → 目标 ~700 行）

### 提取单元 3-A：`useCursorTrail` hook

**目标文件**：`src/components/editor/sectionEditor/useCursorTrail.ts`

**提取内容**：
- cursor trail 创建 effect（行 483-558）
- 主题色更新 effect（行 562-592）
- cursor style effect（行 595-598）
- `trailOverlayRef`, `trailRef`, `sectionsWrapperRef`, `scrollContainerRef`

**参数**：`{ readOnly, hasActiveDoc, editorDocId, editorCursorAnimationEnabled, editorCursorStyle, cursorTrailRegistry, scrollContainerRef, sectionsWrapperRef }`
**返回**：`{ trailOverlayRef, trailRef }`

### 提取单元 3-B：`useSectionLoader` hook

**目标文件**：`src/components/editor/sectionEditor/useSectionLoader.ts`

**提取内容**：
- 文档加载/分段 effect（行 363-437）
- 渐进式挂载 effect（行 445-469）
- section loaded 回调（行 475-480）
- section change handler（行 652-664）
- cross-section delete handler（行 674-710）
- section blur rebalance（行 722-810）
- merge up handler（行 950-968）

**参数**（大量 ref + setter）：
```ts
interface UseSectionLoaderParams {
  isStatic, doc, editorDocId, hasActiveDoc, activeDocReloadNonce,
  sectionsRef, loadedDocIdRef, loadTriggerRef, loadedStaticDocRef,
  staticDocRevRef, loadedSectionCountRef, expectedSectionCountRef,
  sectionEditorsRef, focusedEditorRef, rebalanceSeqRef,
  setSections, setStaticDocKey, setRenderedDocId, setVisibleCount,
}
```
**返回**：`{ sections, renderSections, visibleCount, renderedDocId, docKey, showSkeleton, handleSectionChange, handleSectionLoaded, handleSectionBlur, handleCrossSectionDelete, handleMergeUp, handleMergeApplied }`

**风险点**：这是整个重构中最复杂的 hook，涉及 ~15 个 ref 和 6 个 setter

### 提取单元 3-C：`useEditorKeyboardNav` hook

**目标文件**：`src/components/editor/sectionEditor/useEditorKeyboardNav.ts`

**提取内容**：
- Cmd+ArrowLeft/Right 行首行尾跳转 effect（行 237-361）
- Cmd+` 内联代码 toggle
- title input 的 Cmd+Arrow 处理

**参数**：`{ readOnly, titleInputRef, sectionEditorsRef, cursorTrailRegistry }`

---

## 第四步：DocumentSidebar.tsx（1421 行 → 目标 ~600 行）

### 提取单元 4-A：`useSidebarHover` hook

**目标文件**：`src/components/documents/hooks/useSidebarHover.ts`

**提取内容**：
- hoverExpanded state + 相关 refs（isSidebarHovered, lastPointerPos, hoverCollapseTimer, suppressCollapseRef, prevSuppressRef）
- scheduleCollapse / handleHoverEnter / handleHoverLeave
- pointermove tracking effect
- leftPanelHovered effect
- suppressCollapse re-evaluation effect

**参数**：`{ sidebarPinned, leftPanelHovered, anyFloatingMenuOpen, renamingId, renamingFolderId, searchFocused }`
**返回**：`{ hoverExpanded, setHoverExpanded, isCollapsed, effectiveWidth, isOverlay, overlayShift, handleHoverEnter, handleHoverLeave, handleTogglePin }`

**风险点**：suppressCollapse 依赖 contextMenu/folderMenu/batchMenu 等多个外部 state

### 提取单元 4-B：`useBatchSelection` hook

**目标文件**：`src/components/documents/hooks/useBatchSelection.ts`

**提取内容**：
- selectedIds / lastClickedId / batchMenu / batchMoveMenu state
- splitSelection / batchDelete / batchMove
- handleDocClick（多选逻辑）
- Escape 清除选择 effect
- batch menu auto-close effects

**参数**：`{ folders, visibleItemIds, openDocumentTab, trashDocuments, trashFolder, moveDocumentsToFolder, t }`
**返回**：`{ selectedIds, setSelectedIds, lastClickedId, setLastClickedId, batchMenu, setBatchMenu, batchMoveMenu, setBatchMoveMenu, splitSelection, batchDelete, batchMove, handleDocClick, handleContextMenu }`

### 提取单元 4-C：`useDocDragDrop` hook

**目标文件**：`src/components/documents/hooks/useDocDragDrop.ts`

**提取内容**：
- drag ref + dragArmed state + draggingDocId / dragOverTarget / flashFolderId state
- suppressClick ref
- onDocPointerDown
- pointermove/pointerup effect（findDropTarget, commit drop, multi-select move）
- folder flash effect

**参数**：`{ docList, selectedIds, setSelectedIds, moveDocumentToFolder, moveDocumentsToFolder, renamingId }`
**返回**：`{ dragArmed, draggingDocId, dragOverTarget, flashFolderId, onDocPointerDown, suppressClick }`

**风险点**：drag ref 在 pointermove 中被直接修改（不触发 re-render），提取后需保持 ref 引用一致

### 提取单元 4-D：子组件提取（可选）

- `SidebarMoreMenu` - 更多操作下拉菜单
- `DocRow` - 单个文档列表项（含 rename input）
- `FolderRow` - 单个文件夹列表项

---

## 执行流程

```
CodeBlockView (1-A → 1-B → 1-C → [1-D])
    ↓ 用户确认
GraphCanvas (2-A → 2-B → 2-C)
    ↓ 用户确认
DocumentPanel (3-A → 3-B → 3-C)
    ↓ 用户确认
DocumentSidebar (4-A → 4-B → 4-C → [4-D])
```

每个提取单元的执行步骤：
1. 创建新文件，将代码原样搬迁
2. 在原文件中 import 并替换
3. `pnpm build` 验证编译通过
4. `git add + commit`（commit message 格式：`refactor: extract <hook/component name> from <file>`）
5. 等待用户确认后进入下一个
