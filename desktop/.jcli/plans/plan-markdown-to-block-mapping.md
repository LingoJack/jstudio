# Plan: Markdown 语法映射 + Markdown 文档导入

## 目标

1. **Markdown 语法到块的映射**：粘贴 Markdown 文本时，自动解析为结构化块（标题、列表、代码块、引用等），而非以纯文本插入。
2. **Markdown 文档导入**：从 DocumentList 的"+"按钮区域提供「导入 Markdown」入口，选择 `.md` 文件后创建新文档，内容自动转换为块。

## 架构分析

经过对代码的深入阅读，关键发现：

- **数据模型**：`Block[]` 是核心模型，每个 Block 有 `type: BlockType`、`content: RichText[] | string`、`properties: BlockProperties`
- **已有适配器**：`tiptapAdapter.ts` 已实现 `Block[]` ↔ TipTap JSON 双向转换，可直接复用
- **已有粘贴处理**：`editorPasteDrop.ts` 的 `createPasteHandler` 已有纯文本粘贴路径（第 56 行）
- **已有文件读取**：`storage.readFileBytes(path)` 可读取任意路径文件（返回 `number[]`），无需新增 Rust 命令
- **已有对话框**：`@tauri-apps/plugin-dialog` 的 `open()` 已在 FileView/ImageView 中使用

## 核心方案

`Markdown 文本 → marked 解析为 HTML → DOM 遍历 → 原生 Block[]`

直接生成我们的 `Block[]` 格式（不经过 TipTap），因为每个 BlockType 的结构已完全明确。粘贴场景再通过现有 `ourBlocksToTiptapJSON()` 转换插入编辑器。

### 新增依赖

```bash
npm install marked
```

`marked`：~30KB、零依赖、最成熟的 Markdown 解析器，输出标准 HTML 可由浏览器 DOM API 直接遍历。

## Markdown → Block[] 映射规则

| Markdown 语法 | HTML 元素 | JStudio BlockType | content 类型 |
|---|---|---|---|
| `#` `##` `###` | `<h1>` `<h2>` `<h3>` | heading-1/2/3 | `RichText[]` |
| 段落 | `<p>` | text | `RichText[]` |
| `>` | `<blockquote>` | quote | `RichText[]` |
| ` ```lang ``` ` | `<pre><code>` | code | `RichText[]` + properties.language |
| `- ` `* ` | `<ul><li>` | bullet-list | `RichText[][]` |
| `1.` | `<ol><li>` | ordered-list | `RichText[][]` |
| `![alt](url)` | `<img>` | image | `string` (url) |
| GFM 表格 | `<table>` | table | properties.tableData |
| `---` | `<hr>` | text | `[]` (空分隔) |

行内格式：`<strong>`→bold, `<em>`→italic, `<code>`→inline code(忽略), `<a href>`→link, `<del>`→strikethrough, `<u>`→underline

## 实施步骤

### 1. 安装依赖
```bash
npm install marked
```

### 2. 新增 `src/lib/markdown.ts` — Markdown 解析核心（~200 行）

导出两个函数：
```typescript
export function markdownToBlocks(md: string): Block[]
export function isLikelyMarkdown(text: string): boolean
```

**`markdownToBlocks` 实现流程**：
1. `marked.parse(md, { breaks: true, gfm: true })` → HTML 字符串
2. `document.createElement('div'); div.innerHTML = html` → DOM 容器
3. 遍历 `div.children`，每个顶层元素映射为一个 Block：
   - `<h1>/<h2>/<h3>` → heading-1/2/3
   - `<p>` → text（若内含 `<img>` 则直接映射为 image block）
   - `<blockquote>` → quote
   - `<pre>` → code（从 class 提取 language）
   - `<ul>` → bullet-list
   - `<ol>` → ordered-list
   - `<table>` → table（遍历 `<tr>/<td>/<th>` 构建 TableData）
   - `<hr>` → 空文本块
4. 行内格式：递归遍历 DOM 子节点构建 `RichText[]`

**`isLikelyMarkdown` 实现逻辑**：
检测是否含有 Markdown 块级语法标记（多行文本中是否存在 `# `, `## `, `- `, `* `, `> `, ` ``` `, `1. `, `---` 等行首模式），避免误判普通纯文本。

### 3. 修改 `src/lib/editorPasteDrop.ts` — 粘贴识别 Markdown

在 `createPasteHandler` 中，修改第 55-57 行的纯文本粘贴路径：

```typescript
// 原代码:
if (!hasFileItem && (plainText || htmlText)) return false;

