# Bug 墓碑

> 记录那些在 JStudio 开发过程中被消灭的 Bug——它们的症状、死因、以及墓志铭。
> 每一条都是一次调试旅程的终点，也是后来者的路标。

---

## #001 — macOS WKWebView 吞掉 Cmd+Arrow 键事件

**状态**：已修复
**日期**：2025-01
**影响文件**：`src/components/BlockEditor.tsx`

### 症状

用户希望在编辑器中用 `Cmd+Left` / `Cmd+Right`（macOS）或 `Ctrl+Left` / `Ctrl+Right`（Windows/Linux）快速跳转到当前文本块的行首或行尾，但按键毫无反应。

### 排查过程

这是一次经典的"逐层下钻"调试，每一步都推翻了上一步的假设：

#### 尝试 1：TipTap `addKeyboardShortcuts`（失败）

在 `blockNavigation.ts` 的 `addKeyboardShortcuts` 中注册 `'Mod-ArrowLeft'` / `'Mod-ArrowRight'`。

**结果**：完全没反应。

**原因**：可能是扩展优先级问题，被其他 keymap 插件抢先处理。

#### 尝试 2：ProseMirror `editorProps.handleKeyDown`（失败）

把逻辑移到 `editorProps.handleKeyDown`——这是 ProseMirror 事件链中最高优先级的拦截点。

加了 `console.log` 调试，发现：
- `Cmd+B`（粗体）→ **有 log 输出**
- `Cmd+Left` / `Cmd+Right` → **完全没有 log 输出**

**结论**：`handleKeyDown` 本身工作正常，但 `Cmd+Arrow` 的 keydown 事件**根本没有到达 ProseMirror**。

#### 尝试 3：Window 级 capture 监听（找到真凶）

在 `window.addEventListener('keydown', handler, true)`（capture 阶段）加调试日志，终于看到了事件：

```
[window capture] {key: "ArrowRight", meta: true, defaultPrevented: true}
```

关键线索：`defaultPrevented: true`。

### 根因

**macOS 的 WKWebView（Tauri v2 底层使用的 WebView）在原生层面拦截了 `Cmd+Arrow` 组合键**，用于原生的"行首/行尾跳转"行为，并在 JS 事件到达 ProseMirror 之前就调用了 `preventDefault()`。

ProseMirror 的 `editHandlers.keydown` 中有这样一个检查：

```js
// prosemirror-view/src/input.ts
if (event.defaultPrevented) return;  // ← 直接跳过
```

所以无论我们在 ProseMirror 层（`handleKeyDown`、`addKeyboardShortcuts`）怎么注册，都**不可能**收到这个事件。

### 解决方案

在 `window` 级别的 **capture 阶段**（比系统默认行为更早）拦截事件，自己处理跳转逻辑：

```ts
// src/components/BlockEditor.tsx
useEffect(() => {
  if (readOnly) return;

  const handler = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (!editor) return;

    const view = editor.view;
    const { state } = view;
    const { selection } = state;
    const $head = selection.$head;
    if ($head.depth < 1) return;

    const toStart = e.key === 'ArrowLeft';
    const extend = e.shiftKey;
    // Use $head.start() / $head.end() (defaults to $head.depth) to always
    // resolve to the text-block boundary, not the top-level node boundary.
    // This matters for list items where the paragraph lives at depth 3.
    const edge = toStart ? $head.start() : $head.end();

    const tr = extend
      ? state.tr.setSelection(
          TextSelection.create(state.doc, selection.$anchor.pos, edge),
        )
      : state.tr.setSelection(TextSelection.create(state.doc, edge));
    tr.setMeta('addToHistory', false);
    view.dispatch(tr);
    view.focus();
    e.preventDefault();
    e.stopPropagation();
  };

  window.addEventListener('keydown', handler, true); // ← capture: true
  return () => window.removeEventListener('keydown', handler, true);
}, [editor, readOnly]);
```

### 墓志铭

