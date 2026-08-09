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