// 新逻辑:
if (!hasFileItem && plainText) {
  // 优先检测 HTML 内容（已有的 HTML 粘贴保持不变）
  if (htmlText) return false;  // 让 TipTap 处理 HTML
  // 纯文本场景：检测 Markdown
  if (isLikelyMarkdown(plainText)) {
    event.preventDefault();
    const blocks = markdownToBlocks(plainText);
    const tiptapJSON = ourBlocksToTiptapJSON(blocks);
    editorRef.current?.chain().focus().insertContent(tiptapJSON).run();
    return true;
  }
  return false;  // 普通纯文本，保持原行为
}
```

### 4. 修改 `src/store/storeHelpers.ts` — 类型声明

在 `StoreState` 接口中添加：
```typescript
importDocumentFromMarkdown: (filename: string, md: string) => Promise<void>;
```

### 5. 修改 `src/store/documentsSlice.ts` — 导入方法

在 `createDocumentsSlice` 中添加 `importDocumentFromMarkdown`：
```typescript
importDocumentFromMarkdown: async (filename, md) => {
  const { markdownToBlocks } = await import('../lib/markdown');
  const blocks = markdownToBlocks(md);
  const title = filename.replace(/\.(md|markdown|mdown)$/i, '');
  // 从 Markdown 第一行标题提取（如果有 # 开头的）
  const firstHeading = md.match(/^#\s+(.+)$/m);
  const docTitle = firstHeading ? firstHeading[1].trim() : title;

  const newDoc: Document = {
    id: `doc-${Date.now()}`,
    title: docTitle,
    emoji: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    blocks: blocks.length > 0 ? blocks : [{
      id: `block-${Date.now()}-initial`,
      type: 'text', content: [], properties: {},
    }],
  };
  await storage.saveDocument(newDoc);
  const meta = toMeta(newDoc);
  const newDocList = [meta, ...get().docList];
  const newDocuments = [newDoc, ...get().documents];
  await storage.saveIndex(newDocList);
  set({ docList: newDocList, documents: newDocuments, activeDoc: newDoc, activeDocId: newDoc.id });
},
```

### 6. 修改 `src/components/DocumentList.tsx` — 导入 UI

在头部区域"+"按钮旁增加「导入 Markdown」按钮：

```tsx
import { FolderDot, FileText, Plus, FileDown } from 'lucide-react';

// 在 createDocument 按钮旁新增:
<button
  onClick={handleImportMarkdown}
  className="... (与新建按钮同样的样式类)"
  title={t('doclist.importMarkdown')}
>
  <FileDown className="w-4 h-4" />
</button>
```

新增处理函数：
```typescript
const importDocumentFromMarkdown = useStore((s) => s.importDocumentFromMarkdown);

const handleImportMarkdown = useCallback(async () => {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const filePath = await open({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] }],
  });
  if (!filePath || typeof filePath !== 'string') return;
  const bytes = await storage.readFileBytes(filePath);
  const md = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  await importDocumentFromMarkdown(filePath.split('/').pop() ?? 'Untitled.md', md);
}, [importDocumentFromMarkdown]);
```

### 7. 修改 `src/lib/i18n.ts` — 新增翻译

在两个语言对象的 `doclist` 分组中添加：
- zh: `'doclist.importMarkdown': '导入 Markdown'`
- en: `'doclist.importMarkdown': 'Import Markdown'`

## 不涉及的部分

- **无需新增 Rust 命令**：复用已有的 `read_file_bytes`
- **无需修改 TipTap 扩展**：粘贴通过 `insertContent` 插入 JSON，导入直接设置 Block[]
- **无需修改块组件**：块组件只做展示，不受影响

## 注意事项

- **不破坏现有粘贴行为**：图片粘贴、HTML 粘贴逻辑完全不变，仅增强纯文本路径
- **行内格式保留**：bold/italic/code/link/strikethrough 正确映射到 RichText annotations
- **空文档兜底**：Markdown 解析结果为空时至少创建一个空 text block
- **GFM 支持**：开启 `gfm: true` 支持表格、删除线等扩展语法
- **标题提取**：导入时优先从 Markdown 的 `# 标题` 提取文档标题
- **编码规范**：遵循项目约定——storage 层封装所有 Tauri IPC，store 操作通过 slice
