# 经验条目格式规范

## 文件结构

一个文件一条经验，由 YAML frontmatter + 五个必需章节 + 可选章节构成，顺序固定：

```
---
title / date / area / tags / status
---

## 背景
## 表现
## 根因
## 解决
## 相关改动
## 复用提示（可选）
```

## frontmatter 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 是 | 「现象 + 定位」一句话，20 字以内优先，用于查重与索引 |
| `date` | 是 | 结论确认日期，ISO 格式 `YYYY-MM-DD` |
| `area` | 是 | 子系统或模块，小写连字符，如 `desktop/editor`、`backend/api`、`build` |
| `tags` | 否 | 检索用关键词数组，尽量用代码里的真实标识符（类名、CSS 属性、库名） |
| `status` | 是 | `active` / `superseded-by: <文件名>` / `deprecated` |
| `source` | 否 | 来源线索，如任务描述、issue、commit 号 |

## 五个必需章节

### 背景

交代事情发生在哪：模块、场景、触发动作、环境或版本。要写成别人能照着复现的前置条件，不写评价。

- 写：`DocumentTabs.tsx` 的胶囊式 tab 栏，macOS + WKWebView，关闭 tab 时触发。
- 不写：最近在优化 tab 栏体验时。

### 表现

观测到的事实：报错原文、日志片段、界面现象、复现步骤、与预期行为的差异。数字写具体（遮挡 10px、高度 46px），不写"有点""略微"。

### 根因

机制层面的原因，拆到能按步骤讲通为止，落到可验证的位置：文件:行、函数名、规范条款、版本号。

- `sectionHighlightSelection.ts` 的 `buildDecorations` 用 `Decoration.inline` 只画文本范围，序号在 `padding-left: 2em` 的排水沟里，不在文本范围内。
- 规范要求：CSS 规范中一轴非 `visible` 时，另一轴的 `visible` 会被计算成 `auto`。

推测未证实的部分单独标注或删除，不混进根因。

### 解决

实际改法：具体改动、关键代码或命令、以及为什么这样改命中了根因。给关键代码片段（5 到 15 行以内），长代码给路径 + 行号。

### 相关改动

落地清单，一行一项：

```
- `desktop/src/components/documents/DocumentTabs.tsx:42` —— scrollIntoView 改为手动设置 scrollLeft
- `desktop/src/styles/vscode-theme.css:118` —— 新增 .scrollbar-none 工具类
```

附 commit 号或 PR 链接（有则写）。

### 复用提示（可选）

下次遇到同类现象时第一步查什么、哪些做法已被验证不可用。这是条目的"检索入口"，有就写。

## 合格示例

```markdown
---
title: tab 栏关闭时底部闪白条
date: 2026-09-02
area: desktop/ui
tags: [scrollbar, wkwebview, css]
status: active
---

## 背景
DocumentTabs 的胶囊式 tab 栏（内层横向滚动容器）在 macOS WKWebView 中运行，关闭任一 tab 时触发。

## 表现
关闭 tab 的一瞬间，tab 底部出现一条约 10px 高的浅色横条，位置固定在 strip 底部。

## 根因
白条是内层滚动容器的原生水平滚动条。全局 `vscode-theme.css` 有 `::-webkit-scrollbar { height: 10px }` 且 `track: transparent`，把 overlay 滚动条变成 10px 常驻条，透明 track 透出胶囊浅色玻璃底。TabBar 只用 `scrollbar-width: none` 隐藏它，而 WKWebView 在 Safari 18.2 之前不支持该标准属性，因此未生效。

## 解决
新增工具类同时覆盖两个引擎：

```css
.scrollbar-none { scrollbar-width: none }
.scrollbar-none::-webkit-scrollbar { display: none }
```

capsule 与内层 strip 都挂上，滚动能力保留（滚轮、触控板、scrollLeft 仍可用），溢出方向由渐变遮罩提示。

## 相关改动
- `desktop/src/styles/vscode-theme.css` —— 新增 `.scrollbar-none`
- `desktop/src/components/ui/TabBar.tsx` —— capsule 与 strip 挂载该工具类

## 复用提示
排查同类"多出来的条带/色块"时，先查全局 `::-webkit-scrollbar` 规则是否把它变成常驻条；隐藏滚动条在 WKWebView 必须同时写两条。
```

## 常见不合格写法

| 不合格 | 问题 | 改法 |
|--------|------|------|
| 根因写"配置没配好" | 无法验证 | 写清是哪个配置项、在哪、正确值是什么 |
| 解决写"调整了实现逻辑" | 无法执行 | 写具体改动与代码位置 |
| 表现写"页面显示异常" | 无法检索 | 写现象、位置、数值、复现步骤 |
| 相关改动写"见 git 记录" | 无法定位 | 列文件路径与改动点 |
| 一条里塞三个问题 | 无法单条复用 | 拆成三条，各自独立成文 |
| 章节里出现 emoji | 违反仓库约定 | 删除 |
