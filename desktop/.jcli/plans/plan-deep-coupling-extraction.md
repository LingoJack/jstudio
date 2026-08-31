# 深度耦合提取方案

共 4 个文件，按风险从低到高排序。每个文件列出精确的提取步骤、接口定义和验证方法。

---

## 执行顺序总览

```
第 1 轮: CodeBlockView.tsx (914行)   — 风险最低，2 个子组件完全自包含
第 2 轮: DocumentSidebar.tsx (1384行) — 3 个零风险提取 + 3 个低风险提取
第 3 轮: DocumentPanel.tsx (1276行)   — 6 个 hook，依赖图清晰
第 4 轮: GraphCanvas.tsx (2156行)     — 12 个提取组，init effect 最后处理
```

---

## 第 1 轮: CodeBlockView.tsx (914行 -> ~550行)

### 耦合分析摘要

- **LanguageDropdown**: 高度自包含。内部状态 (`dropdownOpen`, `searchQuery`, `highlightedIndex`, `dropdownPosition`) 和 4 个 ref (`dropdownRef`, `searchInputRef`, `listRef`, `savedSelectionRef`) 均不被外部读取
- **CodeBlockActions**: 纯展示组件。唯一耦合点：`handleCopy` 读取 `codeRef.current.querySelector(".hljs")`
- 两者之间无直接共享状态，仅通过 ProseMirror `updateAttributes` 间接耦合

### 提取 1.1: LanguageDropdown 组件

**目标文件**: `src/components/editor/nodes/code-block/LanguageDropdown.tsx`

**Props 接口**:
```typescript
interface LanguageDropdownProps {
  language: string;                    // 当前语言 (node.attrs.language)
  onSelect: (language: string) => void; // 选择语言回调
  editor: Editor;                       // TipTap editor (保存/恢复选区)
  getPos: () => number;                 // 节点位置 (夹紧光标)
  node: Node;                           // ProseMirror node (node.content.size)
  badgeRef: React.RefObject<HTMLDivElement>; // 触发按钮 ref (定位 portal)
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}
```

**移入内容** (从 CodeBlockView.tsx 剪切):
| 内容 | 当前行号 | 说明 |
|------|---------|------|
| `dropdownOpen` state | L397 | |
| `searchQuery` state | L398 | |
| `highlightedIndex` state | L399 | |
| `dropdownPosition` state | L400-403 | |
| `dropdownRef` | L405 | |
| `searchInputRef` | L406 | |
| `listRef` | L407 | |
| `savedSelectionRef` | L408 | |
| `selectLanguage` callback | L430-459 | 改为内部函数，调用 `onSelect` prop |
| outside-click effect | L462-495 | |
| `toggleDropdown` callback | L497-513 | 改为内部函数 |
| `filteredLanguages` | L515-522 | |
| highlight reset effect | L525-531 | |
| scroll-into-view effect | L534-542 | |
| dropdown portal JSX | L734-802 | |

**关键改动**:
- `selectLanguage` 内的 `updateAttributes({ language: value })` 改为 `onSelect(value)`
- `selectLanguage` 内的 `editor.commands.focus()` + `setTextSelection()` 保持使用 `editor` prop
- `badgeRef` 从父组件传入（父组件仍需在 header JSX 中渲染 badge `<div>` 并附加 ref）

**父组件保留**:
- `badgeRef` 声明 + JSX ref 绑定
- `<LanguageDropdown language={...} onSelect={...} editor={editor} ... />` 渲染

### 提取 1.2: CodeBlockActions 组件

**目标文件**: `src/components/editor/nodes/code-block/CodeBlockActions.tsx`

**Props 接口**:
```typescript
interface CodeBlockActionsProps {
  hasContent: boolean;
  isHtml: boolean;
  isMermaid: boolean;
  showHtmlPreview: boolean;
  showMermaidPreview: boolean;
  htmlSource: string;
  mermaidSvg: string | null;
  isDarkMode: boolean;
  copied: boolean;
  onCopy: () => void;              // 父组件提供（因为要读 codeRef）
  onToggleHtmlPreview: () => void; // updateAttributes({ htmlPreview: !showHtmlPreview })
  onToggleMermaidPreview: () => void;
  onToggleCollapse: () => void;
  collapsed: boolean;
  t: (...) => string;
}
```