> ProseMirror 的 `handleKeyDown` 不是万能的。
> 当 `event.defaultPrevented === true` 时，ProseMirror 会直接跳过——
> 而 macOS WKWebView 恰好会在原生层把某些组合键（Cmd+Arrow）标记为 `defaultPrevented`。
> 唯一的出路是在 window capture 阶段截胡，赶在系统默认行为之前。

### 教训

1. **先加 log，再下结论**。不要假设"注册了就应该生效"，ProseMirror 的事件链有多层拦截。
2. **`defaultPrevented` 是隐形杀手**。当事件到达你的 handler 时，永远先检查 `event.defaultPrevented`。
3. **Tauri ≠ 浏览器**。WKWebView 的原生按键拦截行为与 Chrome/Firefox 不同，不能拿纯浏览器的经验直接套用。

---

## #002 - Cmd+A 全选时出现空心圆点

**状态**：已修复
**日期**：2025-07
**影响文件**：`src/components/editor/sectionEditor/useCrossSectionSelection.ts`

### 症状

在编辑器中按 `Cmd+A` 全选内容时，屏幕上会多出来一个**空心圆点**，层级高于所有内容（浮在最上层），无法通过 CSS 隐藏。

### 排查过程

#### 尝试 1：GapCursor（失败）

代码库中 `vscode-theme.css` 明确记载 GapCursor 在缺少样式时会显示为"空心小点"。只有 `mathBlockExtension` 设置了 `allowGapCursor: false`，其他 atom 块节点（图片、文件、链接、图表）都没有。

**修复**：给所有 atom 块扩展添加 `allowGapCursor: false`。

**结果**：问题依旧。

**原因**：GapCursor 只在 `state.selection instanceof GapCursor` 时创建 widget，Cmd+A 产生的是 `TextSelection`，不会触发 GapCursor。

#### 尝试 2：`:focus-within` 触发的 resize handle（失败）

代码块的 resize handle 是 `border-radius: 50%` 的圆形，z-index: 11，通过 `:focus-within` CSS 规则在编辑器获得焦点时变为可见（`opacity: 1`）。Cmd+A 时锚点 section 获得焦点，理论上所有代码块的 resize handle 都会显示。

**修复**：移除 `.code-block-figure:focus-within` 和 `.collapsible-block-figure:focus-within` CSS 规则。

**结果**：问题依旧。

**原因**：`:focus-within` 检查的是**后代元素**是否有焦点。`.ProseMirror`（contenteditable）是 `<figure>` 的**父级**而非后代，所以 `:focus-within` 不会匹配。

#### 尝试 3：DOM 遍历扫描（未执行）

在 `selectAll()` 中添加 `requestAnimationFrame` 回调，遍历所有 editor DOM 查找 `border-radius: 50%` 且可见的元素，日志写入文件。但因需要重建应用，未执行。

#### 尝试 4：原生选区 grabber（命中）

重新审视 `selectAll()` 的代码：

```ts
ctxRef.current.getHandle(firstId)?.setTextSelection(0, firstSize);
```

这会在锚点 section 上设置一个**非折叠的原生选区**（从位置 0 到文档末尾）。虽然用 CSS 隐藏了 `::selection` 背景：

```css
.cross-section-anchor-hide-selection ::selection {
    background: transparent !important;
}
```

但 `::selection` 只控制选区**背景色**，不控制 macOS WKWebView 的原生 **selection grabber**。

### 根因

**macOS WKWebView 在 contenteditable 中的非折叠选区边界会渲染原生的 selection grabber**--一个空心圆点。这是系统级 UI 元素：

- **层级高于所有 web 内容**：由操作系统渲染，不受 CSS `z-index` 影响
- **CSS 无法隐藏**：`::selection { background: transparent }` 只隐藏选区背景，不隐藏 grabber
- **只在非折叠选区时出现**：折叠选区（光标）不会触发 grabber

这完全符合用户描述："空心圆点"、"层级高于所有东西"、"Cmd+A 全选时出现"。

`apply()` 函数（拖拽跨 section 选区）也有同样的问题，因为它也设置了非折叠的原生选区。

### 解决方案

