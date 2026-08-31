# JStudio 代码结构重构方案

## 总览

共 **8 个重构任务**，按优先级 P0→P3 排列。每个任务包含：当前问题分析、目标文件结构、具体拆分映射、迁移步骤。

建议按任务顺序逐步执行，每个任务完成后运行 `npm run build` + 手动验证功能无回归，再进入下一个。

---

## 任务 1 (P0): 拆分 `GraphCanvas.tsx`（2373 行 → 主组件 ~350 行）

### 当前问题

`src/components/editor/nodes/graph/GraphCanvas.tsx` 虽然已经抽出了 `graphModel.ts`、`graphSnapshot.ts`、`graphTheme.ts` 等 11 个辅助文件，但主组件仍然承载了：

| 行范围 | 职责 | 行数 |
|--------|------|------|
| 140-305 | 模块级工具函数：`isOnBorder`、`mindmapEdgeStyle`、`nextCellId`、`spawnMindmapChild`、`spawnMindmapSibling` | ~165 |
| 493-1370 | maxGraph 初始化 + 事件绑定 + 键盘快捷键 + 右键菜单 + 连线流动动画注入 | ~880 |
| 1371-1688 | 主题应用、选区状态同步、填充色/对齐/时序边等 UI 状态 effect | ~320 |
| 1688-1970 | 事件处理器（undo/redo/delete/export/zoom/import 等 15+ 个 handler） | ~280 |
| 1970-2370 | 工具栏 JSX（形状菜单、LRU、撤销重做、对齐、填充、缩放、更多菜单） | ~400 |

### 目标结构

```
src/components/editor/nodes/graph/
├── GraphCanvas.tsx              // 主组件：state 声明 + effect 编排 + JSX（~350行）
├── graphHelpers.ts              // isOnBorder, mindmapEdgeStyle, nextCellId（从模块级函数提取）
├── mindmapSpawn.ts              // spawnMindmapChild, spawnMindmapSibling（思维导图生发逻辑）
├── useGraphInit.ts              // maxGraph 初始化 effect（容器创建、插件注册、连线动画注入）
├── useGraphEvents.ts            // 事件绑定 effect（点击/拖拽/双击/右键/键盘快捷键）
├── useGraphTheme.ts             // 主题颜色应用 effect（darkMode 联动）
├── useGraphSelectionState.ts    // 选中节点的 UI 状态同步 effect（labelAlign/fillColor/seqEdge）
├── useGraphExport.ts            // 导出/复制处理（buildExportSvg, handleExportPng, handleCopyImage 等）
├── GraphToolbar.tsx             // 工具栏 JSX 组件（形状菜单 + LRU + 操作按钮 + 更多菜单）
├── graphShapeMenu.ts            // shapeGroups 定义 + shapeTitleMap 构建逻辑
├── graphModel.ts                // (已存在，不变)
├── graphSnapshot.ts             // (已存在，不变)
├── graphTheme.ts                // (已存在，不变)
├── graphCanvasStyle.ts          // (已存在，不变)
├── mindmapLayout.ts             // (已存在，不变)
├── ShapeGlyph.tsx               // (已存在，不变)
├── sequenceInteraction.ts       // (已存在，不变)
├── customShapes.ts              // (已存在，不变)
├── obstacleRouting.ts           // (已存在，不变)
├── AIGraphImportDialog.tsx      // (已存在，不变)
└── MermaidImportDialog.tsx      // (已存在，不变)
```

### 具体拆分映射

#### 1.1 `graphHelpers.ts`（~50 行）
提取模块级纯函数：
- `isOnBorder(state, x, y, tol)` (L150-177)
- `mindmapEdgeStyle(dark)` (L193-207)
- `nextCellId(prefix)` (L209-215)

#### 1.2 `mindmapSpawn.ts`（~90 行）
提取思维导图生发函数（依赖 graph 对象操作，但无 React 状态）：
- `spawnMindmapChild(graph, parentCell, dark)` (L217-258)
- `spawnMindmapSibling(graph, currentCell, dark)` (L260-305)

#### 1.3 `useGraphInit.ts`（~250 行）
提取 maxGraph 初始化 effect（L493-1370 的核心部分）：
- Graph 实例创建 + 插件注册
- 连线流动动画的 cellRenderer monkey-patch
- 初始快照应用
- 销毁清理

