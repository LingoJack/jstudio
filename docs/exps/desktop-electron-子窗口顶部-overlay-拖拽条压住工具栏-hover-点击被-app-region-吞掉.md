---
title: 子窗口顶部 overlay 拖拽条压住工具栏：hover/点击被 app-region 吞掉
date: 2026-09-05
area: desktop/electron
tags: [electron, app-region, drag-region, z-index, ChildWindowDragBar, hiddenInset]
status: active
source: commit b9df4ff
---

## 背景

desktop 端分离子窗口（文档/终端/画板/预览）在 `electron/main.ts` `createChildWindow` 改用 `titleBarStyle: 'hiddenInset'` 去掉原生标题栏后，渲染层需自绘窗口拖拽区。实现为 `ChildWindowDragBar`（`src/components/windows/ChildWindowDragBar.tsx`）：`absolute top-0 inset-x-0 h-9 z-10` + `data-tauri-drag-region`（该属性经 `vscode-theme.css:4191` 映射为 `-webkit-app-region: drag`）。画板分离窗口（`DiagramWindowApp`）顶部另有悬浮工具栏 `.jgraph-toolbar`（`top: 8px`，原 `z-index: 5`）。

## 表现

画板分离窗口里工具栏 hover 不展开菜单、点击无反应（每次必现）；文档窗口的 FindBar、终端窗口的 tab 条不受影响。把工具栏 z-index 提到拖拽条之上后 hover/点击恢复。

## 根因

Chromium 对 `-webkit-app-region` 的命中测试按视觉层叠序自顶向下：命中点上最高的元素决定该点是否为拖拽区。工具栏 `top: 8px`、高 36px，与拖拽条（覆盖 y∈[0,36]）重叠约 28px；拖拽条 z-10 高于工具栏 z-5，重叠区命中点落在拖拽条上 → 命中为 drag，鼠标事件（含 hover、click）全部被窗口拖拽吞掉。z-20 的终端 tab 条、no-drag 的 FindBar 不受影响，恰好解释了差异。

## 解决

- 层级修正：`.jgraph-toolbar` z-index 5 → 20（高于拖拽条 z-10，低于下拉菜单 z-100）。
- 结构性修正（画板窗口最终方案）：`DiagramWindowApp` 弃用 overlay 拖拽条，改为**布局式条带**——根容器 flex column 的第一个真实子行 `<div data-tauri-drag-region className="h-9 shrink-0" />`，画布 `flex: 1` 接在其下。条带与工具栏/画布在布局上互不重叠，命中区歧义从结构上消除；代价是画布高度少 36px。

## 相关改动

- `desktop/src/styles/vscode-theme.css:3588` —— `.jgraph-toolbar` z-index 5 → 20
- `desktop/src/components/windows/DiagramWindowApp.tsx:139` —— overlay 换为布局式拖拽条带
- `desktop/src/components/windows/ChildWindowDragBar.tsx` —— overlay 条带组件（文档/终端/预览窗口沿用，z-10）
- commit b9df4ff

## 复用提示

给 hiddenInset 子窗口加可交互顶部元素时，按此清单核对与拖拽条的关系：交互元素 z-index 高于 z-10，或自身带 `.no-drag`，或（最稳）与拖拽条在布局上不重叠。overlay 方案要求逐一核对每个浮层的层级；布局式条带零重叠，画布类全交互窗口优先用布局式。已验证不可用的组合：拖拽条 z-10 压 z-5 工具栏（事件全吞）。
