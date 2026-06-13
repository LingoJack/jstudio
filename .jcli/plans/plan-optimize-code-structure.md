# OmniNote 代码结构优化方案

## 一、当前问题分析

| 问题 | 严重度 | 说明 |
|------|--------|------|
| Store 过大 (447行) | 高 | `useStore.ts` 包含文档CRUD、块操作、剪贴板、撤销重做、UI状态等所有逻辑 |
| useBlockEditor 过大 (578行) | 高 | 包含键盘导航、块操作、Slash菜单、焦点管理等全部逻辑 |
| Block 文件位置不一致 | 中 | `WebEmbedBlock.tsx`、`AttachmentBlock.tsx`、`CodeBlock.tsx` 在 `components/` 下而非 `components/blocks/` 下 |
| 类型定义混在一起 | 中 | `types.ts` (108行) 混合了文档类型、块类型、UI状态类型 |
| Tailwind 类名大量重复 | 中 | 按钮、工具栏等 UI 组件在多个文件中重复相同的类名字符串 |
| 缺少 barrel exports | 低 | 没有 `index.ts` 文件，导入路径冗长 |
| LocalFolder.tsx 过大 (456行) | 中 | 文件夹浏览、文件读取、拖拽逻辑全部混在一个组件中 |

## 二、重构方案

### Phase 1: Block 文件归位（移动文件，修正导入路径）

**目标**: 所有 block 组件统一放在 `components/blocks/` 下

| 操作 | 说明 |
|------|------|
| 移动 `components/CodeBlock.tsx` → `components/blocks/CodeBlock.tsx` | 独立代码块组件 |
| 移动 `components/WebEmbedBlock.tsx` → `components/blocks/WebEmbedBlock.tsx` | 网页嵌入块 |
| 移动 `components/AttachmentBlock.tsx` → `components/blocks/AttachmentBlock.tsx` | 附件块 |
| 更新 `BlockRouter.tsx` 中的导入路径 | 修正引用 |
| 更新 `CodeBlockWrapper.tsx` 中的导入路径 | 修正引用 |

### Phase 2: 拆分 Store（447行 → 3个 slice + 1个组合文件）

**目标**: 按职责拆分 Zustand store

```
src/store/
├── useStore.ts          (组合入口，~30行)
├── documentsSlice.ts    (文档CRUD，~120行)
├── editorSlice.ts       (块操作/剪贴板/撤销重做，~180行)
└── uiSlice.ts           (UI状态：当前视图、选中文档等，~80行)
```

- **documentsSlice**: `documents`, `createDocument`, `deleteDocument`, `updateDocument`, `duplicateDocument`, `toggleFavorite`
- **editorSlice**: `updateBlock`, `addBlock`, `deleteBlock`, `moveBlock`, `copyBlock`, `pasteBlock`, `undo`, `redo`
- **uiSlice**: `activeDocumentId`, `setActiveDocument`, `currentView`, `setCurrentView`, `selectedBlockId`, `setSelectedBlockId`

### Phase 3: 拆分 useBlockEditor hook（578行 → 3个子 hook + 1个组合 hook）

**目标**: 将巨大的 hook 按职责拆分

```
src/components/blocks/
├── useBlockEditor.ts          (组合入口 + 主逻辑，~100行)
├── useKeyboardNavigation.ts   (键盘导航：上下移动、Enter/Backspace，~180行)
├── useBlockOperations.ts      (块的增删改、类型转换，~150行)
└── useSlashCommand.ts         (Slash 菜单触发和命令处理，~100行)
```

### Phase 4: 提取共享 UI 组件和常量

**目标**: 消除重复的 Tailwind 类名模式

```
src/
├── components/
│   └── ui/
│       ├── IconButton.tsx      (统一的图标按钮组件)
│       └── BlockToolbar.tsx    (块工具栏容器)
├── lib/
│   ├── constants.ts            (BLOCK_TYPES, SLASH_COMMANDS 等常量)
│   └── blockUtils.ts           (块相关的纯函数工具)
```

