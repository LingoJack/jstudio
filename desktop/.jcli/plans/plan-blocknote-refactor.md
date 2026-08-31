# BlockNote 重构方案

## 问题诊断

当前编辑器 `useSurfaceEditor.ts`（651 行）手写了所有 contentEditable 逻辑，存在根本性架构缺陷：

- `document.execCommand('bold')` — 已废弃 API
- `safeGetSelection()` / `blurSurfaceForMutation()` — 大量 WebKit `NotFoundError` hack
- 手动 TreeWalker 定位光标偏移量
- 无 Undo/Redo 系统（Notion 文章重点讲的 Transaction 栈完全缺失）
- React 重渲染与 DOM 状态冲突

## 核心思路

**BlockNote 管编辑体验，我们的 Store 管持久化。**

BlockNote（基于 ProseMirror）内部处理所有 contentEditable 复杂度：
- Undo/Redo（ProseMirror history 插件）
- 跨块选择、拖拽排序
- 斜杠命令菜单
- 富文本格式化
- 复制粘贴

我们只需要一个**双向数据转换层**，在 BlockNote 格式和我们的 `Block[]` 格式之间转换。

## 架构对比

```
当前架构:
  BlockEditor.tsx (contentEditable surface)
    → useSurfaceEditor.ts (651行手写逻辑) ← 全是 bug
    → BlockRouter → 18个 Block 组件 (各自渲染 contentEditable)
    → htmlToRichText / richTextToHtml (手动 HTML 转换)

重构后:
  BlockEditor.tsx (薄包装)
    → BlockNoteView (BlockNote 官方组件)
    → blockNoteAdapter.ts (数据转换层)
    → store (不变)
```

## 保留不变的部分

| 模块 | 原因 |
|------|------|
| `store/editorSlice.ts` | 块操作 API 不变 |
| `store/documentsSlice.ts` | 文档 CRUD 不变 |
| `store/uiSlice.ts` | UI 状态不变 |
| `lib/storage.ts` | Tauri IPC 不变 |
| `types/document.ts` | 持久化格式不变 |
| `types/richText.ts` | 持久化格式不变 |
| `components/DocumentList.tsx` | 侧边栏不变 |
| `components/Settings.tsx` | 设置页不变 |
| Tauri Rust 后端 | 完全不动 |
| `lib/migrate.ts` | 迁移逻辑不变 |

## 删除的部分

| 文件 | 行数 | 原因 |
|------|------|------|
| `useSurfaceEditor.ts` | 651 | 整个替换为 BlockNote 内部处理 |
| `SlashMenu.tsx` | - | BlockNote 内置斜杠菜单 |
| `BlockRouter.tsx` | 183 | BlockNote 自己渲染块 |
| `BlockHandle.tsx` | - | BlockNote 内置拖拽手柄 |
| `BlockContextMenu.tsx` | - | BlockNote 内置右键菜单 |
| `TextBlock.tsx` | - | BlockNote 内置 |
| `HeadingBlock.tsx` | - | BlockNote 内置 |
| `CalloutBlock.tsx` | - | BlockNote 内置 alert 块 |
| `CodeBlock.tsx` / `CodeBlockWrapper.tsx` | - | BlockNote 内置 code block |
| `BlockLine.tsx` | - | 不再需要 |
| `shared.tsx` | - | slash commands 等不再需要 |
| `htmlToRichText.ts` | 157 | 不再手动转换 HTML |
| `richTextToHtml.ts` | 93 | 不再手动转换 HTML |

## Block 类型映射

| 我们的类型 | BlockNote 方案 | 阶段 |
|-----------|---------------|------|
| `text` | 内置 `paragraph` | P0 |
| `heading-1/2/3` | 内置 `heading` | P0 |
| `code` | 内置 `codeBlock`（需 `@blocknote/code-block`） | P0 |
| `callout` | 内置 `alert` | P0 |
| `image` | 内置 `image` | P0 |
| `table` | 内置 `table`（需 `@blocknote/table`） | P1 |
| `toggle` | BlockNote 默认所有块支持子块嵌套 | P1 |
| `attachment` | 自定义块（Custom Block） | P2 |
| `web-embed` | 自定义块 | P2 |
| `canvas` | 自定义块 | P2 (后续迭代) |
| `whiteboard` | 自定义块 | P2 (后续迭代) |

**本次重构聚焦 P0**：先把核心编辑体验做对（text/heading/code/callout/image），确保无 bug。P1/P2 在后续 PR 中增量添加。

## 实施步骤

### Step 1: 安装依赖
```bash
npm install @blocknote/core @blocknote/react @blocknote/mantine @blocknote/code-block @blocknote/table
```

### Step 2: 创建数据转换层 `lib/blockNoteAdapter.ts`

双向转换器，这是整个重构的核心：

```typescript
// 我们的 Block[] → BlockNote PartialBlock[]
export function ourBlocksToBlockNote(blocks: Block[]): PartialBlock[]

// BlockNote blocks[] → 我们的 Block[]
export function blockNoteToOurBlocks(blocks: Block[]): Block[]

// RichText[] → BlockNote InlineContent[]
function richTextToInlineContent(rich: RichText[]): InlineContent[]

// BlockNote InlineContent[] → RichText[]
function inlineContentToRichText(ic: InlineContent[]): RichText[]
```

