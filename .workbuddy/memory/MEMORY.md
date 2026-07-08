# JStudio 项目长期记忆

## 分段编辑器（SectionedBlockEditor）架构要点

- 大文档按 SECTION_SIZE=30 切分为多个独立 ProseMirror 实例，解决大文档输入卡顿
- `setContent({ emitUpdate: false })` 加载内容时不触发 onUpdate，store 的 `activeDoc.blocks` 不会被同步——只有用户编辑后 debounce flush 才会 `setActiveDocBlocks`
- `setActiveDocBlocks` 有 ownership guard：`docId !== activeDoc.id → return`，防止切换文档时把旧文档编辑写到新文档
- **文档切换时必须 flush outgoing doc**：SectionedBlockEditor 的 load effect 里用 `flushBlocksToDoc(outgoingDocId, full)` 保存旧文档编辑（遍历所有 section editor 的 `getJSON()` 序列化当前内容），否则 pending edits 被丢弃
- SectionOutline 大纲提取用**双源合并**：store `activeDoc.blocks`（覆盖未挂载 section）+ mounted editors 的 ProseMirror doc `descendants()`（覆盖 store 过期场景），按 id 去重

## 主题系统规范

### 三层边框语义（醒目度从高到低）
- `menu-border`：浮窗 / 弹窗 / 菜单（斜杠菜单、气泡菜单、块工具条、下拉、对话框、Toast、表格选择器等一切"浮在内容之上"的临时面板）
- `block-border`：内容块（代码块外框、表格网格线、表格外框）
- `widget-border`：内嵌分隔 / 静态卡片（设置页分隔线、卡片轮廓、图片节点边框、NavTree 缩进线、行号分隔）

### 背景语义
- 浮窗弹窗统一用 `menu-background`，勿混用 `quickInput-background` / `editorWidget-background` / `editor-background`
- 对话框内部分隔线（header/footer 的 border-b）保留 `widget-border`（内嵌分隔语义）

### 主题色值约定（2026-07-08 调整）
- jstudio-light: menu=block-border=#C0C0C0, widget-border=#E5E5E5（色距 37）
- jstudio-dark: menu=block-border=#5A5A5A, widget-border=#313131（色距 38，dark 中更亮=更醒目）
- ink 主题刻意拉大色距：light menu=#1a1612(深黑) vs widget=#ddd4c8(浅米)；dark menu=#5a6590 vs widget=#2f334d
- 设计原则：浮窗边框必须明显深于(light)/亮于(dark)内嵌分隔，参考 ink 的层次感

### 主题系统架构
- 4 主题：jstudio-light/dark, ink-light/dark
- 主题定义拆成单文件，位于 `src/lib/themes/`：
  - `types.ts`（AppTheme 接口 + `applyAppTheme()`）
  - `jstudio-light.ts` / `jstudio-dark.ts` / `ink-light.ts` / `ink-dark.ts`（各自一个主题常量）
  - `registry.ts`（`APP_THEMES` 数组 + `getAppTheme`/`getAppThemesByMode` + 默认 id）
  - `index.ts` barrel re-export（消费方统一从 `lib/themes` 导入，引用方零耦合内部文件）
- 运行时通过 `applyAppTheme()` 在 `<html>` 上设 inline CSS 变量覆盖 `vscode-theme.css` 的 `:root`/`.dark` 静态默认值
- `vscode-theme.css` 里**只有 jstudio-light/dark 的静态 fallback**（`:root`+`.dark`），ink 主题纯运行时注入（加载时有瞬间回退到 jstudio 默认值的闪烁）。该 CSS 文件其余 ~1900 行是结构化组件样式，非主题定义
- 改主题色值：改对应 `themes/<id>.ts`（运行时生效）；jstudio 两套还需同步 `vscode-theme.css` 的 `:root`/`.dark`（静态 fallback）
- 新增主题：加 `themes/<id>.ts`，在 `registry.ts` 的 `APP_THEMES` 数组追加一行即可

## 构建门禁
- `beforeBuildCommand=npm run build` 会跑 tsc，TS 错误直接让 tauri build 失败
- 改动后先 `npx tsc --noEmit` 验证