返回 `{ graphRef, containerRef, undoManagerRef }`。

#### 1.4 `useGraphEvents.ts`（~350 行）
提取所有事件绑定逻辑（从 init effect 中拆出）：
- 鼠标事件：click/dblclick/contextmenu/mousedown
- 键盘快捷键：keydown（Tab/Enter/Delete/Cmd+Z/Cmd+Shift+Z 等）
- 拖拽创建 pending shape
- 连线创建 + 时序图交互
- clone 键检测

入参：`graphRef`, `props`（editing, darkMode, pendingShape 等）, `callbacks`。

#### 1.5 `useGraphTheme.ts`（~80 行）
提取主题相关 effect（L1414-1496）：
- `applyThemeColors()` 函数
- darkMode 变化时重新应用颜色的 effect

#### 1.6 `useGraphSelectionState.ts`（~120 行）
提取选中状态的 UI 同步 effect（L1497-1688）：
- 选中节点变化时更新 `selectedLabelAlign`
- 选中节点变化时更新 `selectedFillColor`
- 选中边变化时更新 `selectedSeqEdge`
- selectionModel 变化监听

#### 1.7 `useGraphExport.ts`（~120 行）
提取导出/复制相关 handler（L1801-1957）：
- `buildExportSvg()`
- `handleExportSvg()`, `handleExportPng()`
- `handleCopyImage()`, `handleCopySvg()`
- `applyImportedSnapshot()`, `handleMermaidImport()`, `handleAiGraphImport()`

入参：`graphRef`，返回所有 handler。

#### 1.8 `GraphToolbar.tsx`（~350 行）
提取工具栏 JSX（L1970-2338）为一个独立组件：
- Props 接收所有 handler + UI 状态（pendingShape, selectedLabelAlign, selectedFillColor, showGrid 等）
- 内部渲染：形状下拉菜单、LRU 按钮、撤销/重做/删除、对齐按钮、填充色选择器、缩放按钮、更多菜单

#### 1.9 `graphShapeMenu.ts`（~50 行）
提取 `shapeGroups` 常量定义和 `shapeTitleMap` 构建逻辑（L1974-2023），供 `GraphToolbar` 使用。

### 迁移步骤

1. 创建 `graphHelpers.ts`，将 3 个纯函数移入，更新 GraphCanvas 导入
2. 创建 `mindmapSpawn.ts`，移入 2 个函数，更新导入
3. 创建 `useGraphExport.ts`，移入导出相关 handler，GraphCanvas 通过 hook 调用
4. 创建 `graphShapeMenu.ts`，移入 shapeGroups 定义
5. 创建 `GraphToolbar.tsx`，移入工具栏 JSX，定义 Props 接口
6. 创建 `useGraphTheme.ts`，移入主题 effect
7. 创建 `useGraphSelectionState.ts`，移入选中状态 effect
8. 创建 `useGraphInit.ts`，提取初始化 effect（最复杂，需仔细处理 ref 传递）
9. 创建 `useGraphEvents.ts`，提取事件绑定（最复杂，需仔细处理回调依赖）
10. GraphCanvas.tsx 最终仅保留：state 声明、各 hook 调用编排、`<GraphToolbar>` + `<div ref={containerRef}>` 渲染
11. build + 手动测试：创建各种图形、拖拽、连线、思维导图生发、撤销重做、导出 PNG/SVG、Mermaid 导入、AI 生成

---

## 任务 2 (P0): 拆分 `AgentChat.tsx`（1792 行 → 主组件 ~250 行）

### 当前问题

`src/components/agent/AgentChat.tsx` 单文件定义了 18 个组件和工具函数：

