---
title: Cmd+F 不聚焦 FindBar 输入框（重复触发无信号+菜单焦点回移）
date: 2026-09-04
area: desktop/ui
tags: [electron, native-menu, focus, zustand, commandRegistry, findFocusNonce]
status: active
source: commit 36cf1e8
---

## 背景

desktop 端编辑器的文档内查找条 FindBar（`FindBar.tsx`），macOS + Electron。Cmd+F 由 macOS 原生菜单声明（`electron/menu.ts:73` `item('app.find', 'Find…', 'CmdOrCtrl+F')`），点击经 `routeNativeCommand`（`electron/main.ts:104`）以 `native-command` 事件转发到聚焦窗口，ShortcutManager 监听后经 commandRegistry 派发 `app.find` 打开 FindBar。前端代码拿不到原生菜单的生命周期事件。

## 表现

按 Cmd+F 后 FindBar 浮条打开，但输入框里没有光标，需手动点击才能输入。两条复现路径：

1. 文档内按 Cmd+F：bar 出现，光标不在输入框（偶发）。
2. bar 已打开、焦点在正文编辑器时再按 Cmd+F：光标必不进入输入框，每次必现。

## 根因

两个原因叠加：

1. 重复触发无信号。旧 `app.find` 只调 `store.setFindBarOpen(true)`，FindBar 的聚焦 effect 依赖 `[isOpen]`。bar 已打开时 isOpen 为 true→true 不变，effect 不重跑，第二次 Cmd+F 没有任何触发聚焦的 state 变化。
2. 原生菜单焦点回移晚于单次重试。原生菜单激活期间 WebView 失去 key focus；`setFindBarOpen(true)` 触发 React 提交后在 rAF 内 focus() 通常成功，但菜单关闭时 Chromium 把 DOM 焦点恢复给菜单打开前聚焦的元素（ProseMirror contenteditable）。该恢复可落在旧实现的单次 100ms `setTimeout` 重试之后，此后无人再抢回焦点。

## 解决

把「app.find 发生过」变成独立于 isOpen 的 state 信号，并用短预算守护循环对抗焦点回移：

- store 新增瞬态计数 `findFocusNonce` 与 `focusFindBar()` action：同一次 set 里置 `isFindBarOpen: true` 并 nonce+1。
- commandRegistry 的 `app.find` 与 GlobalSearchDialog 的跳转路径都改走 `focusFindBar()`。
- FindBar 聚焦 effect 依赖 `[isOpen, findFocusNonce]`：进入后立即 focus 并把光标拨到输入末尾；随后 500ms 预算内每 60ms 检查 `document.activeElement !== inputRef.current`，被抢走就抢回；预算耗尽即停，不干预用户之后的手动聚焦。

```tsx
useEffect(() => {
  if (!isOpen) return;
  const focusInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  };
  focusInput();
  const startedAt = performance.now();
  const timer = window.setInterval(() => {
    if (performance.now() - startedAt >= FIND_FOCUS_RETRY_BUDGET_MS) {
      window.clearInterval(timer);
      return;
    }
    if (document.activeElement !== inputRef.current) focusInput();
  }, FIND_FOCUS_RETRY_INTERVAL_MS);
  return () => window.clearInterval(timer);
}, [isOpen, findFocusNonce]);
```

验证：`npm run lint`（tsc -b）通过；`npx tsx --test src/lib/core/commandRegistry.test.ts` 2 项通过。

## 相关改动

- `desktop/src/store/uiSlice.ts:155,194,252,323` —— 新增 `findFocusNonce` 状态与 `focusFindBar()` action
- `desktop/src/lib/core/commandRegistry.ts:75` —— `app.find` 改走 `focusFindBar()`
- `desktop/src/components/search/GlobalSearchDialog.tsx:121` —— 全局搜索跳转打开 FindBar 同样改走 `focusFindBar()`
- `desktop/src/components/editor/sectionEditor/FindBar.tsx:27-74` —— 聚焦 effect 重写为 nonce 驱动 + 500ms 守护循环（常量 `FIND_FOCUS_RETRY_INTERVAL_MS=60`、`FIND_FOCUS_RETRY_BUDGET_MS=500`）
- `desktop/src/lib/core/commandRegistry.test.ts` —— mock store 由 `setFindBarOpen` 换成 `focusFindBar`
- commit 36cf1e8

## 复用提示

排查「原生菜单快捷键触发的前端 UI 没反应/没聚焦」时，分两条线查：

1. 命令是否只在布尔开关上打转 —— 重复触发时 isOpen 不变，effect 收不到信号；用自增 nonce 表达「命令又发生了一次」。
2. 焦点是否被 Chromium 菜单关闭后的恢复动作抢回 —— rAF + 单次 100ms 重试已验证不够；需短预算内循环重assert，预算到期必须停，否则会持续抢走用户手动聚焦。

另：FindBar 旧注释写的「WKWebView 经 Tauri IPC 转发」已过时，Electron 下机制是 `native-command` 事件（`electron/main.ts` routeNativeCommand → ShortcutManager）。