映射规则：
- `RichText.annotations.bold` → `InlineContent.styles.bold`
- `RichText.annotations.italic` → `InlineContent.styles.italic`
- `RichText.annotations.href` → `InlineContent.link` (link 格式)
- `RichText.annotations.color` → `InlineContent.styles.textColor`
- `Block.type` "heading-1" → BlockNote `type: "heading"`, `props.level: 1`

### Step 3: 重写 `BlockEditor.tsx`

```tsx
function BlockEditor() {
  const activeDoc = useStore(s => s.activeDoc);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // 创建 BlockNote editor 实例
  const editor = useCreateBlockNote({
    initialContent: activeDoc 
      ? ourBlocksToBlockNote(activeDoc.blocks) 
      : [{ type: "paragraph", content: [] }],
  });

  // 文档切换时重新加载内容
  useEffect(() => {
    if (activeDoc) {
      // 用 ProseMirror API 替换整个文档
      editor.replaceBlocks(
        editor.document,
        ourBlocksToBlockNote(activeDoc.blocks)
      );
    }
  }, [activeDoc?.id]);

  // 内容变化时同步到 store（防抖）
  const saveTimeoutRef = useRef<number>();
  const handleChange = () => {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const blocks = blockNoteToOurBlocks(editor.document);
      // 更新 store（批量，不触发重渲染循环）
      useStore.getState().setActiveDocBlocks(blocks);
    }, 300);
  };

  return (
    <div className="flex flex-col h-full">
      <input ref={titleInputRef} value={activeDoc.title} ... />
      <BlockNoteView editor={editor} onChange={handleChange} theme="dark" />
    </div>
  );
}
```

### Step 4: Store 适配

在 `editorSlice.ts` 中新增一个方法，用于批量替换文档的所有 blocks（不触发编辑器重载）：

```typescript
setActiveDocBlocks: (blocks: Block[]) => {
  const { activeDoc, documents } = get();
  if (!activeDoc) return;
  const updatedDoc = { ...activeDoc, blocks, updatedAt: new Date().toISOString() };
  set({
    activeDoc: updatedDoc,
    documents: documents.map(d => d.id === activeDoc.id ? updatedDoc : d),
  });
  scheduleDocumentSave(updatedDoc);
},
```

### Step 5: 样式适配

BlockNote 使用 Mantine 样式系统。需要确保 CSS 变量兼容：
- BlockNote 支持 `theme="light" | "dark"` 属性
- 用 CSS 覆盖将 BlockNote 的配色映射到现有 `--vscode-editor-*` 变量
- 字体大小、行高通过 CSS 调整匹配现有设计

### Step 6: 图片粘贴适配

BlockNote 内置图片处理，但需要自定义上传逻辑以存到 Tauri 文件系统：

```typescript
const uploadFile = async (file: File) => {
  // 调用 saveDocAsset 存到本地
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(arrayBuffer));
  const fileName = `image-${Date.now()}.${file.type.split('/')[1]}`;
  await storage.saveDocAsset(activeDocId, fileName, bytes);
  // 返回本地资源 URL（通过 Tauri asset protocol）
  return convertFileSrc(assetPath);
};

const editor = useCreateBlockNote({ uploadFile });
```

### Step 7: 清理旧代码

删除不再使用的文件（见上方"删除的部分"列表），清理 `components/index.ts` 和 `types/index.ts` 中的导出。

## 防止循环更新的关键

这是最容易出 bug 的地方：编辑器变化 → 更新 store → store 变化触发 React 重渲染 → 编辑器重新加载内容 → 又触发变化...

**解决方案**：
1. 编辑器内容变化时只更新 store 数据，不改变 `activeDoc` 引用（用 ref 存最新内容）
2. 只在 `activeDoc.id` 变化时（切换文档）才重新加载编辑器内容
3. 用防抖（300ms）减少 store 更新频率

## 验证清单

- [ ] 文档加载：打开已有文档，内容正确渲染
- [ ] 基础编辑：输入、删除、换行无光标跳动
- [ ] 块类型转换：`/` 命令、Markdown 快捷键（`# `, `## `）
- [ ] 富文本：Ctrl+B/I/U 加粗/斜体/下划线
- [ ] 拖拽排序：拖动块手柄重新排序
- [ ] Undo/Redo：Ctrl+Z/Ctrl+Shift+Z 正确工作
- [ ] 复制粘贴：纯文本和富文本粘贴正常
- [ ] 图片粘贴：粘贴图片自动保存到本地
- [ ] 文档切换：切换文档内容不串
- [ ] 持久化：关闭重开数据不丢失
- [ ] 构建通过：`npm run build` 无 TS 错误

## 风险与回退

- **风险**：BlockNote 版本兼容性（React 18+ / Tauri WebView）
- **回退方案**：所有新代码在新文件中，旧代码保留（重命名为 `.bak`），随时可切回
- **渐进式**：先合并 P0（核心块），验证稳定后再添加 P1/P2