将锚点 section 的原生选区改为**折叠选区（光标）**，视觉选区完全由 `.cross-section-selected` decoration 提供：

```ts
// selectAll() - 旧：
ctxRef.current.getHandle(firstId)?.setTextSelection(0, firstSize);
anchorEditor?.view.dom.classList.add('cross-section-anchor-hide-selection');

// selectAll() - 新：
ctxRef.current.getHandle(firstId)?.setTextSelection(0, 0);

// apply() - 旧：
ctxRef.current.getHandle(sel.anchorId)?.setTextSelection(anchorRange.from, anchorRange.to);
anchorEditor?.view.dom.classList.add('cross-section-anchor-hide-selection');

// apply() - 新：
ctxRef.current.getHandle(sel.anchorId)?.setTextSelection(anchorRange.from, anchorRange.from);
```

这不影响功能，因为：
- **复制/剪切**：`onCopy`/`onCut` 是 document 级 capture 监听器，检查 `selRef.current`（跨 section 选区状态），不依赖原生选区
- **删除**：`onKey` 处理器同样检查 `selRef.current`
- **键盘焦点**：折叠选区仍然保持焦点在锚点 section 上，键盘事件正常派发
- **视觉选区**：`.cross-section-selected` decoration（`Decoration.inline` + `background` CSS）覆盖所有 section，提供完整的选区视觉效果

### 墓志铭

> `::selection { background: transparent }` 隐藏的是选区背景，
> 不是 macOS 的 selection grabber。
> WKWebView 的原生 UI 不归 CSS 管。
> 当你无法用 CSS 干掉一个东西时，想想它是不是浏览器/OS 渲染的。

### 教训

1. **CSS 有边界**。`::selection` 控制选区背景，但不控制原生 grabber/handle。macOS WKWebView 在 contenteditable 中的非折叠选区会显示原生 grabber，这是系统级行为。
2. **"层级高于所有东西"是关键线索**。当用户说一个元素 z-index 高于一切时，优先怀疑原生 UI 元素而非 CSS 元素--CSS 的 z-index 再高也高不过系统渲染层。
3. **能用 decoration 就别用原生选区**。跨 section 选区的视觉表现应该完全由 ProseMirror decoration 控制，原生选区只用于保持焦点，且应保持折叠状态。

---

## #003 — 拖拽高亮框缺底边/右下角（inset box-shadow 绘制残缺）

**状态**：已修复
**日期**：2026-08
**影响文件**：`src/components/documents/DocumentTreeRenderer.tsx`、`src/components/documents/DocumentSidebar.tsx`

### 症状

把文档拖到文件夹上时，文件夹的 drop-target 高亮框（圆角边框 + 浅色背景）**底边和右下角不绘制**：只画出左下角一小段弧线，上/左/右边框正常。

### 根因

高亮框用的是 `ring-1 ring-inset`（即 `box-shadow: inset 0 0 0 1px`）。元素的**背景色完整绘制、只有 inset 阴影残缺**，排除布局/裁剪问题——这是 WKWebView 分块（tiled）绘制对 inset box-shadow 的漏绘：拖拽过程中 `dragOverTarget` 随 pointermove 高频切换，类名增删 + `transition-colors` 逐帧重绘时，部分 tile 没有把阴影画进去，且之后没有触发完整重绘，残缺就一直留在屏幕上。

### 解决方案

把 inset ring 换成**常驻的透明真实边框**，高亮时只切换 `border-color`：

```tsx
// 旧：
isDropTarget ? 'ring-1 ring-inset ring-[var(--vscode-focusBorder)] bg-[...]' : ''

// 新：border 永远占位（无布局跳动），只过渡颜色
isDropTarget ? 'border-[var(--vscode-focusBorder)] bg-[...]' : 'border-transparent'
```

边框随盒模型原子绘制，不走 box-shadow 的分块阴影路径，彻底绕开该问题。透明边框常驻也保证了高亮出现/消失时不会有 1px 布局抖动。

### 墓志铭