**移入内容** (从 CodeBlockView.tsx 剪切):
| 内容 | 当前行号 | 说明 |
|------|---------|------|
| `htmlPreviewBtn` JSX | L550-563 | |
| `mermaidPreviewBtn` JSX | L565-582 | |
| `openWindowBtn` JSX | L586-609 | |
| `copyBtn` JSX | L611-621 | |
| collapse button JSX | L656-661 | |

**关键改动**:
- `handleCopy` 保留在父组件（因为读取 `codeRef`），通过 `onCopy` prop 传入
- 所有 `updateAttributes` 调用改为通过 `onToggle*` 回调传入
- `openHtmlPreviewWindow` 和 `buildMermaidPreviewWindowHtml` 直接在组件内 import 使用

**预计行数变化**: CodeBlockView.tsx 914 -> ~550行

### 验证步骤
1. `npx tsc --noEmit` 零错误
2. `npx vite build` 成功
3. 手动测试: 语言选择、代码复制、HTML 预览切换、Mermaid 预览、折叠/展开

---

## 第 2 轮: DocumentSidebar.tsx (1384行 -> ~600行)

### 耦合分析摘要

- 11 个 ref, 28 个 callback, 11 个 effect
- 核心耦合点: `suppressClick` ref (拖拽组写 ↔ 点击 handler 读), `suppressCollapse` 派生值 (单向只读)
- 4 个菜单自动关闭 effect 模式完全相同，可泛化为 1 个 hook

### 提取 2.1: useMenuAutoClose (零风险)

**目标文件**: `src/components/documents/hooks/useMenuAutoClose.ts`

```typescript
function useMenuAutoClose(
  open: boolean,
  menuRef: React.RefObject<HTMLElement>,
  onClose: () => void,
  deps: unknown[] = [],
): void
```

**替换的 4 个 effect** (每个 ~12 行):
| Effect | 当前行号 | 菜单 ref | 关闭 setter |
|--------|---------|---------|------------|
| context-menu close | E4 | contextMenuRef | setContextMenu |
| folder-menu close | E5 | folderMenuRef | setFolderMenu |
| batch-menu close | E9 | batchMenuRef | setBatchMenu |
| batch-move-menu close | E10 | batchMoveMenuRef | setBatchMoveMenu |

**步骤**: 创建泛型 hook -> 替换 4 个 effect 为 4 行调用

### 提取 2.2: useMoreMenu (零风险)

**目标文件**: `src/components/documents/hooks/useMoreMenu.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `moreMenuOpen` state | L91 |
| `moreMenuCloseTimer` ref | L92 |
| `moreMenuRef` | L93 |
| `moreMenuPos` state | L94 |
| `captureMoreMenuPos` callback | L428-432 |
| `openMoreMenu` callback | L434-440 |
| `scheduleCloseMoreMenu` callback | L442-447 |

**返回**: `{ moreMenuOpen, setMoreMenuOpen, moreMenuRef, moreMenuPos, captureMoreMenuPos, openMoreMenu, scheduleCloseMoreMenu }`

### 提取 2.3: 导入/导出回调提取为工具函数 (零风险)

**目标文件**: `src/components/documents/utils/docFileOps.ts`

**移入内容** (纯 async 函数，不依赖组件状态):
| 函数 | 当前行号 | 依赖 |
|------|---------|------|
| `handleOpenInFinder` | L572-583 | `studioRoot`, `folders` |
| `handleCopyPath` | L585-590 | `studioRoot`, `doc` |
| `handleCopyRelativePath` | L592-605 | `studioRoot`, `doc` |
| `handleImportMarkdown` | L607-627 | `importDocumentFromMarkdown` |
| `handleImportMarkdownDirectory` | L629-661 | `importMarkdownDirectory` |
| `handleExportBundle` | L640-648 | `exportDocumentBundle` |
| `handleImportBundle` | L650-661 | `importDocumentBundle` |
| `handleCopyAsMarkdown` | L663-681 | `blocksToMarkdown` |

改为纯函数接收参数，不使用 `useCallback` 包装。

### 提取 2.4: useRename (低风险)

**目标文件**: `src/components/documents/hooks/useRename.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `renamingId`, `renameValue` state | L87-88 |
| `renameInputRef` | L89 |
| `renamingFolderId`, `folderRenameValue` state | L103-104 |
| `folderRenameRef` | L105 |
| `startRename` callback | L380-392 |
| `commitRename` callback | L449-460 |
| `startFolderRename` callback | L546-557 |
| `commitFolderRename` callback | L558-570 |
| rename focus effect | E6 |
| folder-rename focus effect | E7 |

