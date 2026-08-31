# 连线流动动画性能优化方案

## 问题根因

当前实现（`GraphCanvas.tsx` L286-331）使用 SMIL `animateMotion` 实现流动圆点效果，存在三重性能瓶颈：

1. **每帧重建 DOM**：`doRedrawShape` 在每条边的每次重绘时触发（拖拽/平移/缩放时每秒数十次），每次都 `createElementNS` 创建新的 `<circle>` + `<animateMotion>`。因为 `Shape.clear()` 会移除 `<g>` 所有子元素，所以每次重绘后必须重新创建。
2. **N 个 SMIL 动画引擎**：每条边一个 `animateMotion` + `repeatCount="indefinite"`，N 条边 = N 个持续运行的 SMIL 动画引擎。
3. **SMIL 动画不断重启**：每次重建 DOM，动画从 t=0 重新开始，圆点无法平滑流动。

## 方案：CSS `stroke-dashoffset` 动画替代 SMIL

### 核心原理

- maxGraph `Shape.create()` 返回 `<g>` 元素，`<path>` 是其子元素
- `Shape.clear()` 移除 `<g>` 的所有子元素，`redrawShape()` 重新创建 `<path>`
- **CSS 类选择器 `.jgraph-edge > path` 会自动作用于新建的 `<path>`**，无需 JS 介入
- maxGraph 在 `isDashed=false` 时不会设置 inline `stroke-dasharray`（已确认 `SvgCanvas2D.updateStroke()` 源码），CSS 不会被覆盖

### 改动 1：`GraphCanvas.tsx`

**删除 `doRedrawShape` override**（L301-330），只保留 `initializeShape` override（L288-295）给 `<g>` 打 `.jgraph-edge` 类。

**删除 `getEdgeDotColor` 导入**（不再使用）。

**新增边数阈值控制**：当边数 > 20 时，给容器加 `.jgraph-flow-off` 类，CSS 自动关闭动画。用 ref 存储函数，在以下位置调用：
- 初始快照灌入后
- 模型变化监听器内（`InternalEvent.CHANGE`）
- 外部快照同步 effect 内
- 导入快照后

### 改动 2：`vscode-theme.css`（L3409-3424）

替换 SMIL 圆点 CSS 为 CSS `stroke-dashoffset` 动画：

```css
.jgraph-edge > path {
  stroke-dasharray: 8 4;
  animation: jgraph-edge-flow 1.2s linear infinite;
}

@keyframes jgraph-edge-flow {
  to { stroke-dashoffset: -12; }  /* 8+4=12，一个完整周期 */
}

/* 边数过多时关闭流动动画 */
.jgraph-flow-off .jgraph-edge > path {
  stroke-dasharray: none;
  animation: none;
}

/* 尊重系统「减少动态效果」偏好 */
@media (prefers-reduced-motion: reduce) {
  .jgraph-edge > path {
    stroke-dasharray: none;
    animation: none;
  }
}
```

### 视觉变化

- **原效果**：实线 + 圆点沿路径流动
- **新效果**：虚线（dash 8px + gap 4px）+ dash 流动，方向从起点到终点
- 这是 draw.io / Mermaid 等工具的标准流动连线效果

### 性能提升

| 指标 | SMIL 方案 | CSS 方案 |
|------|----------|----------|
| 每次重绘的 DOM 操作 | O(N) createElementNS + appendChild | 0 |
| 动画引擎开销 | N 个 SMIL animateMotion | N 个 CSS animation（浏览器原生优化） |
| 边数 > 20 时 | 持续卡顿 | 自动关闭动画，0 开销 |
| `prefers-reduced-motion` | 仅隐藏圆点 | 完全关闭动画 |
