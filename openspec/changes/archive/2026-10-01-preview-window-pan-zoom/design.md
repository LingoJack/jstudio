# Design

## Context

三个相关实现点（动机见 proposal.md · Why）：

- **Mermaid 窗口**：`MermaidViewer`（`desktop/src/components/editor/nodes/code-block/MermaidViewer.tsx`）基于 `react-zoom-pan-pinch`，自己驱动 `panBy`/`zoomToPoint`（因为库的内置 pan 在 ProseMirror 里永远不启动）。已有：Cmd/Ctrl+滚轮缩放、左/中/右键拖拽、双击复位、工具栏；窗口模式下普通滚轮平移（`panOnWheel`）。滚轮监听是非 passive 原生监听（React `onWheel` 是 passive，preventDefault 无效）——这个约束必须保留。
- **图片窗口**：`PreviewWindowApp.tsx` 里的手写 `ImageZoom`（state + CSS transform），Alt+滚轮缩放、普通滚轮平移、仅左键拖拽。
- **HTML 窗口**：`preview-frame-wrap` 里一个原生 DOM iframe（React 19 dev 模式会把 JSX 渲染的 sandbox iframe 遍历 reconciliation 导致 SecurityError 崩溃，所以 iframe 必须保持原生 DOM 创建——不可回退为 JSX）。iframe 完全没有缩放/平移。

约束：预览窗口与主窗口共用同一 bundle，`main.tsx` 的全局 `contextmenu` preventDefault 对预览窗口同样生效——右键拖拽不会被原生菜单打断，无需新增处理。

## Goals / Non-Goals

**Goals:**

- 把 MermaidViewer 的手势逻辑提取为**共享 pan/zoom stage 组件**，HTML / Mermaid / 图片三个窗口共用一份实现（"统一"落在一处代码上，而不是三处约定）。
- 窗口模式下：普通滚轮 = 光标锚点缩放；左/中/右键拖拽 = 平移；双击 = 复位。
- HTML 窗口保持 iframe 可交互（点击、表单），缩放平移通过事件转发实现。

**Non-Goals:**

- 不改编辑器内联预览的手势（普通滚轮必须滚动页面）——stage 提供"仅修饰键缩放"模式给编辑器用。
- 不动 PDF / DOCX / 文本窗口（文档滚动模型；PDF 保持 Ctrl/Cmd+滚轮缩放）。
- 不引入新依赖；不改 `PreviewPayload` / Rust 侧。

## Decisions

### D1. 提取共享组件 `PanZoomStage`（而非共享 hook）

位置：`desktop/src/components/windows/PanZoomStage.tsx`。封装 `TransformWrapper` + TransformComponent + 非被动滚轮监听 + mousedown/move/up 拖拽 + 双击复位，暴露 api ref（`ReactZoomPanPinchContentRef`）给工具栏用。

```tsx
interface PanZoomStageProps {
  wheelMode: "always-zoom" | "ctrl-zoom"; // 窗口=always-zoom，编辑器=ctrl-zoom
  showControls?: boolean;                 // −/＋/⊗ 工具栏
  children: React.ReactNode;              // 被缩放的内容
  className?, style?, overlay?, contentEditable?, containerRef?  // MermaidViewer 现有 props 原样透传
}
```

备选：共享 hook（各消费方自渲染 TransformWrapper）——手势接线的重复度只是从组件层挪到调用层，没有收益；组件方案让三个窗口的交互"必然一致"。

`MermaidViewer` 重构为：错误展示 + overlay + `<PanZoomStage wheelMode={...}>` 包裹 svg stage；`ImageZoom` 重构为 `<PanZoomStage wheelMode="always-zoom" showControls>` 包裹 `<img>`。内部常量（MIN/MAX_SCALE=0.2/8、灵敏度、deltaMode 归一化）随实现一起搬进 stage。

### D2. 窗口模式滚轮：任何修饰组合都缩放

`wheelMode: "always-zoom"` 时，wheel 事件无论是否带 Cmd/Ctrl 一律 `preventDefault` + `zoomToPoint`（锚点 = 光标）；`"ctrl-zoom"`（编辑器）保持现状：无修饰键时直接 return，让页面滚动。deltaMode==1 的行增量归一化（×40px）与灵敏度沿用现值。

