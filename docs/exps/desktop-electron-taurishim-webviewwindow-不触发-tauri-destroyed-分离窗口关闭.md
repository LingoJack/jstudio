---
title: tauriShim WebviewWindow 不触发 tauri://destroyed，分离窗口关闭后调用方状态卡死
date: 2026-09-05
area: desktop/electron
tags: [electron, tauriShim, webviewWindow, tauri://destroyed, window-closed]
status: active
source: commit b9df4ff
---

## 背景

desktop 端 Electron 壳（Tauri 迁移后，`@tauri-apps/api/webviewWindow` 由 `src/lib/core/tauriShim/webviewWindow.ts` 别名接管）。文档内画板块（`DiagramBlockView`）点「放大编辑」经 `openDiagramWindow`（`src/lib/windows/diagramWindow.ts`）开分离窗口，`useDiagramWindow`（`src/components/editor/hooks/useDiagramWindow.ts`）用 `webviewWindow.once('tauri://destroyed')` 在窗口销毁时把 `windowOpen` 复位为 false。

## 表现

画板块第一次放大正常；关闭分离窗口后，工具栏的放大图标保持 `disabled={windowOpen}` 灰置，永远无法再次放大。无报错。同一 `once('tauri://destroyed')` 模式下任何"窗口关闭后复位状态"的调用方都会同样卡死。

## 根因

`src/lib/core/tauriShim/webviewWindow.ts` 的 `once()` 只映射了两个事件：`tauri://created`（由 `windowCreate` promise resolve 触发）与 `tauri://error`（由 promise reject 触发）。Electron 主进程没有窗口销毁的广播通道，`tauri://destroyed` 分支不存在，回调永不执行——`onClosed` 不跑，`windowOpen` 停在 true。

## 解决

主进程在窗口真正关闭后广播，shim 过滤映射：

1. `electron/main.ts` `trackWindow` 的 `win.on('closed')`：先 `windows.delete(label)`，再 `broadcast('window-closed', undefined, { label })`（先删后播，销毁中的窗口自己收不到；`sendTo` 内部有 `isDestroyed` 守卫）。
2. `tauriShim/webviewWindow.ts` `once()` 增加 `tauri://destroyed` 分支：用 shim 的 `listen('window-closed')` 过滤 `e.payload.label === this.label`，命中即触发回调并退订（`fired` 标志 + promise 竞态处理，避免订阅完成前已触发导致漏退订）。

## 相关改动

- `desktop/electron/main.ts:156` —— closed 处理器追加 `broadcast('window-closed', ...)`
- `desktop/src/lib/core/tauriShim/webviewWindow.ts:57` —— `once()` 新增 `tauri://destroyed` 映射分支
- commit b9df4ff

## 复用提示

排查「Tauri 时代正常、Electron 下生命周期回调不执行」类问题：先查 tauriShim 对应事件名是否有映射（`webviewWindow.ts` / `window.ts` / `event.ts`），shim 只实现了迁移时用到的最小事件面，未实现的事件静默不触发、不报错。给 shim 补事件的标准模式：主进程 `broadcast('<event>', ...)` → shim `listen` 过滤 label/参数后转成 Tauri 事件回调。
