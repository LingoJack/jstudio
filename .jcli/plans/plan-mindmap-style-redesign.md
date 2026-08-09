# 思维导图样式改造方案

## 问题分析

当前思维导图 topic 节点的样式与普通圆角矩形完全一致：
- `fillColor: 'none'`（透明背景）
- `strokeColor: '#374151'`（中性灰，与其他形状相同）
- `strokeWidth: 1.5`、`fontSize: 13`（全局统一值）
- 所有 topic 节点（根/分支/叶子）视觉完全相同，没有任何层次感
- 连线也是细线条，与流程图连线无异

结果：根本看不出是思维导图，就是一堆灰色框 + 细线。

## 改造目标

参考 XMind / MindNode 风格，通过**深度分层的配色方案**让思维导图具备清晰的视觉层次：

| 层级 | 浅色模式 | 暗色模式 | 说明 |
|------|----------|----------|------|
| 根节点 (depth 0) | 填充 `#2563EB`(蓝600), 白字, 加粗, 字号15 | 填充 `#3B82F6`(蓝500), 白字, 加粗, 字号15 | 从工具栏拖出的 topic |
| 分支节点 (depth 1) | 填充 `#DBEAFE`(蓝100), 描边 `#3B82F6`(蓝500), 字色 `#1E40AF`(蓝800) | 填充 `#1E3A5F`, 描边 `#60A5FA`, 字色 `#BFDBFE` | Tab 生发的子节点 |
| 叶子节点 (depth 2+) | 填充 `#EFF6FF`(蓝50), 描边 `#93C5FD`(蓝300), 字色 `#374151` | 填充 `#172554`, 描边 `#1D4ED8`, 字色 `#E5E7EB` | 更深层子节点 |

连线：加粗到 2px，颜色跟随主题连线色。

## 改造方案（6 个文件）

### 1. `graphTheme.ts` — 新增思维导图配色常量与样式函数

新增导出：
- `MINDMAP_ROOT_FILL` / `MINDMAP_ROOT_FONT` / `MINDMAP_ROOT_STROKE`（浅/暗两套）
- `MINDMAP_BRANCH_FILL` / `MINDMAP_BRANCH_STROKE` / `MINDMAP_BRANCH_FONT`（浅/暗两套）
- `MINDMAP_LEAF_FILL` / `MINDMAP_LEAF_STROKE` / `MINDMAP_LEAF_FONT`（浅/暗两套）
- `MINDMAP_EDGE_STROKE_WIDTH = 2`
- `mindmapStyleForDepth(depth: number, dark: boolean)` — 返回 `{ fillColor, strokeColor, fontColor, strokeWidth, fontSize, fontStyle }` 对象

### 2. `graphConstants.ts` — `styleForShape('topic')` 改用根节点样式

将 topic 的默认样式从"无填充 + 灰描边"改为根节点配色（蓝色填充 + 白字 + 加粗）。
这同时覆盖工具栏拖出和向后兼容（旧快照无 style 覆盖的 topic 节点）。

### 3. `graphModel.ts` — `nodeShapeToStyle('topic')` 同步修改

与 `styleForShape('topic')` 保持一致，确保快照加载时使用相同的根节点配色作为基础样式。

### 4. `mindmapSpawn.ts` — 按 depth 分配样式

- 新增 `topicDepth(graph, cell)` 函数：沿入边向上数 topic 祖先数量，返回深度值
- `spawnMindmapChild`：计算 `parentDepth = topicDepth(graph, parent)`，新节点使用 `mindmapStyleForDepth(parentDepth + 1, dark)` 的配色
- `spawnMindmapSibling`：读取当前节点的 fillColor/strokeColor/fontColor 并复制到兄弟节点（保持同层同色）

### 5. `dragDraw.ts` — 工具栏拖出 topic 时应用根节点样式

在 `finishDraw` 中，当 `shape === 'topic'` 时，使用 `mindmapStyleForDepth(0, dark)` 构建样式（蓝色填充 + 白字 + 加粗 + 字号15）。

### 6. `graphHelpers.ts` — 思维导图连线加粗

`mindmapEdgeStyle(dark)` 中将 `strokeWidth` 从 `SHAPE_STROKE_WIDTH`(1.5) 改为 `MINDMAP_EDGE_STROKE_WIDTH`(2)。

## 数据流验证

1. **工具栏拖出** → `dragDraw.finishDraw` → `mindmapStyleForDepth(0)` → 根节点蓝色填充
2. **Tab 生发子节点** → `spawnMindmapChild` → `topicDepth(parent) + 1` → 分支/叶子配色
3. **Enter 生发兄弟** → `spawnMindmapSibling` → 复制当前节点配色 → 同层同色
4. **保存快照** → `readSnapshotFromGraph` → fillColor/strokeColor/fontColor 存入 `node.style`
5. **加载快照** → `buildNodeStyle` → `nodeShapeToStyle('topic')` 作为基础（根节点色），`node.style` 覆盖恢复实际配色
6. **旧快照兼容** → 无 style 覆盖的 topic 节点 → 使用新的根节点默认色（蓝填充白字），至少不再是灰色框

## 不影响的部分

- 布局算法（`reflowMindmap`）不变
- 连线路由（`mindmapCurveEdgeStyle`）不变
- 连接点/约束不变
- 其他形状（rectangle/rounded/ellipse 等）不变
- 主题切换机制不变（fillColor 仍通过 `mapFillColor` / `fontColorFor` 处理）
