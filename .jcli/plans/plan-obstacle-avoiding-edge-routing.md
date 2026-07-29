# 避障正交边路由算法

## 问题分析

当前 `GraphCanvas.tsx` 使用 maxGraph 内置的 `orthogonalEdgeStyle`（即 `OrthogonalConnector`），这是一个**局部路由器**——它只根据源节点和目标节点的位置计算正交路径，完全不考虑画布上的其他节点。因此当两个节点之间有其他图形时，连线会直接从图形上穿过去。

## 解决方案

实现一个**混合式避障路由器**：
1. 先运行内置 `OrthogonalConnector` 获取基础路由（快速路径，处理 jetty/端口约束等）
2. 检查基础路由是否穿过任何障碍物（其他节点的包围盒）
3. 若未穿过 → 直接使用内置结果（大多数边走这条路径，零额外开销）
4. 若穿过 → 运行 **A\* 网格寻路** 计算避障路径
5. A\* 失败 → 回退到内置结果

## 实现步骤

### 1. 新建 `src/components/editor/nodes/graph/obstacleRouting.ts`

核心模块，包含以下部分：

#### 1.1 坐标系说明

- 边路由函数接收的 `state.absolutePoints`、`source`、`target` 均为**缩放坐标**（屏幕像素）
- 除以 `state.view.scale` 得到**模型坐标**（含 translate 偏移，但所有元素一致，相对位置正确）
- A\* 在模型坐标中运算，结果乘以 scale 推入 `result`

#### 1.2 障碍物收集

```typescript
// 从 graph.getChildVertices() 获取所有顶点
// 排除当前边的 source 和 target
// 将 CellState (x, y, width, height) 除以 scale 转为模型坐标
// 每个障碍物按 OBSTACLE_MARGIN(=12) 向外扩展
```

#### 1.3 路由碰撞检测

检查内置路由的每条线段是否与任何障碍物包围盒相交：
- 水平段（y 固定）：y 在障碍物 [top, bottom] 范围内 && x 范围有重叠
- 垂直段（x 固定）：x 在障碍物 [left, right] 范围内 && y 范围有重叠

#### 1.4 方向判定

复用 OrthogonalConnector 的逻辑：根据连接点在源/目标节点哪条边上来确定进出方向。
- `|pt.x - geo.x| <= 1` → WEST
- `|pt.x - (geo.x + geo.w)| <= 1` → EAST
- `|pt.y - geo.y| <= 1` → NORTH
- `|pt.y - (geo.y + geo.h)| <= 1` → SOUTH

#### 1.5 Jetty 点计算

从连接点沿进出方向偏移 `JETTY_SIZE`(=20，大于 OBSTACLE_MARGIN) 得到 A\* 的起点和终点。这确保起止点在所有扩展障碍物之外。

#### 1.6 A\* 网格寻路

```
网格分辨率：GRID_STEP = 20 模型单位
网格边界：起点 + 终点 + 所有障碍物 的包围盒 + padding
最大网格单元数：MAX_GRID_CELLS = 60000（超出则回退）

阻塞判定：网格单元中心点落在任意扩展障碍物内部 → 阻塞

移动方向：4 向（上下左右）
启发函数：曼哈顿距离
转弯惩罚：TURN_PENALTY = 6（减少拐弯，路径更整洁）
起止方向约束：起点第一步必须沿出口方向，终点最后一步必须沿入口方向
```

使用二叉堆优先队列实现 A\*，保证性能。

#### 1.7 路径简化

A\* 返回的路径是网格点序列，需要：
- 移除共线点（三点在同一直线上的中间点）
- 坐标取整到 1 位小数

#### 1.8 结果组装

`result` 数组在调用时已有 `result[0]` = 源连接点（由 `updatePoints` 推入）。
- 清除 `result[1:]`（内置路由的点）
- 推入 A\* 路径点（从 jettyStart 到 jettyEnd）
- 终点连接点由 `updatePoints` 在调用后自动追加

最终 `absolutePoints` = `[源连接点, jettyStart, ...A*中间点, jettyEnd, 目标连接点]`

#### 1.9 回退条件

以下情况直接使用内置 OrthogonalConnector 结果：
- 用户设置了手动航点（control hints）
- 源或目标是边（edge-to-edge 连接）
- 无障碍物
- 内置路由未穿过任何障碍物
- 网格过大（超过 MAX_GRID_CELLS）
- A\* 未找到路径
- 源/目标为 null 或连接点缺失

#### 1.10 边路由函数签名

```typescript
type EdgeStyleFunction = (
  state: CellState,
  source: CellState | null,
  target: CellState | null,
  points: Point[],
  result: Point[],
) => void;
```

注册：
```typescript
EdgeStyleRegistry.add('obstacleEdgeStyle', obstacleAvoidingOrthogonalStyle, {
  handlerKind: 'segment',  // 同 orthogonalEdgeStyle，支持拖拽航点
  isOrthogonal: true,
});
```

### 2. 修改 `GraphCanvas.tsx`

在 `useEffect` 初始化图时：

1. **新增导入** `registerObstacleEdgeStyle`（from `./obstacleRouting`）
2. **注册调用**：在 `registerCustomShapes()` (行 333) 之后调用 `registerObstacleEdgeStyle()`
3. **行 478**：`connectionHandler.createEdgeState` 中 `edgeStyle: 'orthogonalEdgeStyle'` → `'obstacleEdgeStyle'`
4. **行 585**：`edgeDefault.edgeStyle = 'orthogonalEdgeStyle'` → `'obstacleEdgeStyle'`

### 3. 修改 `graphModel.ts`

1. **行 88**：`edgeStyle: 'orthogonalEdgeStyle'` → `'obstacleEdgeStyle'`（`edge-ortho` 预设样式）
2. **行 177**：`edge.routing === 'straight' ? undefined : 'orthogonalEdgeStyle'` → `'obstacleEdgeStyle'`（`buildEdgeStyle` 函数）

### 4. 修改 `graphCanvasStyle.ts`

1. **行 95**：`edgeStyle: 'orthogonalEdgeStyle'` → `'obstacleEdgeStyle'`（`edge-ortho` 工具样式）

## 性能考量

- **快速路径**：大多数边不穿过障碍物，仅运行内置路由器 + 碰撞检测（O(segments × obstacles)），开销极小
- **慢速路径**：仅对穿过障碍物的边运行 A\*，典型网格 100×60 = 6000 单元，A\* < 3ms
- **拖拽场景**：拖动节点时只有连接到该节点的边需重路由（通常 2-6 条），总开销 < 20ms
- **大图保护**：MAX_GRID_CELLS 限制防止极端情况下的内存/性能问题

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/editor/nodes/graph/obstacleRouting.ts` | 新建 | A* 避障路由器核心实现 |
| `src/components/editor/nodes/graph/GraphCanvas.tsx` | 修改 | 注册并使用新路由样式 |
| `src/components/editor/nodes/graph/graphModel.ts` | 修改 | 替换 2 处 `orthogonalEdgeStyle` |
| `src/components/editor/nodes/graph/graphCanvasStyle.ts` | 修改 | 替换 1 处 `orthogonalEdgeStyle` |