**重复模式示例**（出现在 WebEmbedBlock、AttachmentBlock 等至少 3 个文件中）：
```
"cursor-pointer inline-flex items-center justify-center w-6 h-6 rounded text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
```
→ 抽取为 `<IconButton>` 组件

### Phase 5: 拆分类型定义

**目标**: 按领域分离类型

```
src/types/
├── index.ts        (barrel export)
├── document.ts     (Document, Block, BlockType 等)
└── editor.ts       (EditorState, ViewType 等)
```

保留 `src/types.ts` 作为 re-export 入口，避免大规模修改导入路径。

### Phase 6: 添加 barrel exports

**目标**: 简化导入路径

```
src/components/blocks/index.ts   (导出所有 block 组件)
src/store/index.ts               (导出 store hooks)
src/lib/index.ts                 (导出工具函数)
```

## 三、重构后的目录结构

```
src/
├── main.tsx
├── App.tsx
├── types.ts                       (re-export from types/)
├── index.css
├── styles/vscode-theme.css
│
├── types/
│   ├── index.ts
│   ├── document.ts
│   └── editor.ts
│
├── store/
│   ├── index.ts
│   ├── useStore.ts                (组合入口)
│   ├── documentsSlice.ts
│   ├── editorSlice.ts
│   └── uiSlice.ts
│
├── lib/
│   ├── index.ts
│   ├── storage.ts
│   ├── migrate.ts
│   ├── constants.ts               (新增)
│   └── blockUtils.ts              (新增)
│
├── data/
│   └── defaultData.ts
│
├── components/
│   ├── ui/                        (新增)
│   │   ├── IconButton.tsx
│   │   └── BlockToolbar.tsx
│   ├── BlockEditor.tsx
│   ├── DocumentList.tsx
│   ├── LocalFolder.tsx
│   ├── ArticleOutline.tsx
│   │
│   └── blocks/
│       ├── index.ts               (新增 barrel export)
│       ├── BlockRouter.tsx
│       ├── useBlockEditor.ts      (精简后)
│       ├── useKeyboardNavigation.ts  (新增)
│       ├── useBlockOperations.ts     (新增)
│       ├── useSlashCommand.ts        (新增)
│       ├── types.ts
│       ├── shared.tsx
│       ├── SlashMenu.tsx
│       ├── ContentEditableBlock.tsx
│       ├── TextBlock.tsx
│       ├── HeadingBlock.tsx
│       ├── CalloutBlock.tsx
│       ├── ToggleBlock.tsx
│       ├── ImageBlock.tsx
│       ├── TableBlock.tsx
│       ├── CanvasBlock.tsx
│       ├── WhiteboardBlock.tsx
│       ├── CodeBlock.tsx          (从 components/ 移入)
│       ├── CodeBlockWrapper.tsx
│       ├── WebEmbedBlock.tsx      (从 components/ 移入)
│       └── AttachmentBlock.tsx    (从 components/ 移入)
```

## 四、实施顺序

1. **Phase 1** — Block 文件归位（低风险，仅移动文件+修改导入）
2. **Phase 5** — 拆分类型定义（低风险，纯类型重组）
3. **Phase 2** — 拆分 Store（中风险，需仔细验证状态组合）
4. **Phase 3** — 拆分 useBlockEditor（中风险，需验证键盘行为）
5. **Phase 4** — 提取共享 UI 组件（低风险，渐进式替换）
6. **Phase 6** — 添加 barrel exports（低风险，收尾优化）

每个 Phase 完成后运行 `npm run build` 验证编译通过。

## 五、不修改的部分

- 业务逻辑和功能行为保持完全一致
- Tauri 后端代码 (`src-tauri/`) 不做修改
- CSS 主题文件不做修改
- `defaultData.ts` 不做修改（纯数据文件，结构已合理）
