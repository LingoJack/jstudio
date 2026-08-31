# 修复图形交互问题

## 问题概述

1. **缩放在图形上不生效**：双指缩放只在画板空白区域可用，在图形上方无效
2. **移动图形应在边框触发**：点击图形内部不应触发移动，应穿透到下层图形；只有点击边框才能选中并移动

## 问题 2：缩放在图形上不生效

### 根因分析

容器 `.jgraph-surface` 已被 maxGraph 设置 `touch-action: none`，但 maxGraph 创建的 SVG 子元素（`<svg>` 及其内部 `<g>`、`<path>` 等）没有显式设置 `touch-action`。

在 VS Code WebView / Electron 环境中，macOS 触控板双指缩放手势可能在合成器层级被浏览器原生处理（对 `touch-action` 为默认值 `auto` 的 SVG 元素），导致 `wheel` 事件根本没有生成，容器的 `capture: true` 监听器自然无法触发。

> 注：CSS `touch-action` 属性虽然规范上"不继承"，但浏览器实现中 `auto` 会被父元素的 effective touch-action 覆盖。然而在 Electron/WebView 环境下这一行为可能不一致，显式设置是最可靠的方案。

### 修复方案

在 `src/styles/vscode-theme.css` 中添加 CSS 规则，显式为 `.jgraph-surface` 内所有 SVG 元素设置 `touch-action: none`：

```css
.jgraph-surface svg,
.jgraph-surface svg * {
  touch-action: none;
}
```

## 问题 3：移动图形应在边框触发（内部穿透选中下层）

### 根因分析

`graphCanvasStyle.ts` 第 64 行已设置 `pointerEvents: false`，注释写道"无填充时内部可穿透点击，仅边框可选中/拖动；有填充色时自动失效。"

但 maxGraph 的 `RectangleShape.paintBackground` 实现逻辑为：
- 当 `style.pointerEvents === false` 且 `fill !== NONE`（有填充色）时，**不会**设置 `pointer-events: none`
- 只有 `fill === NONE`（无填充色）时才设置 `pointer-events: none`

因此所有有填充色的图形，其内部仍然捕获鼠标事件，导致无法选中下层图形。

### 修复方案：覆写 `graph.updateMouseEvent` 实现 JS 层边框命中检测

不修改 SVG `pointer-events`（避免影响双击编辑、连线等操作），而是在 JavaScript 层覆写 `graph.updateMouseEvent`，仅对 `MOUSE_DOWN` 和 `MOUSE_UP` 事件重新评估命中目标：

**核心逻辑：**
1. 原始 `updateMouseEvent` 已通过浏览器原生命中检测设置了 `me.state`（即被点击的最顶层图形）
2. 覆写逻辑检查该图形是否为顶点（vertex），以及点击点是否在边框上（8px 容差）
3. 若点击在内部（非边框）：用 `getCellAt` 查找下层图形（跳过当前图形），若找到则更新 `me.state` 指向下层图形
4. 若无下层图形：保持原选择（保证孤立图形仍可被选中移动）

**`isOnBorder` 辅助函数：**
- 处理旋转：将点击点逆旋转到图形局部坐标系
- 边框判定：点在外扩矩形（bounds + tolerance）内，且不在内缩矩形（bounds - tolerance）内
- 容差：8 屏幕像素，转换为图坐标（`8 / view.scale`）

**为何只覆写 `updateMouseEvent` 而非全局覆写 `intersects`：**
- `intersects` 被 `getCellAt` 调用，而 `getCellAt` 用于多种场景（双击编辑、连线、工具提示等）
- 全局覆写 `intersects` 会导致双击编辑和连线操作无法点击图形内部
- 只覆写 `updateMouseEvent` 对 `MOUSE_DOWN`/`MOUSE_UP` 的处理，不影响 `dblclick`（`dblclick` 事件直接调用 `getCellAt`，不经过 `updateMouseEvent`）和连线操作

### 实施步骤

#### 1. 修改 `src/styles/vscode-theme.css`
添加 SVG 元素的 `touch-action: none` 规则。

#### 2. 修改 `src/components/editor/nodes/graph/GraphCanvas.tsx`
- 在 `initGraph` 函数中，graph 初始化后覆写 `graph.updateMouseEvent`
- 添加 `isOnBorder` 辅助函数（模块级或组件内）
- 使用常量 `BORDER_TOLERANCE = 8`（屏幕像素）

#### 关键代码片段

```typescript
const BORDER_TOLERANCE_PX = 8;

/** 检查点 (x, y) 是否在 cell state 的边框上（容差 tol，图坐标） */
function isOnBorder(state: CellState, x: number, y: number, tol: number): boolean {
  let px = x, py = y;
  const rotation = state.style?.rotation;
  if (rotation) {
    const alpha = (rotation * Math.PI) / 180;
    const cos = Math.cos(-alpha);
    const sin = Math.sin(-alpha);
    const cx = state.getCenterX();
    const cy = state.getCenterY();
    const dx = x - cx, dy = y - cy;
    px = dx * cos - dy * sin + cx;
    py = dx * sin + dy * cos + cy;
  }
  const inOuter = px >= state.x - tol && px <= state.x + state.width + tol &&
                  py >= state.y - tol && py <= state.y + state.height + tol;
  if (!inOuter) return false;
  const inInner = px > state.x + tol && px < state.x + state.width - tol &&
                  py > state.y + tol && py < state.y + state.height - tol;
  return !inInner;
}

// 在 initGraph 中覆写：
const originalUpdateMouseEvent = graph.updateMouseEvent.bind(graph);
graph.updateMouseEvent = function (me, evtName) {
  const result = originalUpdateMouseEvent(me, evtName);
  if (evtName === InternalEvent.MOUSE_DOWN || evtName === InternalEvent.MOUSE_UP) {
    const originalCell = me.getCell();
    if (originalCell && originalCell.isVertex()) {
      const state = me.getState();
      if (state) {
        const tol = BORDER_TOLERANCE_PX / this.getView().scale;
        if (!isOnBorder(state, me.graphX, me.graphY, tol)) {
          // 点击在内部，查找下层图形
          const cellBelow = this.getCellAt(
            me.graphX, me.graphY, null, true, true,
            (s) => s.cell === originalCell
          );
          if (cellBelow) {
            me.state = this.getView().getState(cellBelow);
          }
        }
      }
    }
  }
  return result;
};
```

## 行为预期

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 点击图形边框 | 选中并可移动 | 选中并可移动（不变） |
| 点击图形内部（有下层图形） | 选中顶层图形 | 选中下层图形 |
| 点击图形内部（无下层图形） | 选中该图形 | 选中该图形（回退） |
| 双击图形内部编辑文字 | 正常 | 正常（不受影响） |
| 从图形连线 | 正常 | 正常（不受影响） |
| 触控板缩放（空白区域） | 正常 | 正常（不变） |
| 触控板缩放（图形上方） | 不生效 | 生效 |

## 涉及文件

1. `src/styles/vscode-theme.css` — 添加 SVG touch-action CSS
2. `src/components/editor/nodes/graph/GraphCanvas.tsx` — 覆写 `updateMouseEvent`，添加 `isOnBorder` 辅助函数