| 行范围 | 组件/函数 | 行数 |
|--------|-----------|------|
| 52-55 | `nextMsgId()` | 4 |
| 56-72 | `getSessionTitle()` | 17 |
| 74-152 | `TopBar` | 79 |
| 153-201 | `RunStateBadge` | 49 |
| 202-234 | `UserMessageBubble` | 33 |
| 235-306 | `AssistantMessageBubble` | 72 |
| 307-447 | `TOOL_META` + `parseToolArgs()` + 类型 | 141 |
| 448-526 | `truncateLines` + `CodeBlock` | 79 |
| 527-545 | `FieldRow` | 19 |
| 546-846 | `ToolCallBubble` | 301 |
| 847-969 | `ToolResultBubble` | 123 |
| 970-1035 | `CompletedToolCallBubble` | 66 |
| 1036-1072 | `SystemMessageBubble` | 37 |
| 1073-1168 | `AskConfirm` | 96 |
| 1169-1437 | `InputArea` | 269 |
| 1438-1501 | `StreamingMessage` | 64 |
| 1502-1571 | `StatusIndicator` | 70 |
| 1572-1792 | `AgentChat` (主组件) | 221 |

### 目标结构

```
src/components/agent/
├── AgentChat.tsx                // 主组件：编排 + 消息列表渲染（~250行）
├── bubbles/
│   ├── UserMessageBubble.tsx        // L202-234
│   ├── AssistantMessageBubble.tsx   // L235-306
│   ├── ToolCallBubble.tsx           // L546-846
│   ├── ToolResultBubble.tsx         // L847-969
│   ├── CompletedToolCallBubble.tsx  // L970-1035
│   ├── SystemMessageBubble.tsx      // L1036-1072
│   ├── StreamingMessage.tsx         // L1438-1501
│   └── AskConfirm.tsx              // L1073-1168
├── ChatTopBar.tsx                   // TopBar (L74-152) + RunStateBadge (L153-201)
├── ChatInput.tsx                    // InputArea (L1169-1437)
├── StatusIndicator.tsx              // L1502-1571
├── utils/
│   ├── toolMeta.ts                  // TOOL_META + parseToolArgs + ParsedToolArgs 类型 (L307-447)
│   ├── messageHelpers.ts            // nextMsgId + getSessionTitle (L52-72)
│   └── codeBlock.tsx                // truncateLines + CodeBlock + FieldRow (L448-545)
├── AgentChatPanel.tsx               // (已存在，不变)
├── AgentSidebar.tsx                 // (已存在，不变)
├── ContextSwitchCard.tsx            // (已存在，不变)
├── MarkdownMessage.tsx              // (已存在，不变)
├── ModelSelector.tsx                // (已存在，不变)
└── WorkspaceList.tsx                // (已存在，不变)
```

### 具体拆分映射

#### 2.1 `utils/messageHelpers.ts`（~20 行）
- `nextMsgId()` (L52-55)
- `getSessionTitle(session)` (L56-72)

#### 2.2 `utils/toolMeta.ts`（~140 行）
- `ParsedToolArgs` 类型定义
- `TOOL_META` 常量 (L307-325)
- `parseToolArgs(name, rawArgs)` (L326-447)

#### 2.3 `utils/codeBlock.tsx`（~100 行）
- `truncateLines(text, maxLines)` (L448-453)
- `CodeBlock` 组件 (L455-526)
- `FieldRow` 组件 (L527-545)

> 这三个共用 codeBlock 渲染逻辑，内聚为一组。

#### 2.4 `bubbles/UserMessageBubble.tsx`（~35 行）
- `UserMessageBubble` (L202-234)

#### 2.5 `bubbles/AssistantMessageBubble.tsx`（~75 行）
- `AssistantMessageBubble` (L235-306)

#### 2.6 `bubbles/ToolCallBubble.tsx`（~310 行）
- `ToolCallBubble` (L546-846)
- 依赖 `toolMeta.ts` 的 `TOOL_META`、`parseToolArgs`
- 依赖 `codeBlock.tsx` 的 `CodeBlock`、`FieldRow`

#### 2.7 `bubbles/ToolResultBubble.tsx`（~125 行）
- `ToolResultBubble` (L847-969)

#### 2.8 `bubbles/CompletedToolCallBubble.tsx`（~70 行）
- `CompletedToolCallBubble` (L970-1035)

#### 2.9 `bubbles/SystemMessageBubble.tsx`（~40 行）
- `SystemMessageBubble` (L1036-1072)

#### 2.10 `bubbles/StreamingMessage.tsx`（~65 行）
- `StreamingMessage` (L1438-1501)

#### 2.11 `bubbles/AskConfirm.tsx`（~100 行）
- `AskConfirm` (L1073-1168)

