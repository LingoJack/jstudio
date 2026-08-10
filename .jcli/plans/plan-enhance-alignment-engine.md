# 优化画板对齐引擎 — 增强灵敏度 + 等间距对齐

## 背景分析

当前对齐引擎使用 maxGraph 内置的 `Guide` 类，存在两个不足：

1. **触发不够灵敏**：`tolerance` 默认值为 2px（网格关闭时），用户几乎感知不到吸附效果，需要精确到像素级才能触发。
2. **缺少等间距对齐**：只支持左/中/右（X）和上/中/下（Y）的边对齐，无法检测"平分间隔"场景（如拖入第三个节点时自动与两侧节点形成等距间隙）。

## 方案概述

新建一个 `EnhancedGuide` 类继承 maxGraph 的 `Guide`，重写 `move()` 方法实现：

| 功能 | 说明 |
|------|------|
| 提升灵敏度 | 标准对齐容差从 2px → 6px（网格关闭时） |
| 水平等间距 | 拖动时检测"与两个参考节点形成等距间隙"并吸附 |
| 垂直等间距 | 同上，纵向版本 |
| 视觉区分 | 标准对齐线=主题色，等间距线=琥珀色(#F59E0B) |

## 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `graphSetup/enhancedGuide.ts` | **新建** | EnhancedGuide 类 |
| `graphSetup/interactionConfig.ts` | **修改** | 覆写 `createGuide` 返回 EnhancedGuide |
| `graphSetup/index.ts` | **修改** | 导出 enhancedGuide（如需要） |

---

## 详细设计

### 1. 新建 `enhancedGuide.ts`

```typescript
import { Guide, Point, PolylineShape } from '@maxgraph/core';
import type { CellState, Graph, Rectangle } from '@maxgraph/core';
import { getSelectionColor } from '../graphTheme';

// 常量
const SNAP_TOLERANCE = 6;       // 标准对齐容差（原 2px → 6px）
const SPACING_TOLERANCE = 8;    // 等间距对齐容差
const SPACING_GUIDE_COLOR = '#F59E0B'; // 琥珀色，区分于标准对齐线
```

#### 1.1 构造函数

```typescript
class EnhancedGuide extends Guide {
  private dark: boolean;
  private guideSpacingX: PolylineShape | null = null; // 等间距水平引导线
  private guideSpacingY: PolylineShape | null = null; // 等间距垂直引导线

  constructor(graph, states, dark) {
    super(graph, states);
    this.tolerance = SNAP_TOLERANCE; // 提升灵敏度
    this.dark = dark;
  }
}
```

#### 1.2 重写 `getGuideColor()` — 标准对齐线跟随主题色

```typescript
getGuideColor(state, horizontal) {
  return getSelectionColor(this.dark); // 与选中框/预览框同色
}
```

#### 1.3 重写 `move()` — 核心算法

`move()` 方法完整重写，包含两个阶段：

**阶段 A：标准对齐（与原 Guide 相同逻辑，但容差更大）**

遍历所有参考 cell states，对每个 state 检查：
- X 轴：拖动框的左/中/右 与 state 的左/中/右 是否在容差内
- Y 轴：拖动框的上/中/下 与 state 的上/中/下 是否在容差内

记录最佳匹配（距离最小），设置 `overrideX` / `overrideY`。

**阶段 B：等间距检测（新增）**

在标准对齐完成后，检查等间距机会：

**水平等间距 — 三种场景**（A、B 为参考节点，C 为拖动节点）：

```
场景1: C 在 A、B 之间          场景2: C 在 A、B 右侧        场景3: C 在 A、B 左侧
  ┌───┐    ┌───┐    ┌───┐       ┌───┐  ┌───┐    ┌───┐       ┌───┐    ┌───┐  ┌───┐
  │ A │ gap│ C │ gap│ B │       │ A │gap│ B │ gap│ C │       │ C │ gap│ A │gap│ B │
  └───┘    └───┘    └───┘       └───┘  └───┘    └───┘       └───┘    └───┘  └───┘
  目标: gap_AC == gap_CB         目标: gap_AB == gap_BC        目标: gap_CA == gap_AB
```

计算公式：
- 场景1: `targetCx = A.right + (B.left - A.right - C.width) / 2`
- 场景2: `targetCx = B.right + (B.left - A.right)`
- 场景3: `targetCx = A.left - (B.left - A.right) - C.width`

**垂直等间距**：同上，X/Y 互换。

**筛选条件**：
- A 和 B 之间有正间隙（`B.left > A.right`，不重叠）
- 拖动节点与 A、B 在垂直方向有重叠（大致同一行）——用 `verticalOverlap()` 辅助函数判断
- 计算出的目标位置与当前位置差距在 `SPACING_TOLERANCE * scale` 内

**阶段 C：择优**

- 如果等间距匹配的偏差 ≤ 标准对齐的偏差，优先使用等间距（用琥珀色引导线）
- 否则使用标准对齐（主题色引导线）
- 绘制对应的引导线（竖线 for X，横线 for Y），等间距线从涉及的所有节点顶部延伸到底部

#### 1.4 辅助函数

```typescript
// 判断两个矩形在垂直方向是否有重叠（用于水平等间距筛选）
function verticalOverlap(a: Rectangle, b: Rectangle, tol: number): boolean {
  return !(a.y + a.height + tol < b.y || b.y + b.height + tol < a.y);
}

// 判断两个矩形在水平方向是否有重叠（用于垂直等间距筛选）
function horizontalOverlap(a: Rectangle, b: Rectangle, tol: number): boolean {
  return !(a.x + a.width + tol < b.x || b.x + b.width + tol < a.x);
}
```

#### 1.5 重写 `hide()` 和 `destroy()`

```typescript
hide() {
  super.hide();
  if (this.guideSpacingX) this.guideSpacingX.node.style.visibility = 'hidden';
  if (this.guideSpacingY) this.guideSpacingY.node.style.visibility = 'hidden';
}

destroy() {
  super.destroy();
  this.guideSpacingX?.destroy();
  this.guideSpacingY?.destroy();
  this.guideSpacingX = null;
  this.guideSpacingY = null;
}
```

### 2. 修改 `interactionConfig.ts`

在 `setupInteractionConfig` 中，获取到 `selectionHandler` 后覆写 `createGuide`：

```typescript
selectionHandler.createGuide = () => {
  return new EnhancedGuide(
    graph,
    selectionHandler.getGuideStates(),
    ctx.darkModeRef.current,
  );
};
```

---

## 用户体验说明

- **更灵敏的触发**：容差从 2px 提升到 6px，拖动时更容易"吸"到对齐线
- **智能等间距**：当拖动节点接近"与两个已有节点形成等距间隙"的位置时自动吸附
- **视觉区分**：
  - 标准对齐（边对齐、居中对齐）→ 主题色虚线
  - 等间距对齐 → 琥珀色虚线
- **性能**：等间距检测遍历所有参考节点对（O(n²)），但画布节点数通常 < 50，无性能问题。可加垂直/水平重叠预筛选减少无效计算