> 背景画满了、影子缺一角——不是布局错了，是阴影没被画进去。
> WKWebView 的 inset box-shadow 在频繁重绘时会漏 tile；
> 要稳定的"内描边"，用常驻透明 border，别用 inset ring。

### 教训

1. **"背景完整但边框残缺"指向绘制层而非布局层**。先确认缺的是哪种绘制产物（bg / border / box-shadow），再决定怀疑谁。
2. **WKWebView 里高频切换的 inset box-shadow 不可靠**。`ring-inset` 适合静态装饰，不适合拖拽高亮这类逐帧增删的场景。
3. **同类隐患**：`NavTree.tsx` 的 `NavRow` `highlighted` 态仍用 `ring-1 ring-inset`（静态高亮，暂未观察到问题）；若日后出现同样症状，按本条目同款方案修。

---

## #004 — 鼠标拖拽跨 section：空心圆点（#002 复发）+ 复制不到内容

**状态**：已修复
**日期**：2026-08
**影响文件**：`src/components/editor/sectionEditor/useCrossSectionSelection.ts`

### 症状

鼠标从上往下拖出跨 section 选区（高亮由 `.cross-section-selected` decoration 绘制）后：1) 屏幕上残留**空心圆点**（同 #002 的原生 selection grabber），浮在锚点 caret 上方；2) 按 Cmd+C **复制不到任何内容**。

### 排查过程（logger 埋点，tag `xsel`）

第一轮修复假设"rAF 里的 preventDefault 晚了一帧，瞬态非折叠选区画出 grabber"，改为同步拦截 + mouseup 后再折叠。用户复测：圆点仍在、复制反而彻底坏了。加 logger 埋点后时间线一目了然：

```
onUp:   sel=true                        ← 跨段选区正常建立
clear:  reason=other-key hadSel=true    ← 按下 Cmd 的瞬间选区被清！
copyEvent: sel=false                    ← copy 事件照常派发，但 selRef 已空
```

同时 `onUp` 处 `nativeCollapsed=false`——尽管 `apply()` 每次都把原生选区折叠成 caret。

### 根因（两个独立 bug 叠加）

**Bug A — Cmd 键本身就清空跨段选区。** macOS 菜单通过 `performKeyEquivalent` 拦截 Cmd+C 的字母键（`c` 的 keydown 不到 webview，菜单经 `copy:` 转发），但 **Command 修饰键自己的 keydown（`key === 'Meta'`）会到达 webview**。`onKey` 的兜底分支（"其他键 → clear + 聚焦锚点"）把它当普通键处理，于是用户按下 Cmd（准备按 C）的那一刻选区就被销毁，随后的 copy 事件里 `selRef` 已空 → 复制为空。此 bug 一直存在，只是以前被 Bug B 的竞态掩盖：原生选区没被折叠时，原生 copy 还能复制到锚点 section 的部分内容。

**Bug B — mouseup 的手势提交重建非折叠原生选区。** WebKit 的 selection controller 在 mouseup 默认动作里"提交"拖拽手势：以 mousedown 点为锚，把原生选区重建为 origin contenteditable 内的**非折叠选区**——正好抵消 `apply()` 设置的折叠 caret，并触发 WKWebView 画出原生 selection grabber（空心圆点）。这就是"跨段拖选后圆点残留"的来源。

### 解决方案

1. **`onKey` 忽略纯修饰键**：`Meta`/`Control`/`Shift`/`Alt`/`CapsLock` 的 keydown 直接 return，不进任何 clear 分支。
2. **`onUp` 阻止手势提交**：跨段选区激活（`selRef` 非空）时对 mouseup `e.preventDefault()`，WebKit 不再重建非折叠选区；并在 `setTimeout(0)`（手势彻底结束后）对锚点 section 再折叠一次 caret，拆除拖拽过程中可能已画出的 grabber。
3. （第一轮保留）`onMove` 在 capture 阶段**同步** preventDefault 跨界 mousemove，不等 rAF。

### 墓志铭