#### 2.12 `ChatTopBar.tsx`（~130 行）
- `TopBar` (L74-152)
- `RunStateBadge` (L153-201)
> 两者强耦合（TopBar 使用 RunStateBadge），合并为一个文件。

#### 2.13 `ChatInput.tsx`（~270 行）
- `InputArea` (L1169-1437)
- 含 `InputAreaProps` 类型定义

#### 2.14 `StatusIndicator.tsx`（~75 行）
- `StatusIndicator` (L1502-1571)

### 迁移步骤

1. 创建 `utils/` 三个文件，移入纯函数/常量
2. 创建 `bubbles/` 目录，逐个移入消息气泡组件（每个都是独立的 React 组件，无交叉依赖）
3. 创建 `ChatTopBar.tsx`、`ChatInput.tsx`、`StatusIndicator.tsx`
4. AgentChat.tsx 更新导入，移除内联定义
5. build + 手动测试：发送消息、工具调用展开/折叠、文件上传、流式响应、确认弹窗

---

## 任务 3 (P0): 拆分 `storage.ts`（793 行 → 类型与实现分离）

### 当前问题

`src/lib/core/storage.ts` 混合了 **20+ 个类型/常量定义**（L13-444）和 **storage 对象实现**（L445-793）。类型被 `store/storeHelpers.ts`、`store/documentsSlice.ts` 等多处导入，导致 store 层对 lib 实现层的反向依赖。

### 目标结构

```
src/types/
├── storage.ts          // DocumentMeta, FolderMeta, AssetInfo, TrashedAsset, DocBackup, toMeta()
├── settings.ts         // ThemeMode, Language, AppSettings, TerminalCursorStyle, EditorCursorStyle,
│                       //   ActivityItemId, ActivityBarItemConfig, DEFAULT_ACTIVITY_BAR_ITEMS,
│                       //   normalizeActivityBarItems, ToolCallMode
├── terminal.ts         // TerminalSessionInfo, JcliStatus
├── browser.ts          // LinkMetadata, LinkPreviewTabInfo, LinkPreviewTabsState, BrowserPanelRect,
│                       //   AiGraphFetchRequest, AiGraphFetchResponse, MarkdownEntry
├── agent.ts            // ModelProvider, AgentConfigFile (追加到已有的 agent.ts)
├── document.ts         // (已存在，不变)
├── editor.ts           // (已存在，不变)
├── richText.ts         // (已存在，不变)
└── index.ts            // 追加新类型的 re-export

src/lib/core/
└── storage.ts          // 仅保留 storage 对象实现（~350 行）
```

### 具体拆分映射

| 当前位置 (storage.ts) | 目标文件 | 内容 |
|----------------------|----------|------|
| L13-16 | `types/settings.ts` | `ThemeMode` |
| L18-23 | `types/settings.ts` | `Language` |
| L25-40 | `types/storage.ts` | `DocumentMeta` |
| L42-59 | `types/storage.ts` | `FolderMeta` |
| L61-68 | `types/settings.ts` | `TerminalCursorStyle` |
| L70-74 | `types/settings.ts` | `EditorCursorStyle` |
| L76-90 | `types/settings.ts` | `ActivityItemId`, `ActivityBarItemConfig` |
| L93-130 | `types/settings.ts` | `DEFAULT_ACTIVITY_BAR_ITEMS`, `normalizeActivityBarItems` |
| L132-217 | `types/settings.ts` | `AppSettings` |
| L219-250 | `types/storage.ts` | `AssetInfo`, `TrashedAsset` |
| L253-272 | `types/storage.ts` | `DocBackup` |
| L274-300 | `types/settings.ts` | `ToolCallMode` |
| L280-309 | `types/agent.ts` | `ModelProvider`, `AgentConfigFile` |
| L311-317 | `types/terminal.ts` | `TerminalSessionInfo` |
| L319-334 | `types/terminal.ts` | `JcliStatus` |
| L336-348 | `types/browser.ts` | `LinkMetadata` |
| L350-376 | `types/browser.ts` | `AiGraphFetchRequest`, `AiGraphFetchResponse` |
| L378-400 | `types/browser.ts` | `LinkPreviewTabInfo`, `LinkPreviewTabsState` |
| L402-412 | `types/browser.ts` | `BrowserPanelRect` |
| L414-424 | `types/browser.ts` | `MarkdownEntry` |
| L426-443 | `types/storage.ts` | `toMeta(doc)` |
| L445-793 | `lib/core/storage.ts` | `storage` 对象（保持不变） |

