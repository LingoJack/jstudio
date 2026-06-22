# 帮助文档重设计：让 HelpSection 看起来像一篇真实的 JStudio 文档

## 目标

将 `HelpSection.tsx` 从普通的设置面板样式，重设计为**看起来像用 JStudio 自身编辑器创建的一篇预写的只读文档**。复用编辑器的视觉体系（`.ProseMirror` CSS 规则、相同的 padding 布局、文档标题样式），让用户打开帮助时感觉就像打开了一篇文档，而不是一个设置页面。

## 设计思路

### 为什么用静态 HTML + `.ProseMirror` 类，而不是真的创建 TipTap 实例？

JStudio 的全部文档样式都通过 CSS 选择器 `.ProseMirror h1`、`.ProseMirror p`、`.ProseMirror code` 等定义。只要给容器加上 `ProseMirror` 类，所有这些样式规则就会自动生效。因此最简洁、最高性能的方案是：

- 用一个带 `className="ProseMirror"` 的 `<div>` 包裹静态 JSX 内容
- 内容使用原生 HTML 元素（`<h1>`/`<h2>`/`<p>`/`<ul>`/`<pre>`/`<blockquote>` 等）
- 无需引入 TipTap 运行时开销，视觉效果 100% 一致

### 布局复用

复用 `BlockEditor.tsx` 的布局结构：
- 外层：`px-4 md:px-12 lg:px-20 pt-8 pb-8`
- 文档标题区：`text-4xl font-bold`（与编辑器标题一致）
- 正文区：`.ProseMirror` 容器

### 只读文档体验

- 移除 `SectionCard` 等设置面板样式
- 添加一个右上角"只读"徽章，增强文档感
- 内容不可编辑（静态渲染）

## 实现步骤

### 1. 重写 `HelpSection.tsx`

将整个组件重写为文档视图：

```
<div className="文档容器布局">
  <div className="右上角只读徽章">
  <div className="文档标题区">
    <h1>使用帮助</h1>
    <p className="副标题/元信息">JStudio 完全使用指南</p>
  </div>
  <div className="ProseMirror">  ← 关键：复用编辑器样式
    ...富文本内容...
  </div>
</div>
```

### 2. 丰富帮助内容（中文）

文档结构：

| 章节 | 内容 |
|------|------|
| **欢迎** | JStudio 简介、核心理念（离线优先、本地存储） |
| **快速上手** | 创建文档、编辑文本、自动保存 |
| **块类型一览** | 所有支持的块类型及用途（文本、标题、引用、代码、图片、表格、画布、白板、Web 嵌入、附件、折叠块） |
| **Markdown 快捷输入** | `# ` → H1, `## ` → H2, `> ` → 引用, ``` ``` → 代码块, `- ` → 列表 等 |
| **斜杠命令** | 输入 `/` 唤出命令菜单 |
| **键盘快捷速查** | 常用快捷键表（Enter、Shift+Enter、Backspace、Cmd+B/I 等） |
| **数据与存储** | 文件存储位置、每文档独立文件夹、防抖写入 |
| **常见问题** | FAQ |

### 3. 使用原生 HTML 元素让 CSS 自动生效

所有内容元素使用与编辑器输出相同的 HTML 结构：
- `<h1>` / `<h2>` / `<h3>` — 标题
- `<p>` — 段落
- `<ul>` / `<ol>` / `<li>` — 列表
- `<blockquote>` — 引用块
- `<pre><code>` — 代码块
- `<code>` — 行内代码
- `<strong>` / `<em>` — 粗体/斜体
- `<hr>` — 分割线

### 4. 样式微调

在 `HelpSection.tsx` 的组件级 CSS（或内联）中补充：
- `.ProseMirror` 容器内的 `p` 默认间距（编辑器里由 TipTap 管理，静态 HTML 需要手动设 `margin`）
- 只读徽章样式
- 文档标题副标题样式

## 涉及文件

| 文件 | 操作 |
|------|------|
| `src/components/settings/HelpSection.tsx` | **重写** — 从设置卡片改为文档视图 |

## 风险与注意事项

1. **`.ProseMirror` 的 `p` 间距**：TipTap 自动给 `<p>` 加间距，但静态 HTML 中 `<p>` 默认无 margin。需要在容器上加最小 CSS（`p { margin: 0.5em 0 }`）让排版一致。
2. **不引入 TipTap**：纯静态渲染，不创建 EditorContent 实例，避免性能开销和状态管理复杂度。
3. **暗色模式兼容**：所有颜色通过 `var(--vscode-*)` 变量，自动适配暗色。
