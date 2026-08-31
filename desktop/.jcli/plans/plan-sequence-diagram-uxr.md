# 时序图手绘体验重设计（UXR）

## 用户痛点

1. **连线点太固定太死板** —— 生命线只在中心虚线上每 60px 一个离散锚点吸附，用户想在"任意 Y"起线做不到
2. **activation 上锚点少体验差** —— 16px 宽的窄矩形只有零星几个锚点

## 根因

当前设计沿用 draw.io/maxGraph 的"离散锚点吸附"范式，适合流程图但**完全不适合时序图**。时序图的语义是**"消息发生在某个时刻"**，时间轴是连续的，任意 Y 都是合法的消息发出点。

## 用户已确认的决策

- **activation 自动生成**：从工具栏移除 activation 按钮；用户从生命线 A 拖消息到生命线 B 松开后，自动在 B 上生成一个 activation
- **消息线强制水平**：拖线时 Y 自动锁定为起点 Y，符合 UML 规范
- **视觉反馈**：鼠标悬停 lifeline 时显示一个跟随鼠标的圆点（"这里可以起线"）
- **本轮范围**：P1 + P2 一次做完（手绘 + 自动 activation）

## 具体实现方案

### 1. 移除离散锚点：`GraphCanvas.tsx` 的 `getAllConnectionConstraints`

- **lifeline**：不再生成沿中心线每 60px 一个的 `ConnectionConstraint` 列表；只保留头部的顶部中点（供外部节点如 actor 连过来），生命线段返回**空数组**，让 `LifelinePerimeter` 接管所有 Y 值的投影
- **activation**：自动生成场景下用户不再手画，仍保留 `activation` shape 的 perimeter 用于消息进出。但只返回四角 + 四边中点，去掉密集锚点。悬停体验改用 activation 自身的 hover 高亮（左右边整条变亮）

### 2. 悬停跟随圆点：新增 `SequenceHoverIndicator`

- 独立 SVG 覆盖层，追踪鼠标位置
- 鼠标进入 lifeline 段（Y > headHeight）时显示一个 6px 深蓝色圆点，圆心 X = 生命线中心 X，圆心 Y = 鼠标 Y
- 鼠标离开或按下时隐藏
- 视觉：`.jgraph-lifeline-hover-dot`（可主题化）

用 maxGraph 的 mouse listener 或直接 DOM 事件实现，不改内核。

### 3. 消息水平约束：hook `ConnectionHandler.livePreview` + `mouseMove`

在 `useEffect` 初始化 ConnectionHandler 后：
- 拦截 `mouseMove` 事件：若源节点 shape 是 `lifeline` 或 `umlActivation`，把当前预览的目标 Y 强制改为源起点 Y
- `drawPreview` 里预览线是直线不是折线
- `mouseUp` 松开时，若目标是 lifeline/activation，把目标 Y 也锁定为源 Y

### 4. 松开后自动生成 activation：`sequenceInteraction.ts`（新文件）

监听 `ConnectionHandler.CONNECT` 事件（连线成功创建后触发）：
- 如果 source 是 `lifeline` 且 target 也是 `lifeline`：
  - 计算消息 Y（起点 Y）
  - 在 target lifeline 上生成一个 activation 节点：
    - x = target lifeline 中心 x - 8
    - y = 消息 Y
    - w = 16, h = 40（默认处理时长）
    - shape = `activation`
  - 修改这条 edge 的 target 端点：从 lifeline 改为新生成的 activation
- 如果 source 是 activation 且 target 是 lifeline：说明是"回消息"，同样生成新 activation 或不生成（按语义）
- 所有操作放进同一个 `batchUpdate` 里，确保 undo 一次回滚

### 5. 消息 Y 智能吸附：避免多条消息叠在一起

在 `mouseDown` 起线时：
- 收集当前 lifeline 上已有的所有消息 edge 的 Y 坐标
- 若鼠标 Y 距离已有消息 Y < 20px，把起点 Y 吸附到"下一个空闲 Y"（即最后一条消息 Y + 40）
- 或者更简单：起点 Y 就是鼠标 Y，但生成消息后再做一次 Y 递增校验（后置处理更好，交互过程不干扰用户）

### 6. 工具栏：移除 activation 按钮

`GraphCanvas.tsx` 的 `shapeTools` 移除 `activation` 项。

在 `graphCanvasStyle.ts` 保留 activation 的 style 定义（AI 生成时仍会用到），只是不在工具栏出现。

## 文件变更清单

| 文件 | 改动 |
|------|------|
| `GraphCanvas.tsx` | ①修改 `getAllConnectionConstraints`：lifeline 段返回空数组，activation 简化到四角+四边中点；②工具栏 shapeTools 移除 activation；③在 ConnectionHandler 初始化处 hook livePreview 加水平约束；④监听 CONNECT 事件调用 sequenceInteraction |
| `customShapes.ts` | 无逻辑改动，但 `LifelinePerimeter` 保持任意 Y 投影不变（当前已正确） |
| **新增** `sequenceInteraction.ts` | `enforceHorizontalMessage(handler)` + `attachAutoActivation(graph)` + `SequenceHoverIndicator` 类 |
| `graphSnapshot.ts` | 无改动（保持数据模型兼容） |
| `vscode-theme.css` | 新增 `.jgraph-lifeline-hover-dot` 样式 |

## 兼容性

- **旧数据完全兼容**：不改数据模型，之前保存的 lifeline+activation+message edge 仍能正常渲染
- **AI 生成路径不受影响**：AI 输出的 activation 节点仍能正确渲染 + 布局
- **手动画 activation 能力保留**：用户可以从 AI 生成结果里保留、编辑 activation；只是新画时不再有工具栏入口

## 验证方式

1. **场景 A**：画两条 lifeline -> 从 A 的 Y=150 拖到 B 的 Y=150 -> 松开 -> 应看到：一条水平消息 + B 上出现小矩形 activation
2. **场景 B**：拖线时鼠标故意向下抖 -> 预览线始终水平（Y 锁定）
3. **场景 C**：鼠标悬停 lifeline 中心虚线 -> 应看到跟随鼠标的深蓝色小圆点
4. **场景 D**：连续拖 3 条消息 -> 都应正确水平排列，Y 递增不重叠
5. **场景 E**：撤销一次 -> 消息和自动 activation 一起消失（原子性）
6. **场景 F**：旧的 AI 生成结果重新打开 -> 显示不变