**输入**: `{ renameDocument, renameFolder }`
**返回**: `{ renamingId, renameValue, renameInputRef, startRename, commitRename, renamingFolderId, folderRenameValue, folderRenameRef, startFolderRename, commitFolderRename }`

### 提取 2.5: useHoverExpand (低风险)

**目标文件**: `src/components/documents/hooks/useHoverExpand.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `hoverExpanded` state | L113 |
| `isSidebarHovered` ref | L114 |
| `lastPointerPos` ref | L115 |
| `hoverCollapseTimer` ref | L116 |
| `suppressCollapseRef` | L128 |
| `prevSuppressRef` | L130 |
| `scheduleCollapse` callback | L143-152 |
| `handleHoverEnter` callback | L154-160 |
| `handleHoverLeave` callback | L162-167 |
| mousemove tracker effect | E1 (L169-199) |
| leftPanelHovered sync effect | E2 (L201-213) |
| suppressCollapse re-eval effect | E3 (L215-236) |

**输入**: `{ sidebarPinned, leftPanelHovered, anyFloatingMenuOpen: () => boolean }`
**返回**: `{ hoverExpanded, isCollapsed, handleHoverEnter, handleHoverLeave, suppressCollapseRef }`

**关键**: `anyFloatingMenuOpen` 是一个检查 contextMenu/folderMenu/batchMenu 等 是否打开的函数，作为输入传入

### 提取 2.6: useDragSelection (中等风险)

**目标文件**: `src/components/documents/hooks/useDragSelection.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `drag` ref | L257 |
| `draggingDocId` state | L273 |
| `dragOverTarget` state | L274 |
| `flashFolderId` state | L275 |
| `suppressClick` ref | L683 |
| `dragArmed` state | L685 |
| `onDocPointerDown` callback | L687-728 |
| pointer drag effect | E11 (L730-816) |
| `selectedIds` state | L96 |
| `lastClickedId` state | L97 |
| `batchMenu` state | L99 |
| `batchMoveMenu` state | L100 |
| `splitSelection` callback | L306-318 |
| `batchDelete` callback | L320-332 |
| `batchMove` callback | L334-355 |
| Escape clears selection effect | E8 |

**输入**: `{ docList, folders, visibleItemIds, moveDocumentToFolder, moveDocumentsToFolder, trashDocuments }`
**返回**: `{ selectedIds, lastClickedId, batchMenu, batchMoveMenu, draggingDocId, dragOverTarget, flashFolderId, suppressClick, onDocPointerDown, splitSelection, batchDelete, batchMove, setBatchMenu, setBatchMoveMenu }`

**关键收益**: 将 `suppressClick` 的写入（E11）和读取（handleDocClick）收入同一 hook，消除唯一的跨组可变 ref 耦合

### 验证步骤
1. 每完成一个提取就 `npx tsc --noEmit`
2. 全部完成后 `npx vite build`
3. 手动测试: 文档拖拽排序、多选+批量删除/移动、文件夹重命名、侧边栏悬停展开/收起、右键菜单、导入 Markdown

---

## 第 3 轮: DocumentPanel.tsx (1276行 -> ~500行)

### 耦合分析摘要

