# AI 图表生成：图表类型感知优化

## 问题根因

AI 生成时序图质量差，根因有三层：

1. **Prompt 只面向流程图** -- `buildSystemPrompt()` 只有一个 flowchart 示例 + flowchart 专用规则，LLM 不知道怎么构造时序图
2. **自动布局只支持流程图** -- `autoLayoutGraph()` 做 BFS 自上而下分层布局，对时序图（需要水平生命线 + 垂直消息流）完全不适用
3. **没有类型指导** -- schema 里列了 `lifeline`/`activation` 等形状，但没有告诉 LLM 怎么用它们组织时序图

## 核心思路

**让 AI 决定输出什么图**，而不是前端检测关键词。

- 把所有图表类型的 schema 说明 + 示例都放进 prompt，让 LLM 根据用户描述自己选择合适的图表类型和节点形状
- 布局器根据 **AI 输出的节点形状**（而非用户输入的关键词）来选择布局算法：检测到 `lifeline` -> 时序图布局，否则 -> 流程图布局

## 改动方案

### 1. 统一 Prompt（多类型示例 + 指导）-- `aiGraphPrompt.ts`

改 `buildSystemPrompt()`，把 prompt 从"只有流程图"扩展为"覆盖三种图表类型"：

- 保留通用 schema 不变
- 在 `## Diagram Type Guide` 章节中，分别说明三种图的构造规则：
  - **流程图**：rectangle/rounded/diamond，自上而下
  - **时序图**：用 `lifeline` 表示参与者（水平排列），消息用 `straight` edge 连接生命线，返回消息用 `dashed: true`，`activation` 贴在生命线上
  - **用例图**：用 `actor` 表示角色，`ellipse` 表示用例，直线连接
- 在 `## Examples` 章节中，提供流程图示例（现有）+ 时序图示例（新增）
- 规则部分去掉 flowchart 专用建议，改为"根据用户描述选择最合适的图表类型"

### 2. 时序图示例 -- `aiGraphSchema.ts`

新增 `AI_GRAPH_EXAMPLE_SEQUENCE`：3 个 lifeline 节点 + 4 条消息边（含一条 dashed 返回消息），供 prompt 使用。

### 3. 输出驱动的布局选择 -- `aiGraphLayout.ts`

新增 `autoLayoutSequence()` 函数（参照 `sequenceConverter.ts` 已验证的布局逻辑）：

- 筛选出所有 `lifeline` 节点 -> 水平等距排列（间距 150px）
- 根据消息边数量计算生命线高度
- `activation` 节点 -> 贴在对应 lifeline 中心线上，垂直排列
- 边的 routing 强制设为 `straight`

新增分发函数 `autoLayoutByType(nodes, edges)`：
```
if (nodes 中存在 shape === 'lifeline') -> autoLayoutSequence()
else -> autoLayoutGraph()  // 现有 BFS 布局
```

### 4. 生成流程 -- `aiGraphGenerator.ts`

- `buildSystemPrompt()` 不再需要类型参数（统一 prompt）
- 校验后，调用 `autoLayoutByType()` 代替直接调用 `autoLayoutGraph()`
- 由布局器自动根据输出节点形状选择算法

## 文件变更清单

| 文件 | 改动 |
|------|------|
| `src/lib/editor/aiGraph/aiGraphPrompt.ts` | 重写 `buildSystemPrompt()`：加入三种图表类型的指导 + 多类型示例 |
| `src/lib/editor/aiGraph/aiGraphSchema.ts` | 新增 `AI_GRAPH_EXAMPLE_SEQUENCE` |
| `src/lib/editor/aiGraph/aiGraphLayout.ts` | 新增 `autoLayoutSequence()` + `autoLayoutByType()` 分发函数 |
| `src/lib/editor/aiGraph/aiGraphGenerator.ts` | 用 `autoLayoutByType()` 替换 `autoLayoutGraph()` 调用 |

## 不改动

- `AIGraphImportDialog.tsx` -- UI 不变
- `aiGraphValidator.ts` -- 校验逻辑不变
- `customShapes.ts` / `graphTheme.ts` -- 渲染层不变
- Rust 端 -- 不涉及

## 验证方式

1. 输入"画一个用户登录的时序图" -> AI 输出含 lifeline 节点 -> 触发时序图布局 -> 水平生命线 + 垂直消息流
2. 输入"画一个订单处理流程图" -> AI 输出 rectangle/diamond 节点 -> 触发流程图布局（不变）
3. 输入"用户下单后系统怎么处理的" -> AI 自行决定用流程图还是时序图
