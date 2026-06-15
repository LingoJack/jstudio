# 修复块缩进 + 主题适配 Light/Dark

## 问题诊断

### 问题 1：块内容缩进过多（双重 padding 叠加）
- **外层容器** `BlockEditor.tsx:205` 有 Tailwind 的 `px-4 md:px-12 lg:px-20`（最大 80px）
- **BlockNote 内部** `.bn-editor` 自带 `padding-inline: 54px`（`@blocknote/core/editor.css:5`）
- 两者叠加 → 内容被推得很靠右，看起来像"缩进"

### 问题 2：BlockNote 主题硬编码为 dark
- `BlockEditor.tsx:224` 硬编码 `theme="dark"`
- 切换到 light 主题时，编辑器内部（`.bn-root`）仍是暗色 CSS 变量，与应用其他部分不一致

### 问题 3：各种 block 样式硬编码 RGB（未适配主题）
BlockNote `Block.css` 中以下选择器使用了固定颜色，light/dark 下都不合适：

| Block | 选择器 | 硬编码值 | 问题 |
|-------|--------|----------|------|
| 代码块 | `.bn-block-content[data-content-type="codeBlock"]` | `background: rgb(22 22 22); color: white;` | 永远黑底白字 |
| 代码块语言选择 | `…codeBlock > div > select` | `color: white;` option `color: black` | light 下不可见 |
| 引用 | `[data-content-type="quote"] blockquote` | `border-left: rgb(125,121,122); color: rgb(125,121,122)` | 固定灰 |
| 分割线 | `[data-content-type="divider"] hr` | `border-top: rgb(125,121,122)` | 固定灰 |
| 分页符 | `.bn-block-content[data-content-type="pageBreak"] > div` | `border-top: rgb(125,121,122)` | 固定灰 |
| 文件按钮 | `[data-file-block] .bn-add-file-button` | `bg: rgb(242,241,238); color: rgb(125,121,122)` | light 专属，dark 靠 `.where(.dark)` 切换 |
| 文件名 hover | `.bn-add-file-button:hover` | `rgb(225,225,225)` | 固定浅灰 |
| 选中边框 | `.ProseMirror-selectednode > .bn-block-content` | `outline: rgb(100,160,255)` | 固定蓝 |

---

## 修改方案

### 改动 1：消除双重 padding（vscode-theme.css）
将 `.bn-editor` 的内置 `padding-inline` 清零，让外层 Tailwind padding 统一控制间距：

```css
.bn-editor-container .bn-editor {
  padding-inline: 0 !important;
}
```

### 改动 2：BlockNote theme 跟随应用主题（BlockEditor.tsx）
```tsx
const isDarkMode = useStore((s) => s.isDarkMode);
...
<BlockNoteView
  editor={editor}
  onChange={handleChange}
  theme={isDarkMode ? "dark" : "light"}
  slashMenu={false}
>
```

### 改动 3：各 block 样式适配 light/dark（vscode-theme.css）
追加一个专门的 BlockNote 样式覆盖区块，使用 VS Code 主题变量：

```css
/* ============================================
   BlockNote Block 样式适配 light/dark
   ============================================ */

/* 代码块 — 使用 VS Code codeBlock 背景/前景色 */
.bn-block-content[data-content-type="codeBlock"] {
  background-color: var(--vscode-textCodeBlock-background);
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-widget-border);
}
/* 代码块语言选择器 */
.bn-block-content[data-content-type="codeBlock"] > div > select {
  color: var(--vscode-editor-foreground);
}
.bn-block-content[data-content-type="codeBlock"] > div > select > option {
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editorWidget-background);
}

/* 引用块 */
[data-content-type="quote"] blockquote {
  border-left-color: var(--vscode-textBlockQuote-border);
  color: var(--vscode-descriptionForeground);
  background: var(--vscode-textBlockQuote-background);
  padding: 8px 14px;
  border-radius: 0 4px 4px 0;
}

/* 分割线 */
[data-content-type="divider"] hr {
  border-top-color: var(--vscode-panel-border);
}

/* 分页符 */
.bn-block-content[data-content-type="pageBreak"] > div {
  border-top-color: var(--vscode-panel-border);
}

/* 文件/图片上传按钮 */
[data-file-block] .bn-add-file-button {
  background-color: var(--vscode-button-secondaryBackground);
  color: var(--vscode-descriptionForeground);
}
.bn-editor[contenteditable="true"] [data-file-block] .bn-add-file-button:hover,
[data-file-block] .bn-file-name-with-icon:hover,
.ProseMirror-selectednode .bn-file-name-with-icon {
  background-color: var(--vscode-list-hoverBackground);
}

/* 选中块边框 */
.bn-block-content.ProseMirror-selectednode > *,
.ProseMirror-selectednode > .bn-block-content > * {
  outline-color: var(--vscode-focusBorder);
}
```

---

## 涉及文件
| 文件 | 改动 |
|------|------|
| `src/components/BlockEditor.tsx` | theme prop 动态化（`isDarkMode ? "dark" : "light"`）|
| `src/styles/vscode-theme.css` | 追加 padding 修复 + BlockNote block 样式覆盖区 |

## 验证方式
1. `npm run dev` 启动，切换 dark/light 主题，检查：
   - 块内容不再有多余缩进，左右对齐正常
   - 代码块背景/文字在 light 下是浅灰底深色字，dark 下是深灰底浅色字
   - 引用块、分割线、文件按钮颜色跟随主题
2. 检查 `/` 菜单、拖拽 handle 等在两种主题下可用