### 迁移步骤

1. 创建 `types/settings.ts`，移入设置相关类型 + `normalizeActivityBarItems`
2. 创建 `types/storage.ts`，移入 DocumentMeta 等存储类型 + `toMeta()`
3. 创建 `types/terminal.ts`，移入终端类型
4. 创建 `types/browser.ts`，移入浏览器/链接预览类型
5. 向 `types/agent.ts` 追加 `ModelProvider`、`AgentConfigFile`
6. 更新 `types/index.ts` 追加 re-export
7. `lib/core/storage.ts` 保留 storage 对象，顶部从 `../../types` 导入类型
8. 全局搜索替换：所有从 `lib/core/storage` 导入类型的文件改为从 `types` 导入
9. build + 验证

---

## 任务 4 (P1): 拆分 `documentsSlice.ts`（1102 行 → 4 个文件）

### 当前问题

`src/store/documentsSlice.ts` 混合了 4 个不相关的关注点：

| 行范围 | 职责 | 行数 |
|--------|------|------|
| 14-437 | `init`：应用初始化（settings 加载、文件夹/文档索引加载、活动栏归一化、j-cli 检测） | ~420 |
| 439-554 | 文档 CRUD：createDocument, deleteDocument, deleteDocuments | ~115 |
| 556-763 | 回收站 + 资产回收站：trash/restore/emptyTrash + loadTrashedAssets/gcDocAssets/restoreTrashedAsset/deleteTrashedAsset/emptyTrashAssets | ~210 |
| 765-871 | 文档操作：openDocument, reloadDoc, updateDocumentMeta, renameDocument | ~105 |
| 873-1029 | 导入：importDocumentFromMarkdown, importMarkdownDirectory | ~155 |
| 1031-1102 | 备份包：exportDocumentBundle, importDocumentBundle | ~70 |

### 目标结构

```
src/store/
├── documentsSlice.ts         // 文档 CRUD + openDocument/reloadDoc/updateMeta/rename（~300行）
├── initSlice.ts              // init 函数（settings 加载、索引加载、j-cli 检测）（~350行）
├── trashSlice.ts             // 回收站 + 资产回收站（~210行）
├── importExportSlice.ts      // Markdown 导入 + .jnote 备份包导入/导出（~230行）
├── storeHelpers.ts           // (任务5 中重构)
├── terminalSlice.ts          // (已存在，不变)
├── uiSlice.ts                // (已存在，不变)
├── selectors.ts              // (已存在，不变)
├── useStore.ts               // (已存在，不变)
└── index.ts                  // (已存在，不变)
```

### 具体拆分映射

#### 4.1 `initSlice.ts`（~350 行）
- `init` 函数 (L14-437)
- 包含 settings 加载、归一化、文档/文件夹索引加载、活动栏初始化、j-cli 自动安装
- 注意：init 会 set 大量状态字段，需确保 StoreState 类型可见

#### 4.2 `trashSlice.ts`（~210 行）
- `trashDocument` (L559-592)
- `trashDocuments` (L594-628)
- `restoreDocument` (L630-647)
- `restoreDocuments` (L649-668)
- `emptyTrash` (L670-707)
- `loadTrashedAssets` (L712-719)
- `gcDocAssets` (L721-726)
- `restoreTrashedAsset` (L728-736)
- `deleteTrashedAsset` (L738-746)
- `emptyTrashAssets` (L748-763)

#### 4.3 `importExportSlice.ts`（~230 行）
- `importDocumentFromMarkdown` (L873-909)
- `importMarkdownDirectory` (L923-1029)
- `exportDocumentBundle` (L1043-1060)
- `importDocumentBundle` (L1070-1102)

#### 4.4 `documentsSlice.ts`（保留 ~300 行）
- `createDocument` (L442-477)
- `deleteDocument` (L479-518)
- `deleteDocuments` (L520-554)
- `openDocument` (L765-800)
- `reloadDoc` (L802-818)
- `updateDocumentMeta` (L820-846)
- `renameDocument` (L848-871)

### 迁移步骤