> 菜单拦得下字母键，拦不下 Cmd 自己的 keydown。
> mouseup 不是手势的句号——它的默认动作会把选区重新提交一遍。
> 竞态能掩盖 bug：修了一个，另一个才现形。

### 教训

1. **兜底分支要防修饰键**。任何"其余按键一律 clear/重置"的 keydown 兜底，先排除 `Meta`/`Control`/`Shift`/`Alt`——组合键的第一下keydown永远是修饰键本身。
2. **WebKit 的拖拽选区在 mouseup 才提交**。拖拽过程中程序化改选区只是"临时状态"，mouseup 默认动作会以浏览器自己的轨迹重建选区；要保住程序化选区，必须 preventDefault mouseup。
3. **"以前是好的"可能是竞态假象**。Bug A 存在已久，被 Bug B 留下的非折叠选区掩盖（原生 copy 兜底）；修 Bug B 时必须同步修 Bug A。
4. **logger 埋点一轮定位，胜过纯推理三轮**。原生 UI（grabber）DOM 不可见，但选区状态、`selRef` 流转、事件派发顺序都可以落日志。

---

## #005 — 引用块里原生光标忽大忽小（WebKit 续行 caret 按行距绘制）

**状态**：已修复
**日期**：2026-08-25
**影响文件**：`src/lib/editor/tiptapAdapter/richText.ts`、`blocks.ts`、`list.ts`、`todo.ts`

### 症状

关闭光标动画（使用原生 caret）时，引用块（以及列表项、待办项等多行容器）里的光标**有时候正常、有时候异常高大**（约 1.5 倍字高）。

### 排查过程

用 Playwright WebKit + 红色 `caret-color` + 截图像素分析，在真实 WebKit 里逐位置测量**实际绘制的** caret 高度（`page.screenshot` 默认 `caret:'hide'` 会隐藏 caret，必须传 `caret:'initial'`；headless 下折叠 Range 的 `getClientRects()` 高度与绘制高度并不一致，不能当依据）。

测量矩阵（16px 字号、line-height 1.7）：

| 位置 | 绘制高度 |
|---|---|
| 单行段落任意位置 | 18px（字身） |
| 多行 textblock 的**第一行**任意位置 | 18px |
| 多行 textblock 的**第二行及以后**任意位置 | **27px（完整行距）** |
| 两个 `<br>` 之间的空行 | **27px** |

逐位置二分还排除了：嵌套容器（blockquote/div/li/td 无关）、padding/background/border、`br { line-height }`、line-height 写在 p 还是根上——全部无影响。**JS 重新设置同一个 DOM 选区位置也无法改变绘制高度**（与 affinity 无关）。

### 根因

**WebKit 把续行（非第一行）上的 caret 按完整 line-stride（行距）高度绘制，而第一行按字身（ascent+descent）绘制。** 这是引擎的 caret 绘制行为，无 CSS 开关；多行 textblock 里 line-height 越大越明显。

多行 textblock 的来源：quote / 列表项 / 待办项此前在适配器里被转换成**单段落 + hardBreak**（`<br>`），因此它们的第 2 行起光标全是 27px。而用户在会话内按 Enter 产生的多行内容（TipTap 默认 splitBlock 成多段落）是正常的 18px——这就是"有时候对、有时候异常大"的体感来源（重载后被拍平成 hardBreak 形式才触发）。

### 修复

`richText.ts` 新增 `splitRichTextByLines`，quote / listItem / taskItem 的正向适配改为**每行一个 `<p>`**（多段落），不再使用单段落 + hardBreak。反向适配本来就把多段落按 `\n` 拍平回 RichText[]，round-trip 无损。实测多段落后所有行尾 caret 回到 18px。

未覆盖：顶层正文段落里 Shift+Enter 产生的 hardBreak（模型上一个 block 就是一段，无法拆段）——续行 caret 仍会偏高，属 WebKit 限制。

### 教训

