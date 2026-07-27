# 支持四级及以上标题（heading-4/5/6）

## 问题根因

`BlockType` 仅定义了 `heading-1 | heading-2 | heading-3`。当粘贴 / 导入包含 `#### 四级标题` 及更深层级的 Markdown 时：

1. `@tiptap/markdown` 正确解析出 `level: 4/5/6` 的 heading 节点（StarterKit 的 Heading 默认 levels = [1,2,3,4,5,6]，schema 层面是支持的）。
2. 但编辑器内容同步回 store 时，`tiptapJSONToOurBlocks()` → `tiptapTypeToOurType()` 只处理 level 1/2/3，**level 4/5/6 全部被降级为 `heading-1`**。
3. 下次从 store 渲染（`ourBlockToTiptapJSON()` → `headingLevel()`）时，原本的 4/5/6 级标题就变成了 level 1。

这解释了"有时候不准确"——粘贴瞬间编辑器内可能显示对（ProseMirror doc 保留了真实 level），但经过 store 往返后就塌缩成一级标题了。

## 修改清单

### 1. `src/types/document.ts` — 类型定义
`BlockType` 增加 `'heading-4' | 'heading-5' | 'heading-6'`。

### 2. `src/lib/editor/tiptapAdapter/blocks.ts` — 核心转换（核心）
- `headingLevel()`：增加 `heading-4/5/6` → 4/5/6 的 case。
- `ourTypeToTiptapType()`：`heading-4/5/6` 归入 → `'heading'` 分支。
- `tiptapTypeToOurType()`：level 4/5/6 → `heading-4/5/6`；未知/越界 level 仍 fallback 到 `heading-1`（更健壮）。
- `ourBlockToTiptapJSON()` switch：`heading-4/5/6` 并入 heading case（与 1/2/3 共用，设置 `level` attr）。
- `tiptapJSONToOurBlock()` switch：`heading-4/5/6` 并入 text/heading case（共用 inline 提取）。

### 3. `src/components/editor/sectionEditor/SectionOutline.tsx` — 大纲
- `extractHeadingsFromBlocks()`：识别 `heading-4/5/6`，提取 level 4/5/6。
- `extractHeadingsFromEditors()`：放宽 level 检查 `<= 3` → `<= 6`。

### 4. `src/styles/vscode-theme.css` — 样式
在 `.ProseMirror h3` 之后增加 `h4/h5/h6` 样式，逐级递减字号/字重（与现有 h1/h2/h3 的递减趋势一致）：
- h4: 1.1rem / 600 / margin-top 0.875em
- h5: 1rem / 600 / margin-top 0.75em
- h6: 0.9rem / 600 / margin-top 0.75em
- margin-bottom 统一 0.5em

### 5. `src/lib/editor/tiptapAdapter/index.ts` — 注释
mapping summary 注释 `heading-1/2/3` → `heading-1..6`。

## 不需要改的
- `extensions.ts`：StarterKit Heading 默认 levels 已含 1-6，schema 已支持。
- `pasteMarkdown.ts` / `markdownImport.ts`：解析逻辑正确，问题在 adapter 层（已在 #2 覆盖）。
- `sectioning.ts`：按 block 数量分块，不基于 heading 层级。
- slashMenu heading1/2/3 命令：本次不扩展斜杠菜单入口，聚焦"粘贴/导入能正确渲染与往返"。后续可按需补充。

## 验证
- 粘贴含 `#### / ##### / ######` 的 Markdown，标题层级正确保留，刷新后不塌缩。
- 大纲面板正确显示 4/5/6 级标题及其缩进层级。
- 已有 h1/h2/h3 文档不受影响。