1. 创建 `trashSlice.ts`，移入回收站方法（注意保留 trashedDocList/trashedAssets 状态声明）
2. 创建 `importExportSlice.ts`，移入导入导出方法
3. 创建 `initSlice.ts`，移入 init 方法
4. documentsSlice.ts 仅保留文档 CRUD
5. 更新 `store/index.ts` 中 create 函数，合并所有 slice
6. 更新 `storeHelpers.ts` 中 StoreState 类型（或按任务 5 的方式重构类型）
7. build + 测试：创建文档、删除、移入回收站、恢复、清空回收站、Markdown 导入、.jnote 导出/导入

---

## 任务 5 (P1): 重构 `storeHelpers.ts`（439 行 → 类型下沉到各 slice）

### 当前问题

`src/store/storeHelpers.ts` 定义了一个 424 行的 `StoreState` interface，包含所有 slice 的全部状态和方法。每新增一个 slice 方法都要修改这个中心文件，违背了 slice 模式的初衷。

### 目标方案

每个 slice 定义自己的状态和方法类型，通过类型交叉组合生成 StoreState：

```typescript
// documentsSlice.ts
export interface DocumentsSlice {
  docList: DocumentMeta[];
  documents: Document[];
  activeDoc: Document | null;
  activeDocId: string;
  createDocument: (folderId?: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  // ...
}

// trashSlice.ts
export interface TrashSlice {
  trashedDocList: DocumentMeta[];
  trashedAssets: TrashedAsset[];
  trashDocument: (id: string) => Promise<void>;
  // ...
}

// storeHelpers.ts
import type { DocumentsSlice } from './documentsSlice';
import type { TrashSlice } from './trashSlice';
import type { TerminalSlice } from './terminalSlice';
import type { UISlice } from './uiSlice';
import type { InitSlice } from './initSlice';
import type { ImportExportSlice } from './importExportSlice';

export type StoreState = DocumentsSlice & TrashSlice & TerminalSlice &
  UISlice & InitSlice & ImportExportSlice;
export type SetState = (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void;
export type GetState = () => StoreState;
```

### 迁移步骤

1. 在每个 slice 文件中定义对应的 `XxxSlice` interface（从 storeHelpers.ts 搬运）
2. storeHelpers.ts 简化为类型交叉 + SetState/GetState 定义（~30 行）
3. 各 slice 使用 `SetState`/`GetState` 而非引用整个 StoreState（减少隐式依赖）
4. build + 验证

> 此任务与任务 4 有耦合，建议在任务 4 拆分 slice 后立即执行。

---

## 任务 6 (P1): 整理 `lib/editor/` 目录结构 + 消除命名混淆

### 当前问题

`src/lib/editor/` 根目录有 15 个 `.ts` 文件平铺，其中 `upload.ts` 和 `editorUpload.ts` 并存导致命名混淆。

### 当前文件清单

```
lib/editor/
├── blockNavigation.ts
├── clipboardUtils.ts
├── editorUpload.ts       ← upload.ts 的薄包装，命名混淆
├── fileUtils.ts
├── fonts.ts
├── idGen.ts
├── imageUtils.ts
├── inlinePasteHandler.ts
├── markdownUtils.ts
├── sectioning.ts
├── selectionUtils.ts
├── upload.ts
├── mermaid/
├── tiptapAdapter/
└── extensions/
```

### 目标结构

```
src/lib/editor/
├── blocks/                   // 块级操作
│   ├── blockNavigation.ts
│   ├── sectioning.ts
│   └── idGen.ts
├── clipboard/                // 剪贴板与粘贴
│   ├── clipboardUtils.ts
│   └── inlinePasteHandler.ts
├── media/                    // 文件上传与图片处理
│   ├── upload.ts             // 合并 editorUpload.ts 的逻辑
│   ├── imageUtils.ts
│   └── fileUtils.ts
├── text/                     // 文本与排版
│   ├── fonts.ts
│   ├── markdownUtils.ts
│   └── selectionUtils.ts
├── mermaid/                  // (已存在，不变)
├── tiptapAdapter/            // (已存在，不变)
└── extensions/               // (已存在，不变)
```

### 关键操作：合并 `upload.ts` + `editorUpload.ts`