1. **原生 caret 的绘制高度≠折叠 Range 的 `getClientRects()` 高度**，且 headless 截图默认隐藏 caret（`caret:'initial'` 才可见）——测量原生绘制行为必须截图 + 像素分析。
2. **`src/**/*.js` 旧编译产物会遮蔽同名 `.ts`**：Vite `resolve.extensions` 默认 `.js` 先于 `.ts`，扩展名省略的导入会命中残留的 `.js`（`.gitignore` 里的 `src/**/*.js`）。改这些目录的 `.ts` 后必须用 esbuild 同步重新生成 `.js`，否则改动在 app 里静默不生效（tsx 测试则相反，优先 `.ts`，测试骗不了人但 Vite 会）。**注（2026-08 更新）**：`vite.config.ts` 已把 `resolve.extensions` 调成 `.ts` 优先，这一条不再是必做动作，验证方式改为在构建产物里 grep 新增代码。

---

## #006 — 鼠标拖动选不中图片（点击可以，滑动不行）

**状态**：已修复
**日期**：2026-08-29
**影响文件**：`src/components/editor/hooks/useNodeSelectionClick.ts`、`src/lib/editor/extensions/sectionHighlightSelection.ts`、`src/styles/vscode-theme.css`、`src/components/editor/nodes/ImageView.tsx`

### 症状

单击图片能选中（出现选中框 + 浮动工具条），但在图片上按下并滑动，选区完全不动——既选不中图片，也选不中图片周围的文字。用户明确确认「现在是可以点击选中图片 但是无法通过滑动拖动选中」。

### 排查过程

先按用户指定的 `DocumentPanel.tsx` 排查，结论是**它不是元凶**：它只在滚动容器上挂 `crossSel.onMouseDownCapture`，负责跨 section 的拖拽，同 section 内的选区不归它管。

真正的嫌疑是挂在所有块 NodeView 根节点上的 `useNodeSelectionClick`。该 hook 在 mousedown 里无条件调用 `preventDefault()` 再 `setNodeSelection(getPos())`。

为验证，搭了一个与真实 DOM 同构的 headless 用例（NodeView wrapper div + `contenteditable="false"` + `<img user-select:none; pointer-events:none; draggable:false>` + 应用的高亮插件 + 被全局禁用的 `::selection`），用 CDP `Input.dispatchMouseEvent` 发真实鼠标事件，跑了 13 组对照：

| 用例 | 条件 | 结果 |
|------|------|------|
| T1 / T9 | 从**文字**起拖，跨过图片 | `TextSelection`，覆盖 2 / 4 张图，正常 |
| T2 / T4 / T6 | 从**图片**起拖，无 hook | 得到 `NodeSelection`，且**文档被改写**（`ReplaceStep`） |
| T3 | 复现现状（mousedown `preventDefault` + `setNodeSelection`） | `TextSelection from == to == 107`，`pmImageCount: 0` |
| T10 / T12 / T13 | 开启修复 | `107..209`、`303..403`、向上 `2..108`，`mutations: []` |
| T7 / T11 | 纯单击（修复前 / 后） | 均为 `NodeSelection`，点击行为保持 |

关键事实（每一条都是实测，不是推断）：

1. **T1/T9 证伪了「CSS 挡住了选中」这个假设**。图片的 `user-select: none` / `pointer-events: none` 只影响绘制与命中测试，**不会**把它从选区范围里剔除——从文字起拖照样能覆盖整张图。所以症状不是「图片不可选」，而是「**从图片上起手**拖不动」。
2. **Chromium 不会从 `contentEditable=false` 的原子节点上发起原生选区拖拽**。在这类元素上按下再移动，浏览器给出的是 `NodeSelection`，或者干脆把它变成一次原生 drag-and-drop——后者会**把节点搬到别处**，静默改写文档（T2/T4/T6 的 `ReplaceStep`）。
3. 原先的 `preventDefault()` 把第二条路也堵死了：浏览器干脆不生成任何选区，于是 T3 里选区退化成一个光标（`from == to`），图片数为 0。这跟用户描述逐字吻合。

### 修复

`useNodeSelectionClick.ts` 重写为「自己驱动拖拽」的状态机：