- 21 个 ref, 18 个 callback (17 个 `[]` deps), 10 个 effect
- `sectionsRef` (8 消费者) 和 `sectionEditorsRef` (8 消费者) 是最高扇出耦合点
- 17/18 callback 用 `[]` deps + refs-as-liveness 模式
- 2 个 vestigial ref (`loadedSectionCountRef`, `expectedSectionCountRef`) 可删除

### 提取顺序 (依赖图决定)

```
3.1 useSectionEditorRegistry  (纯基底，无上游依赖)
3.2 useCursorTrailSystem      (自包含，暴露 titleInputRef + cursorTrailRegistry)
3.3 useCrossSectionNavigation  (清晰，暴露 focusHandlesRef + sectionOrderRef)
3.4 useBlankAreaClick          (微小，依赖 3.3 的 ref)
3.5 useSectionState            (最大收益 ~300行，依赖 3.1 的 ref)
3.6 useCrossSectionCoordination (组合 3.1/3.3/3.5，最后提取)
3.7 独立 hook (keyboard capture, pagehide flush, time tick, title handlers)
```

### 提取 3.1: useSectionEditorRegistry

**目标文件**: `src/components/editor/sectionEditor/hooks/useSectionEditorRegistry.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `sectionEditorsRef` | L182 |
| `focusedEditorRef` | L180 |
| `focusedEditor` state | L181 |
| `handleEditorReady` callback | L189-213 |

**返回**: `{ sectionEditorsRef, focusedEditorRef, focusedEditor, handleEditorReady }`

### 提取 3.2: useCursorTrailSystem

**目标文件**: `src/components/editor/sectionEditor/hooks/useCursorTrailSystem.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `cursorTrailRegistry` useMemo | L153 |
| `trailOverlayRef` | L171 |
| `sectionsWrapperRef` | L170 |
| `scrollContainerRef` | L169 |
| `trailRef` | L172 |
| `titleInputRef` | L154 |
| `titleHostDisposerRef` | L155 |
| `setTitleInputRef` callback | L156-161 |
| `notifyCaret` callback | L173-175 |
| Effect A (cleanup) | L163-166 |
| Effect E (create trail) | L483-558 |
| Effect F (theme update) | L562-592 |
| Effect G (cursor style) | L595-598 |

**输入**: `{ readOnly, hasActiveDoc, editorDocId, editorCursorAnimationEnabled, editorCursorStyle }`
**返回**: `{ cursorTrailRegistry, trailOverlayRef, sectionsWrapperRef, scrollContainerRef, titleInputRef, setTitleInputRef, notifyCaret }`

### 提取 3.3: useCrossSectionNavigation

**目标文件**: `src/components/editor/sectionEditor/hooks/useCrossSectionNavigation.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `focusHandlesRef` | L816 |
| `sectionOrderRef` | L817 |
| `registerFocus` callback | L905-911 |
| `handleCrossUp` callback | L913-921 |
| `handleCrossDown` callback | L923-931 |
| `handleJumpDocStart` callback | L933-939 |
| `handleJumpDocEnd` callback | L941-948 |
| `handleMergeUp` callback | L950-968 |
| `handleMergeApplied` callback | L970-975 |

**输入**: `renderSections` (用于同步 `sectionOrderRef.current`)
**返回**: `{ focusHandlesRef, sectionOrderRef, registerFocus, handleCrossUp, handleCrossDown, handleJumpDocStart, handleJumpDocEnd, handleMergeUp, handleMergeApplied }`

### 提取 3.4: useBlankAreaClick

**目标文件**: `src/components/editor/sectionEditor/hooks/useBlankAreaClick.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `mouseDownPosRef` | L1045 |
| `handleMouseDown` callback | L1047-1049 |
| `handleBlankAreaClick` callback | L1051-1075 |

**输入**: `{ focusHandlesRef, sectionOrderRef }` (来自 3.3)
**返回**: `{ handleMouseDown, handleBlankAreaClick }`

### 提取 3.5: useSectionState