先检查 `editorUpload.ts` 是否只是 `upload.ts` 的薄包装。如果是，将 `editorUpload.ts` 的额外逻辑合并到 `upload.ts` 中，删除 `editorUpload.ts`。全局搜索所有引用 `editorUpload` 的导入路径并更新为 `media/upload`。

### 迁移步骤

1. 创建 `blocks/`、`clipboard/`、`media/`、`text/` 子目录
2. 逐个移动文件到对应子目录
3. 合并 `editorUpload.ts` → `upload.ts`（或保留为独立文件但重命名以消除混淆）
4. 全局搜索替换所有导入路径
5. build + 验证

---

## 任务 7 (P2): 整理 `lib/` 根目录游离文件 + i18n 结构统一

### 7.1 游离文件归位

**当前**：
```
src/lib/
├── activityMeta.ts    ← 游离
├── toast.ts           ← 游离
├── core/
├── editor/
└── ...
```

**目标**：
- `toast.ts` → `lib/core/toast.ts`（UI 基础设施，与 core 同级）
- `activityMeta.ts` → `lib/core/activityMeta.ts`（文档活动元数据工具）

全局搜索替换导入路径。

### 7.2 i18n 文件/目录同名歧义消除

**当前**：
- `lib/core/i18n.ts`（hook + 类型，1491 bytes）
- `lib/core/i18n/translations.ts`（翻译数据，80KB）

文件与目录同名，模块解析歧义。

**目标**：
```
src/lib/core/i18n/
├── index.ts          // 原 i18n.ts 内容（useI18n hook + 类型导出）
└── translations.ts   // (不变)
```

迁移步骤：
1. 将 `i18n.ts` 内容移动到 `i18n/index.ts`
2. 删除 `i18n.ts`（目录中的 index.ts 会自动解析）
3. 确认 `lib/core/index.ts` 中的 `export { useI18n } from './i18n'` 仍正确
4. build + 验证

---

## 任务 8 (P3): 拆分其他大组件（>800 行）

### 8.1 `DocumentPanel.tsx`（1386 行）+ `DocumentSidebar.tsx`（1384 行）

这两个文件各 ~1385 行，位于 `src/components/editor/sectionEditor/`。建议：
- 通读后按功能区块拆分为子组件文件
- 具体拆分方案需进一步分析内部结构（留作后续细化）

### 8.2 `CodeBlockView.tsx`（1181 行）

位于 `src/components/editor/nodes/`。建议：
- 拆分语法高亮逻辑、复制/折叠交互、语言选择器为独立模块
- 具体拆分方案需进一步分析内部结构（留作后续细化）

### 8.3 `GeneralSection.tsx`（928 行）

位于 `src/components/settings/`。建议按设置分区拆分：
- 外观设置子组件
- 编辑器设置子组件
- 终端设置子组件
- AI/Agent 设置子组件
- 等等

---

## 执行顺序建议

```
任务 3 (storage 类型分离)  ──┐
                              ├──→ 任务 4 (拆 documentsSlice) ──→ 任务 5 (重构 storeHelpers)
任务 1 (拆 GraphCanvas)    ──┤
任务 2 (拆 AgentChat)      ──┤    （以上三个可并行）
                              │
任务 6 (整理 lib/editor)   ──┤
任务 7 (lib 根目录 + i18n) ──┘
                              
任务 8 (其他大组件)         ──── 最后处理
```

**推荐优先执行任务 3**，因为它解除了 store 层对 lib 层的类型依赖，是后续任务 4/5 的前置条件。

任务 1、2、3 之间无依赖，可并行（但需注意如果由不同 agent 并行修改，应使用 worktree 隔离）。

---

## 风险与注意事项

1. **循环依赖**：拆分后需确保无循环导入，特别是 `types/` ↔ `lib/` 之间
2. **Zustand slice 合并**：任务 4 拆分 slice 后，`create<StoreState>()((set, get) => ({ ...documentsSlice(set, get), ...trashSlice(set, get), ... }))` 的合并方式需正确处理
3. **GraphCanvas 拆分难度最高**：init effect 内部有大量闭包引用和 ref 交互，useGraphInit 和 useGraphEvents 的提取需要极其仔细
4. **导入路径全局替换**：任务 3/6/7 涉及大量导入路径变更，需用全局搜索确保无遗漏
5. **每个任务完成后立即 build + 功能验证**，避免问题累积