- mousedown **不再 `preventDefault()`**（否则手势被取消），改为记录 `PressState`（按下坐标 + 块的 `from/to`），并在 `document` 上挂 capture 阶段的 `mousemove` / `mouseup` / `dragstart`。
- 指针位移超过 `DRAG_THRESHOLD_PX`（4px，与 PM 自己的点击阈值对齐）即判定为拖拽：用 `view.posAtCoords()` 求落点，往下拖则 `from = 块首, to = 落点`，往上拖则 `from = 落点, to = 块尾`，每次 move 写回 `TextSelection`。落点仍落在块内时不动。
- 按下期间吞掉 `dragstart`，阻止 Chromium 把这次手势变成拖放（否则文档被改写）。
- mouseup 分两条路：没拖动 → 走原逻辑 `setNodeSelection(livePos())`（**点击行为完全保留**）；拖动过 → 重新断言最后一次的 `lastFrom..lastTo`（Chromium 在选区末端落在块边界时会重新归一化，不补这一下，向上拖会被拍平成光标）。最后 `view.focus()` 保证 Backspace/Delete 能进来。
- `posAtCoords` 返回 `null`（指针已离开本 section）时直接让位，跨 section 拖拽仍归 `useCrossSectionSelection` 所有。
- 忽略选择器补上 `[data-drag-handle]`；删除已废弃的 `forcePreventDefault` 选项及 `ImageView.tsx` 里的调用。

补充：`FileView` 传了 `skipWhenSelected: true`，原先这个开关在 mousedown 入口就 `return`，于是**已选中的文件块上也拖不动**——刚点过一张卡片，再从它起手拖拽就失效，与图片行为不一致。该开关的本意只是"已选中时别在点击时抢走 live preview 的焦点"，与拖拽无关，因此把它从入口挪到 mouseup 的**点击分支**，拖拽照常驱动。

但挪走之后引出一个新风险：`FileView` 在**选中后**会移除覆盖在预览区上的透明 overlay，让 PDF 工具栏 / 媒体控件 / pdf.js 的 text layer 变得可命中——此时在预览区内拖动（选 PDF 文字、拖滚动条、拖进度条）会冒泡到 document，被我们的拖拽逻辑接管。所以 `FileView` 额外传了 `ignoreSelector: selected ? LIVE_PREVIEW_SELECTOR : undefined`：选中后预览区整体让给预览自身；未选中时 overlay 仍在，按压落在 overlay 上，点击/拖选行为与图片完全一致。卡片模式（非 preview）不受影响。

再顺带修掉一个连带问题：图片虽然被选进去了，却**没有任何高亮**。因为 `.cross-section-selected` 是 `Decoration.inline`，画不到块级原子节点上，而原生 `::selection` 又被全局置为透明。于是 `sectionHighlightSelection.ts` 新增 `buildDecorations()`：在 inline 装饰之外，为被选区覆盖的每个块级原子补一个 `Decoration.node(..., { class: 'node-in-selection' })`，explicit 模式与 mirror 模式共用；`vscode-theme.css` 里用 `.node-in-selection::after` 铺一层半透明覆盖层（`color-mix` 55%——它盖在内容之上，不透明会挡住图片本身），并加 `pointer-events: none` 免得吃掉点击。

### 教训

1. **「CSS `user-select: none` 挡住了选中」是个诱人但错误的直觉**——它只挡绘制，不挡归属。判断一个节点能否进入选区，要看它是否在 Range 的 `[from, to)` 内，而不是看它有没有被高亮。
2. **`contentEditable=false` 的块不参与原生选区拖拽**，这是 Chromium 的既有行为，无法用 CSS 打开。要在块上支持拖动选中，只能自己用 `posAtCoords` 驱动。
3. **不 `preventDefault()` 就必须自己处理 `dragstart`**，否则浏览器会把「按下 + 移动」解释成拖放并改写文档——这类静默 mutation 在手动点击测试里几乎发现不了，必须挂 `dispatchTransaction` 日志去抓。
4. `Decoration.inline` 画不出块级节点的高亮，**块级高亮必须用 `Decoration.node`**。

---
