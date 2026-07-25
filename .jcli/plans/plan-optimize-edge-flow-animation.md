# 优化连线蚂蚁线流动动画

## 现状分析

当前连线流动效果实现：
- **样式**：所有 edge 默认 `dashed: true`，`dashPattern: '8 4'`（周期 12px）
- **动画**：CSS `stroke-dashoffset` 0 -> -12，0.9s linear infinite
- **问题**：
  1. 只读浏览模式下也在持续流动，分散注意力且浪费 CPU
  2. 0.9s 周期偏快，视觉上略感焦躁
  3. 缺少 `will-change` 性能提示，大量连线时可能掉帧
  4. 选中的连线与普通连线动画表现一致，缺乏层次感

## 优化方案

### 改动 1：只读模式停止流动（CSS only）

文件：`src/styles/vscode-theme.css`

只读模式下用户只是查看图表，持续流动既分散注意力又浪费 CPU。利用已有的 `is-readonly` class 控制：

```css
/* 只读模式：停止流动，回到静态虚线 */
.jgraph-canvas-root.is-readonly .jgraph-edge path {
  animation: none;
}
```

### 改动 2：调整动画速度，更舒缓优雅（CSS only）

文件：`src/styles/vscode-theme.css`

0.9s -> 1.4s，让流动更从容，减少视觉焦虑感。`linear` 缓动保持不变（连续流动必须用 linear 才能无缝循环）。

### 改动 3：性能优化提示（CSS only）

文件：`src/styles/vscode-theme.css`

添加 `will-change: stroke-dashoffset`，提示浏览器将动画提升到 GPU 合成层，减少主线程重绘开销。

### 改动 4：选中连线增强效果（JS + CSS）

文件：`src/components/editor/nodes/graph/GraphCanvas.tsx` + `src/styles/vscode-theme.css`

在初始化 hook 中监听选择变化，为选中的 edge 的 SVG `<g>` 添加 `jgraph-edge-selected` class。选中时流动加速（0.7s）+ 线宽微增，让用户能快速定位正在操作的连线。

**JS 部分**（GraphCanvas.tsx，在 `initializeShape` hook 附近）：
```ts
// 监听选择变化，为选中的 edge 打标记
graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
  const selEdges = new Set(
    graph.getSelectionModel().getCells().filter(c => c.isEdge())
  );
  const parent = graph.getDefaultParent();
  for (const cell of graph.getChildEdges(parent)) {
    const state = graph.getView().getState(cell);
    if (state?.shape?.node) {
      state.shape.node.classList.toggle('jgraph-edge-selected', selEdges.has(cell));
    }
  }
});
```

**CSS 部分**：
```css
.jgraph-edge-selected path {
  animation-duration: 0.7s;
}
```

## 涉及文件

| 文件 | 改动内容 |
|------|---------|
| `src/styles/vscode-theme.css` | 动画速度调整、will-change、只读停止、选中增强 |
| `src/components/editor/nodes/graph/GraphCanvas.tsx` | 选择变化监听，为选中 edge 打 class |

## 风险评估

- **低风险**：改动集中在 CSS 动画属性和一个事件监听器，不影响数据流和交互逻辑
- `will-change` 在元素数量多时可能增加内存占用，但连线数量通常有限（<100），可接受
- 选择变化监听在每次选择切换时遍历所有 edge，连线数量少时性能无感知
