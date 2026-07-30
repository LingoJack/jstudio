# 时序图：活动块(ac)端点优化 + 自环支持

## 需求分析

用户需求：
1. **ll 拉线创建 ac 时，ll 的端点落在 ac 的中上部分**（当前是居中）
2. **ac 可以从左右两边拉线出去**（当前已支持）
3. **ac 可以给自己拉线**（自环，当前不支持）
4. **ac 指向 ll 表示返回**（当前已支持，但需调整约束保留策略）
5. **指入和指出的线端点必须不同**（当前返回消息清除了所有约束，可能导致重叠）

## 涉及文件

- `src/components/editor/nodes/graph/sequenceInteraction.ts` — 主要修改
- `src/components/editor/nodes/graph/customShapes.ts` — 无需修改
- `src/components/editor/nodes/graph/GraphCanvas.tsx` — 无需修改

## 实现方案

### 修改 1：`attachHorizontalMessageConstraint` — 自环不锁定 Y

**问题**：当前水平约束对所有时序节点锁定 Y（target Y = source Y）。自环时用户需要从 ac 一个高度拖到另一个高度，锁定 Y 会导致无法创建有意义的自环。

**方案**：在 `updateCurrentState` 和 `updateEdgeState` 中，检测 `handler.currentState?.cell === sourceCell`（目标 = 源 = 自环），跳过 Y 锁定。

```ts
// updateCurrentState 中：
const isSelfLoop = handler.currentState?.cell === sourceCell;
if (!isSelfLoop) {
  point.y = handler.first.y;
}
```

### 修改 2：`attachAutoActivation` — 重构 CONNECT 处理逻辑

将当前的二元判断（`isReturnMessage` / `shouldGenerate`）重构为五种场景：

#### 场景 A：自环（ac → 同一 ac）
- **样式**：实线 + classic 箭头（自调用消息）
- **约束**：保留 exit/entry 约束（用户点击的两个不同点）
- **路径点**：读取 exitX/exitY/entryX/entryY，添加 2 个航点形成矩形环：
  - 若 exit 和 entry 都在右侧（exitX≥0.5 且 entryX≥0.5）：航点在 ac 右侧外
  - 若 exit 和 entry 都在左侧：航点在 ac 左侧外
  - 若分布在两侧：不加航点（直线穿过）
- **几何**：清除 sourcePoint/targetPoint，设置 points 数组

#### 场景 B：ac → ll（返回消息）
- **样式**：虚线 + openThin 箭头（UML 返回消息惯例）
- **约束**：保留 exit 约束（exitX/exitY — 用户在 ac 上的点击位置），仅清除 entry 约束（让 ll perimeter 处理目标投影）
- **端点不同保证**：ll→ac 创建时 entry 固定为 0.25，ac→ll 返回时 exit 在 8px 间距点(0/0.2/0.4/0.6/0.8/1.0)上，0.25 不与任何间距点重合

#### 场景 C：ac → 不同 ac（普通消息）
- **样式**：实线 + classic 箭头
- **约束**：保留双方约束（exit 和 entry 均由用户点击决定）
- **几何**：清除 sourcePoint/targetPoint

#### 场景 D：ll → ll（创建 ac）
- **ac 位置**：`actGeo.y = msgY - ACTIVATION_H * 0.25`（msgY 在 ac 顶部 25% 处 = 中上部分）
- **entry 约束**：根据源 ll 在目标 ll 的左侧还是右侧，设置 `entryX = 0 | 1, entryY = 0.25`
- **exit 约束**：保留（来自 ll 的起点 Y）
- **几何**：清除 sourcePoint/targetPoint

#### 场景 E：ll → ac / 其他
- 不做特殊处理（当前行为）

### 端点不同保证机制

| 线类型 | ac 上的端点 | 位置 |
|--------|------------|------|
| ll → ac（指入） | entryY = 0.25 | 25% from top |
| ac → ll（指出/返回） | exitY ∈ {0, 0.2, 0.4, 0.6, 0.8, 1.0} | 8px 间距点 |
| ac → ac（自环指出） | exitY ∈ {0, 0.2, 0.4, 0.6, 0.8, 1.0} | 8px 间距点 |
| ac → ac（自环指入） | entryY ∈ {0, 0.2, 0.4, 0.6, 0.8, 1.0} | 8px 间距点 |

0.25 不等于任何 8px 间距点（0/0.2/0.4/0.6/0.8/1.0），所以指入(0.25)和指出(间距点)天然不同。
自环时 maxGraph 的 `checkConstraints` 强制 exit ≠ entry，进一步保证。

## 不变的部分

- `customShapes.ts`：`ActivationPerimeter` 已能正确投影到左/右/上/下边缘，无需修改
- `GraphCanvas.tsx`：`getAllConnectionConstraints` 对 `umlActivation` 已提供每 8px 左右边缘密集锚点 + 顶/底中点，无需修改
- `attachLifelineHoverDot`、`attachActorSourceBlock`、`attachActivationImmovable`：不变
