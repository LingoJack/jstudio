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
    const edge = toStart ? $head.start(1) : $head.end(1);

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