被取代的行为：Mermaid 窗口普通滚轮平移、图片窗口 Alt+滚轮——平移统一交给拖拽。备选（保留滚轮平移、缩放要修饰键）已被用户否决。

### D3. HTML 窗口：same-origin 事件转发（不牺牲 iframe 交互性）

iframe 的 wheel/mousedown 事件落在 iframe 文档里，永远不会冒泡到父窗口。iframe 是 `allow-same-origin` + srcdoc，父窗口可以直接访问 `iframe.contentDocument`：

1. `PanZoomStage` 提供 `interactiveContentRef` 注册口；HTML 分支在 iframe 创建/`srcdoc` 更新时，向 `contentDocument` 上挂镜像的非 passive `wheel`/`mousedown`/`mousemove`/`mouseup` 监听（挂载用幂等标记，`load` 事件后重挂）。
2. 转发时把 iframe 视口坐标换算到父窗口坐标：`parentX = iframeRect.left + localX * (iframeRect.width / iframe.clientWidth)`——rect 是 transform 后的实测值，每次事件现算，不缓存缩放状态。
3. 父/子两路事件驱动**同一个增量式拖拽状态**（`lastX/lastY` 只做 delta），指针在拖拽中跨 iframe 边界时两份文档各自收到 move，增量模型天然无接缝。
4. iframe 内的监听一律 `preventDefault`（阻止 iframe 文档自身滚动/选中），再交给 stage 的统一处理函数。

transform 作用在包裹 iframe 的容器上，浏览器自动处理命中测试（缩放后点击位置正确映射进 iframe 内容），iframe 保持原生 DOM 创建，React 不感知其内部结构。

备选：
- *iframe 上盖透明交互层（pointer-events:none）*——否决：破坏 HTML 演示的交互性，而 sandbox 明确放行 scripts/forms/popups，交互是有意设计。
- *向 srcdoc 注入 postMessage 转发脚本*——保留为兜底方案：若直接挂监听在某个 WebView 上不稳定，改走此路（接口不变，只换转发通道）。

### D4. 图片窗口并入 stage

`ImageZoom` 的手写 state/transform 全部删除，换 `PanZoomStage`：普通滚轮缩放（替代 Alt+滚轮）、三键拖拽（补齐右键）、双击复位（新增）、工具栏映射 `zoomOut/zoomIn/resetTransform`。`object-fit: contain` + scale 1 = 适配的语义不变。

### D5. 样式与光标

沿用 `.is-panning` 状态类与 `.preview-zoom` 工具栏皮肤；为 HTML/图片 stage 补 `grab`/`grabbing` 光标（mermaid 已有）。全部落在 `vscode-theme.css`。

## Risks / Trade-offs

- [iframe srcdoc 重载后监听丢失] → 每次设置 `srcdoc` 后（`load` 事件）重新幂等挂载；挂载函数可重复调用。
- [跨文档拖拽坐标换算误差导致跳变] → 换算基于每次事件实测的 `getBoundingClientRect`，增量 delta 模型对单次误差不累积；任务里包含"拖拽跨 iframe 边界"验证项。
- [React 19 sandbox 崩溃回归] → 硬约束：iframe 仍是原生 DOM 创建，`PanZoomStage` 只包容器 div；代码审查项明确列出。
- [WebView 原生捏合缩放与 stage 缩放叠加] → wheel 监听非 passive 且 preventDefault（Mermaid 已验证可行），HTML/图片 stage 复用同一路径。
- [习惯迁移：Mermaid/图片窗口普通滚轮不再平移] → 平移由拖拽（含右键）承接，spec 已明确记录该行为变更。

## Migration Plan

纯前端改动，无数据/属性迁移（`PreviewPayload` 不变）。单 commit 落地，回滚 = revert。验证按 spec 场景逐条手测（HTML / Mermaid / 图片 / 编辑器内联 / PDF / DOCX 各一遍）。

## Open Questions

（无——滚轮触发方式已由用户拍板为"直接滚轮缩放"；统一范围限定画布类内容已在 proposal 中记录。）