**目标文件**: `src/components/editor/sectionEditor/hooks/useSectionState.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `sections` state | L117 |
| `visibleCount` state | L120 |
| `staticDocKey` state | L125 |
| `renderedDocId` state | L127 |
| `sectionsRef` | L118 |
| `loadedDocIdRef` | L120 |
| `loadTriggerRef` | L125 |
| `loadedStaticDocRef` | L131 |
| `staticDocRevRef` | L132 |
| `rebalanceSeqRef` | L722 |
| ~~`loadedSectionCountRef`~~ | L146 | **删除 (vestigial)** |
| ~~`expectedSectionCountRef`~~ | L137 | **删除 (vestigial)** |
| `handleSectionLoaded` callback | L475-480 |
| `isWholeDocEmpty` callback | L646-649 |
| `handleSectionChange` callback | L652-664 |
| `handleCrossSectionDelete` callback | L674-710 |
| `handleSectionBlur` callback | L723-810 |
| Effect C (load/re-section) | L364-437 |
| Effect D (progressive mount) | L445-469 |

**输入**: `{ isStatic, doc, editorDocId, hasActiveDoc, activeDocReloadNonce, sectionEditorsRef, focusedEditorRef }` (后两个来自 3.1)
**返回**: `{ sections, renderSections, visibleCount, renderedDocId, docKey, showSkeleton, handleSectionLoaded, isWholeDocEmpty, handleSectionChange, handleCrossSectionDelete, handleSectionBlur }`

### 提取 3.6: useCrossSectionCoordination

**目标文件**: `src/components/editor/sectionEditor/hooks/useCrossSectionCoordination.ts`

**移入内容**:
| 内容 | 当前行号 |
|------|---------|
| `crossCtx` useMemo | L829-835 |
| `crossSelectAllRef` | L187 |
| Effect J (select-all handler) | L843-888 |

**输入**: `{ sectionOrderRef, focusHandlesRef, sectionEditorsRef, handleCrossSectionDelete, editorDocId, findQuery, findResetKey }`
**返回**: `{ crossCtx, crossSel, find }`

### 提取 3.7: 独立 hook

| Hook | 移入内容 | 输入 |
|------|---------|------|
| `useEditorKeyboardCapture` | Effect B (L237-361) | `{ readOnly, sectionEditorsRef, titleInputRef, cursorTrailRegistry }` |
| `useFlushOnUnload` | Effect H (L601-624) | `{ readOnly, sectionsRef, sectionEditorsRef }` |
| `useRelativeTimeTick` | Effect I (L632-636) | `{ isStatic, readOnly }` |
| `useTitleKeyHandlers` | `handleTitleKeyDown` (L980-1028, 改为 useCallback) + `handleExitToTitle` (L1030-1036) | `{ focusHandlesRef, sectionOrderRef, sectionEditorsRef, titleInputRef }` |

### 验证步骤
1. 按顺序 3.1 -> 3.7 逐个提取，每个完成后 `npx tsc --noEmit`
2. 全部完成后 `npx vite build`
3. 手动测试: 文档切换、跨节光标导航、标题 Enter/ArrowDown、代码块 Cmd+A、空白区域点击、光标拖尾动画、页面关闭自动保存

---

## 第 4 轮: GraphCanvas.tsx (2156行 -> ~1000行)

### 耦合分析摘要

- 19 个 ref, 29 个 callback (23 个 `[]` deps), 10 个 effect
- `graphRef` 是万能枢纽 (4 个 effect + 13 个 callback)
- 3 个 "bridge ref" (`emitNowRef`, `updateFlowAnimationRef`, `onChangeRef`) 仅为打破 const-TDZ 排序而存在
- init effect (E3, 870行) 是耦合核心，关闭了 14/19 个 ref

### 提取顺序 (12 步，从最安全到最复杂)

```
4.1  useDropdownMenus        (零 graph 依赖)
4.2  useCloneHeldIndicator   (零 graph 依赖)
4.3  useGraphExport          (graphRef + containerRef)
4.4  useGraphTheme           (graphRef + darkModeRef)
4.5  useGraphViewControls    (graphRef)
4.6  useGraphEditActions     (graphRef + undoManagerRef)
4.7  useGraphEmit            (graphRef + onChange) ← 导出 emitNow, applyingRef, lastEmittedRef
4.8  useGraphImport          (需要 4.7 的导出)
4.9  useSelectionToolbar     (需要 emitNow)
4.10 useShapeDrawing         (仅状态部分)
4.11 useGraphKeyboard        (7 个 ref 参数，全部稳定)
4.12 useGraphInit            (最后，可选 — 缩减 init effect 到核心)
```

### 提取 4.1: useDropdownMenus (零风险)

**移入**: E9, E10; `fillPickerRef`, `shapesMenuRef`, `moreMenuRef`, `shapesHoverTimer`; `fillPickerOpen`, `shapesMenuOpen`, `moreMenuOpen` states; `handleShapesEnter/Leave` callbacks

**返回**: 所有菜单 ref/state/handler

### 提取 4.2: useCloneHeldIndicator (零风险)

**移入**: E1; `cloneHeld` state

**输入**: `editing`
**返回**: `{ cloneHeld }`

### 提取 4.3: useGraphExport

**移入**: `buildExportSvg`, `handleExportSvg`, `handleExportPng`, `handleCopyImage`, `handleCopySvg`

**输入**: `{ graphRef, containerRef, darkModeRef }`
**返回**: `{ handleExportSvg, handleExportPng, handleCopyImage, handleCopySvg }`
**注意**: `setMoreMenuOpen` 耦合仅为关闭菜单，可由父组件在 onClick 后调用

### 提取 4.4: useGraphTheme

**移入**: `applyThemeColors` callback; E6, E7

**输入**: `{ graphRef, darkModeRef, darkMode }`
**返回**: `{ applyThemeColors }`

### 提取 4.5: useGraphViewControls

**移入**: `handleZoomIn`, `handleZoomOut`, `handleFit`

**输入**: `{ graphRef }`
**返回**: `{ handleZoomIn, handleZoomOut, handleFit }`

### 提取 4.6: useGraphEditActions

**移入**: `handleUndo`, `handleRedo`, `handleDelete`

**输入**: `{ graphRef, undoManagerRef }`
**返回**: `{ handleUndo, handleRedo, handleDelete }`

### 提取 4.7: useGraphEmit (关键)

**移入**: `emitSnapshot`, `scheduleEmit`; `onChangeRef`, `debounceRef`, `lastEmittedRef`, `applyingRef`, `showGridRef`, `autoActivationRef`, `emitNowRef`; E2

**输入**: `{ graphRef, onChange, showGrid, autoActivation }`
**返回**: `{ scheduleEmit, emitNow, applyingRef, lastEmittedRef }`

**关键约束**:
- `emitNowRef.current = scheduleEmit` 必须在每次渲染时执行（非 effect），保持 bridge ref 语义
- `showGridRef.current = showGrid` 和 `autoActivationRef.current = autoActivation` 同理

### 提取 4.8: useGraphImport

**移入**: `applyImportedSnapshot`, `handleMermaidImport`, `handleAiGraphImport`; `mermaidDialogOpen`, `aiGraphDialogOpen` states

**输入**: `{ graphRef, applyingRef, lastEmittedRef, darkModeRef, updateFlowAnimationRef, onChangeRef }` (后 4 个来自 4.7 和 init)
**返回**: `{ handleMermaidImport, handleAiGraphImport, mermaidDialogOpen, aiGraphDialogOpen }`

### 提取 4.9: useSelectionToolbar

**移入**: `handleSetLabelAlign`, `handleToggleSeqMessage`, `handleSetFillColor`; `selectedLabelAlign`, `selectedFillColor`, `selectedSeqEdge` states

**输入**: `{ graphRef, darkModeRef, emitNow }`
**返回**: `{ selectedLabelAlign, selectedFillColor, selectedSeqEdge, handleSetLabelAlign, handleToggleSeqMessage, handleSetFillColor }`

**注意**: selection-CHANGE listener 仍在 E3 中注册并设置这些 state。提取后需要通过返回的 setter 让 E3 设置

### 提取 4.10: useShapeDrawing (仅状态)

**移入**: `pendingShape` state, `pendingShapeRef`, `setPending`, `togglePending`, `recordShapeUse`, `handleSelectShape`, `recentShapes` state

**返回**: `{ pendingShape, pendingShapeRef, setPending, togglePending, handleSelectShape, recentShapes }`

**注意**: E3 中的 draw 逻辑 (onMouseDown/Move/finishDraw) 仍留在 init effect 中，通过 `pendingShapeRef` 读取

### 提取 4.11: useGraphKeyboard

**移入**: E8

**输入**: `{ graphRef, rootRef, containerRef, undoManagerRef, pendingShapeRef, darkModeRef, setPending, editing }`
**返回**: 无 (纯副作用 hook)

### 提取 4.12: useGraphInit (可选，最后)

**移入**: E3 的剩余内容

**输入**: 大量 ref + callback
**输出**: `{ graphRef, undoManagerRef, updateFlowAnimationRef }`

**风险**: 最高。870 行 effect 内部有大量闭包和 listener 注册。建议仅在前 11 步完成后评估是否值得提取。

### 不变量契约 (任何提取都必须保持)

1. `graphRef` 只在 E3 中赋值一次，cleanup 时清空
2. `emitNowRef.current = scheduleEmit` 每次渲染时赋值（不是 effect）
3. `updateFlowAnimationRef.current` 在 E3 内部赋值
4. `applyingRef` 在 `applySnapshotToGraph` 前后 set true/false
5. `lastEmittedRef` 是入站/出站去重边界，必须共享
6. `darkModeRef`, `showGridRef`, `autoActivationRef` 每次渲染时 mirror

### 验证步骤
1. 每完成一个提取就 `npx tsc --noEmit`
2. 每 3 个提取后 `npx vite build`
3. 全部完成后手动测试: 创建图形、拖拽、连线、思维导图生发、撤销重做、导出 PNG/SVG、Mermaid 导入、AI 生成、主题切换

---

## 风险矩阵

| 轮次 | 文件 | 提取数 | 风险等级 | 预计减少行数 |
|------|------|--------|---------|------------|
| 1 | CodeBlockView | 2 | 低 | ~360行 |
| 2 | DocumentSidebar | 6 | 低-中 | ~780行 |
| 3 | DocumentPanel | 7+4 | 中 | ~770行 |
| 4 | GraphCanvas | 12 | 中-高 | ~1150行 |

## 执行策略（增量模式）

**严格遵循以下循环**：
1. 每次只做 **一个** 提取（最小可验证单元）
2. 运行 `npx tsc --noEmit` + `npx vite build` 确认编译通过
3. **通知用户手动测试**该提取涉及的功能
4. 用户确认无问题后 -> `git commit`
5. 继续下一个提取

**不跳步、不批量执行。每个提取都是独立的 commit。**

### 执行清单（按序）

- [ ] 1.1 CodeBlockView: LanguageDropdown 组件提取
- [ ] 1.2 CodeBlockView: CodeBlockActions 组件提取
- [ ] 2.1 DocumentSidebar: useMenuAutoClose hook
- [ ] 2.2 DocumentSidebar: useMoreMenu hook
- [ ] 2.3 DocumentSidebar: 导入/导出工具函数提取
- [ ] 2.4 DocumentSidebar: useRename hook
- [ ] 2.5 DocumentSidebar: useHoverExpand hook
- [ ] 2.6 DocumentSidebar: useDragSelection hook
- [ ] 3.1 DocumentPanel: useSectionEditorRegistry
- [ ] 3.2 DocumentPanel: useCursorTrailSystem
- [ ] 3.3 DocumentPanel: useCrossSectionNavigation
- [ ] 3.4 DocumentPanel: useBlankAreaClick
- [ ] 3.5 DocumentPanel: useSectionState
- [ ] 3.6 DocumentPanel: useCrossSectionCoordination
- [ ] 3.7 DocumentPanel: 独立 hook (keyboard/flush/tick/title)
- [ ] 4.1-4.12 GraphCanvas: 12 个提取组（逐个执行）
