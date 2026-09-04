---
title: 子窗口 URL 漏 ?label= 导致 preload 回退 main：数据取不到且 close 误伤主窗口
date: 2026-09-05
area: desktop/electron
tags: [electron, preload, windowLabel, preview, get_preview_data]
status: active
source: commit 待提交
---

## 背景

desktop 端 Electron 壳。预览窗口（图片/文件放大预览）由 `openPreviewWindow`（`src/lib/windows/previewWindow.ts`）打开：主窗口把 payload 经 `set_preview_data` 存进 Rust 内存（key 为窗口 label），子窗口加载后 `fetchPreviewData` 用自己的 label 调 `get_preview_data`（破坏性读）取回。preload（`electron/preload.ts`）以 `new URLSearchParams(location.search).get('label') ?? 'main'` 注入 `windowLabel`。

## 表现

图片「新窗口打开」后窗口一直停在 loading 转圈（`fetchPreviewData` 重试 20 次、每次间隔 300ms 全部取回 null）；点预览窗口的关闭按钮关不掉自己。

## 根因

`previewWindow.ts:75` 创建窗口的 URL 为 `index.html?window=preview`，**没有 `label` 参数**（全仓库唯一一处漏带；diagram/document/terminal 的 URL 都带）。preload 注入的 `windowLabel` 回退为 `'main'`，于是：

1. `fetchPreviewData` 用 `label='main'` 调 `get_preview_data` → Rust 缓存里不存在该 key → 永远 null。
2. `closePreviewWindow` → `windowOp('main', 'close')` → 目标是主窗口而非预览窗口。

## 解决

创建窗口的 URL 显式带上 label：

```ts
url: `index.html?window=preview&label=${encodeURIComponent(label)}`,
```

preload 注入即正确，`fetchPreviewData` / `closePreviewWindow` 全部恢复。渲染层改动，主窗口 HMR 后重新打开预览即生效。

## 相关改动

- `desktop/src/lib/windows/previewWindow.ts:79` —— URL 追加 `label` 参数
- `desktop/src/lib/windows/previewWindow.js` —— esbuild 重新生成（Vite 优先解析 .js）
- commit 待提交

## 复用提示

新建任何子窗口（`new WebviewWindow(label, { url })`）时，URL 必须显式携带 `?label=`——preload 只认 URL 参数，不会从其他通道注入；漏带的症状是「子窗口内以 label 为 key 的数据通道全部落空 + windowOp 打错目标」。排查子窗口数据加载失败时，第一步在子窗口 console 里核对 `window.jstudioNative.windowLabel` 是否等于创建时的 label，再查数据中继本身。
