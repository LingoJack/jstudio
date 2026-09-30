# Proposal

## Why

从 CodeBlockView 打开的预览新窗口交互残缺且彼此不一致：HTML 预览窗口完全没有缩放/平移；Mermaid 窗口滚轮缩放需要 Cmd/Ctrl 修饰键（普通滚轮是平移）；图片窗口用的是 Alt+滚轮。用户希望所有预览新窗口统一为同一套手势——滚轮缩放、拖拽平移、右键拖拽平移——"统一"是首要目标。

已确认的决策（用户拍板）：
- **普通滚轮直接缩放**（不需要修饰键），以光标为锚点；Cmd/Ctrl+滚轮同样缩放（mac 触控板捏合上报 ctrlKey）。
- **统一是第一原则**：凡是预览窗口里的"画布类"内容（HTML、Mermaid、图片）都用同一套手势，不允许各窗口各一套。

## What Changes

- **统一交互模型（预览窗口 · 画布类内容）**：普通滚轮 / Cmd(Ctrl)+滚轮 = 以光标为锚点缩放；左键 / 中键 / 右键拖拽 = 平移；双击 = 复位到适配大小；保留已有的 −/＋/⊗ 工具栏。
- **HTML 预览窗口**：iframe 包进统一 pan/zoom 舞台，新增滚轮缩放 + 三键拖拽平移 + 双击复位；iframe 内容保持可交互（点击、表单等），通过 same-origin 事件转发实现（详见 design.md）。
- **Mermaid 预览窗口（行为变更）**：普通滚轮从"平移"改为"缩放"；平移统一交给拖拽。其余（Cmd/Ctrl+滚轮缩放、右/中键拖拽、双击复位、工具栏）保持。
- **图片预览窗口（行为变更）**：Alt+滚轮缩放升级为普通滚轮缩放（普通滚轮不再平移），补齐右键拖拽平移与双击复位，与 Mermaid 窗口完全一致。
- **抽取共享 pan/zoom 交互**：把 MermaidViewer 里的手势逻辑提取为共享 stage/hook，HTML / Mermaid / 图片三个窗口共用，杜绝三套实现。
- **明确不受影响**：编辑器内联预览（编辑器里普通滚轮必须滚动页面，维持 Cmd/Ctrl+滚轮缩放）；PDF / DOCX / 文本窗口维持文档滚动模型（PDF 保持 Ctrl/Cmd+滚轮缩放）——文档流内容强制滚轮缩放会破坏阅读，故统一范围限定为画布类内容。

## Capabilities

### New Capabilities

- `preview-window`: 预览新窗口的查看交互——画布类内容（HTML / Mermaid / 图片）的统一缩放与平移手势、复位行为，以及 iframe 可交互性约束。

### Modified Capabilities

（无——`openspec/specs/` 目前为空，无既有能力被修改。）

## Impact

- `desktop/src/components/windows/PreviewWindowApp.tsx` — `PreviewContent` 的 html / mermaid / image 分支与 `ImageZoom` 组件。
- `desktop/src/components/editor/nodes/code-block/MermaidViewer.tsx` — 手势逻辑抽取为共享实现后复用（组件本身保留编辑器模式的 overlay/contentEditable 职责）。
- 新增共享 pan/zoom stage/hook（置于 `desktop/src/components/windows/`）。
- `desktop/src/styles/vscode-theme.css` — 抓取/平移光标与 `is-panning` 状态样式。
- 依赖：`react-zoom-pan-pinch`（项目已有，无新增依赖）。
- 无 API / 数据格式变更；`PreviewPayload` 结构不变。