## i18n 规范
- `TranslationKey = keyof translations.zh`（只取自 zh 块）；新增 key 必须 zh+en 同时写；禁止重复 key（TS1117）

## Tailwind v4 注意事项
- **arbitrary value 不支持嵌套 `var()` fallback**：`border-[var(--vscode-menu-border, var(--vscode-widget-border))]` 不会被编译成 CSS 规则，导致 `border-color` 回退到 `currentColor`（文字色）。dark 主题下文字近白，边框会显示为"白色框"。
- 正确写法：`border-[var(--vscode-menu-border)]`（单变量，无 fallback）。项目主题变量在所有主题 + :root + .dark 都有定义，不需要 fallback。
- CSS 原生规则（vscode-theme.css 里的 `var(--a, var(--b))`）不受此限制，可保留 fallback。
- 受此 bug 影响已修复的文件：TableControls.tsx（4处）、MenuList.tsx（1处）。排查方法：grep `\[var\(--vscode-[a-z-]+,\s*var\(--vscode-`

## inline link（行内蓝色链接 mark）

- 用 `@tiptap/extension-link`，配置在 `sectionEditor/extensions.ts` + `BlockEditor.tsx`（两处必须同步）。注意和 `linkExtension.ts` 的 linkBlock **节点卡片**是两套东西
- **点击跳转机制（非直觉）**：editable 模式 `openOnClick: false`，clickHandler.handleClick 进入但 openOnClick false 不 `window.open`，返回 false（不 preventDefault）→ 浏览器原生 `<a target="_blank">` 默认行为触发 → Tauri `on_new_window` 拦截 → 预览窗口。所以 editable 下点 inline link **能跳**，href 来自 link mark 的 attrs。改 href 行为要改 mark，不是改 DOM
- **autolink 用自定义版**（`src/lib/editor/extensions/customLinkAutolink.ts`），非上游。原因：上游 autolink（node_modules/@tiptap/extension-link/src/helpers/autolink.ts:158-165）对**已有 link mark** 的文字 `getMarksBetween` 检查后直接 return，**不更新 href**——用户编辑 link 文字改 URL 后残留旧 href，点击跳旧地址。自定义版在 `href !== 检测值` 时 `removeMark`+`addMark` 更新。两处 Link 配置：`Link.extend({ addProseMirrorPlugins() { return [customLinkAutolink({ type: this.type, defaultProtocol: 'https' })] } }).configure({ openOnClick: ..., autolink: false })`
- **功能缺口**：无 inline link href 编辑 UI。`setLink`/`toggleLink`/`unsetLink` 命令存在但无任何 UI 调用（FormatBubbleMenu 只有 bold/italic/strike/code，命令面板/快捷键无 link）。用户只能改文字为 URL 让 autolink 更新 href，无法像 Notion 那样独立改显示文字+href

## IME 中文输入法处理

- 共享检测 util：`src/lib/ime/pinyinStrip.ts`（`isRawPinyinCommit` + `stripPinyinSpaces`）。拼音特征 = 含空格 + 全 ASCII 字母/空格 + 含字母；正常选词提交是中文无空格，不受影响
- **终端拦截点（非直觉）**：xterm `compositionend` 后用 `setTimeout(0)` 读 `textarea.value` → `triggerDataEvent` → `term.onData`，所以对 compositionend `preventDefault` **无效**。必须在 `term.onData` 里配合 compositionend 记录的 data + 时间窗口（120ms）精确匹配（`data === lastCompositionEndData`）后改写。见 `useTerminalManager.ts`
- **编辑器拦截点**：`ImeCapsLockFix`（`src/lib/editor/extensions/imeCapsLockFix.ts`）ProseMirror plugin，在 `beforeinput(insertText)` 拦截，`view.dispatch(tr.insertText(cleaned))` + preventDefault。BlockEditor + sectionEditor 都注册它，改一处全覆盖
- 现有 IME 基础设施：终端 stray-space 抑制 + Shift 符号桥接（`useTerminalManager.ts` bridge 闭包）；编辑器 CapsLock 幻影字符抑制（`imeCapsLockFix.ts`）。拼音去空格逻辑独立于这些，互不干扰
