# 统一时序图 / 活动块 / 拉线 / Actor / Service 一套逻辑

## 一、当前的多套重复逻辑（已确认）

### 1. 布局常量在 4 个文件里各自定义（漂移）

| 常量 | 位置 A | 位置 B | 位置 C | 位置 D | 冲突 |
|---|---|---|---|---|---|
| activation 尺寸 | `graphCanvasStyle.DEFAULT_SIZE.activation = 16×60` | `sequenceInteraction.ts ACTIVATION_W/H = 16/40` | `sequenceConverter.ACTIVATION_WIDTH/DEFAULT_HEIGHT = 16/40` | `aiGraphLayout.SEQ_ACTIVATION_W/H = 16/40` | **60 vs 40 ⚠️** |
| lifeline 宽 | `DEFAULT_SIZE.lifeline.w = 100` | — | `LIFELINE_WIDTH = 100` | `SEQ_PARTICIPANT_W = 100` | 一致但重复 |
| lifeline 默认高 | `DEFAULT_SIZE.lifeline.h = 150` | — | `LIFELINE_DEFAULT_HEIGHT = 200` | 动态计算，min=200 | **150 vs 200 ⚠️** |
| head 高 | — | `import HEAD_HEIGHT` from customShapes | `import HEAD_HEIGHT` from customShapes | **`SEQ_HEAD_HEIGHT = 50` 硬编码** ⚠️ | AI 路径未引用单一来源 |
| 参与者水平间距 | — | — | `PARTICIPANT_SPACING = 150` | `SEQ_PARTICIPANT_SPACING = 150` | 一致但重复 |
| 消息垂直间距 | — | — | `MESSAGE_SPACING = 40` | `SEQ_MESSAGE_SPACING = 40` | 一致但重复 |
| 消息起始 Y | — | — | `MESSAGE_START_Y = HEAD_HEIGHT + 20` | `SEQ_MESSAGE_START_Y = SEQ_HEAD_HEIGHT + 20` | 一致但重复 |
| 画布边距 | — | — | `50` (魔法数) | `SEQ_MARGIN = 50` | 一致但重复 |
| note 尺寸 | `DEFAULT_SIZE.note = 100×60` | — | `NOTE_WIDTH/HEIGHT = 100/60` | — | 一致但重复 |

### 2. 消息 → activation 的三条独立路径（数据形态不兼容）

| 路径 | 行为 | 消息 edge 的 target |
|---|---|---|
| 手绘（`attachAutoActivation`） | 消息到 lifeline 时**自动生成 activation** 并把 target 改指到 activation | activation |
| Mermaid 导入（`sequenceConverter`） | **不生成 activation**（activationStates Map 定义了但从未 mutate → 死代码） | lifeline |
| AI 生成（`aiGraphLayout.autoLayoutSequence`） | activation 由 LLM 决定；通过额外的 `n2→a1` 边推断 lifeline 归属 | lifeline（activation 由关联边引用） |

→ 一份 Mermaid 导入的图，用户在里面新拉一条消息，突然出现 activation → 图变成"两种规范混合"。

### 3. Actor 语义漂移（3 种含义共存）

| 位置 | 语义 |
|---|---|
| `GraphNodeShape.actor` / `umlActor` shape | 用例图小人 |
| `sequenceInteraction.isActor` + `attachActorSourceBlock` | 把 umlActor 当"时序图角色"处理（禁止作消息 source） |
| Mermaid `SequenceActor` (`actor Foo` / `participant Foo`) | **都转成 `lifeline`**（不生成 umlActor） |
| `aiGraphSchema.VALID_NODE_SHAPES.actor` | 描述为"use-case actor"，示例中未用于时序图 |

### 4. 消息水平化机制三套

- 手绘：`attachHorizontalMessageConstraint` **运行时钩子**锁 Y
- AI：**静态 waypoints** `[{srcX,msgY},{dstX,msgY}]`
- Mermaid：**依赖 `lifelinePerimeter`** 投影 → 同对 lifeline 间的多条消息会叠在同一水平线上

### 5. umlActor 三处口径不一致

- `getAllConnectionConstraints`：`umlActor` 与 `lifeline` 共用密集锚点分支
- `attachLifelineHoverDot`：**只处理 `lifeline`**，`umlActor` 无 hover 反馈
- `attachActorSourceBlock`：`umlActor` **禁止作 source**
→ 有密集锚点、但不显示 hover、又不能起线，功能割裂

### 6. shape → CellStyle 映射也存在两套 ⚠️（新发现）

`graphCanvasStyle.styleForShape` 与 `graphModel.nodeShapeToStyle` 都定义了 shape 到 maxGraph 样式的映射，且**逻辑分歧**：

| shape | `graphCanvasStyle` | `graphModel` |
|---|---|---|
| `note` | `shape: 'note'`（自定义 NoteShape，画折角） | `shape: 'rectangle' rounded arcSize:5`（圆角矩形冒充折角） |
| `activation` | `shape: 'umlActivation' perimeter: 'activationPerimeter'` | 同上 ✓ |
| `styleToNodeShape` 反推 | — | 判 `strokeWidth===1 → activation`（**过时逻辑**，activation 现在是 umlActivation shape） |

`graphCanvasStyle.styleForShape` 只在**手绘工具栏落点**时用一次，`graphModel.nodeShapeToStyle` 才是**读写快照的主路径**。这意味着：note 在快照持久化后再打开会变成圆角矩形，而不是折角框！

### 7. 其他死代码

- `sequenceConverter.activationStates` Map：定义并初始化，但**从未被 mutate/读取** → 完全死代码。
- `graphModel.styleToNodeShape`：`if (style.strokeWidth === 1) return 'activation'` 已被 umlActivation 自定义 shape 覆盖，永不命中。

---

## 二、目标：一套逻辑

**核心原则**：时序图的领域概念（Actor/Service = lifeline、活动块 = activation、消息 = edge）只有一套模型；所有生成路径（手绘 / Mermaid 导入 / AI 生成）都产出**同一份数据形态**，交给同一份渲染管线。

### 数据形态统一

- **参与者**（无论 Mermaid 的 `actor` / `participant`，还是 AI 的 lifeline）→ 一律 `shape: 'lifeline'`
- **活动块**（消息在 lifeline 上的执行时段）→ `shape: 'activation'`
- **消息** → edge，`target` **始终指向 activation**（如果 target lifeline 应该显示 activation）；无 activation 的场景（如 note 关联线、自消息可选）target 才是 lifeline 本身
- **消息水平化** → 一律通过 `waypoints`（静态数据）保存 msgY，运行时钩子 `attachHorizontalMessageConstraint` 仅用于"手绘拖线时的实时预览"，落点后立刻写 waypoints 固化

### Actor 概念清晰化

- `umlActor` 只用于**用例图**，不参与时序图任何交互逻辑
- 时序图中"外部角色"仍用 `lifeline`（可通过 label icon 或未来加子形状表达）
- 删除 `attachActorSourceBlock` 中"专门为时序图禁止 umlActor"的分支——因为时序图里根本不该出现 umlActor

### 常量单一来源

新建 `src/lib/editor/sequence/sequenceConstants.ts`，作为时序图**唯一**的常量真源。其它文件全部从这里 import。

---

## 三、目标文件结构

```
src/lib/editor/sequence/                       ← 新增：时序图领域纯逻辑（无 React、无 maxGraph）
  ├── sequenceConstants.ts                     ← 唯一的布局常量
  ├── sequenceModel.ts                         ← 领域类型：Participant / Message / Activation
  ├── sequenceLayout.ts                        ← 从 (participants, messages) 生成完整 GraphSnapshot 片段
  │                                              包括：lifeline 节点、activation 节点、消息 edge (含 waypoints)、
  │                                              以及消息 edge.target 指向 activation 的绑定
  └── index.ts                                 ← re-export

src/components/editor/nodes/graph/
  ├── customShapes.ts                          ← 只保留 shape 绘制 + perimeter，
  │                                              HEAD_HEIGHT 改为从 sequenceConstants re-export
  ├── graphCanvasStyle.ts                      ← DEFAULT_SIZE 引用 sequenceConstants；
  │                                              删除本文件里的 styleForShape（合并到 graphModel）
  ├── graphModel.ts                            ← 成为 shape ↔ CellStyle 的**唯一**映射源；
  │                                              修正 note → 'note' shape；
  │                                              删除 styleToNodeShape 里的过时 activation 判定
  ├── sequenceInteraction.ts                   ← 从 sequenceConstants 引用 ACTIVATION_W/H；
  │                                              自动 activation 通过调用 sequenceLayout helpers；
  │                                              删除 attachActorSourceBlock（改由 shape 层面限制）
  └── ... (其他不变)

src/lib/editor/mermaid/sequenceConverter.ts    ← 改造：调用 sequenceLayout 生成节点边；
                                                  生成 activation；消息 target 指向 activation；
                                                  写 waypoints
src/lib/editor/aiGraph/aiGraphLayout.ts        ← 改造：autoLayoutSequence 复用 sequenceLayout；
                                                  常量全从 sequenceConstants
src/lib/editor/aiGraph/aiGraphSchema.ts        ← 修正 shape 描述：明确 actor 仅用于用例图；
                                                  时序图示例改为 lifeline + activation 且 message.target
                                                  指向 activation
```

---

## 四、实施步骤（按依赖顺序）

### Step 1：抽取时序图常量与领域模型
**新建** `src/lib/editor/sequence/sequenceConstants.ts`：
```ts
export const HEAD_HEIGHT = 50;              // lifeline 头部高
export const LIFELINE_WIDTH = 100;
export const LIFELINE_DEFAULT_HEIGHT = 200;
export const PARTICIPANT_SPACING = 150;
export const MESSAGE_SPACING = 40;
export const MESSAGE_START_Y = HEAD_HEIGHT + 20;
export const ACTIVATION_WIDTH = 16;
export const ACTIVATION_HEIGHT = 40;         // 统一为 40（原 DEFAULT_SIZE 的 60 是错误值）
export const NOTE_WIDTH = 100;
export const NOTE_HEIGHT = 60;
export const CANVAS_MARGIN = 50;
```

**新建** `src/lib/editor/sequence/sequenceModel.ts`：
```ts
export interface Participant { id: string; label: string; }
export interface SeqMessage {
  id: string;
  fromParticipantId: string;
  toParticipantId: string;
  label?: string;
  dashed?: boolean;
  endArrow?: string;   // 'classic' | 'none'
  isReturn?: boolean;  // 语义标记，可选（用于将来还消息不生成 activation 等策略）
}
```

### Step 2：抽取时序图布局
**新建** `src/lib/editor/sequence/sequenceLayout.ts`，导出：

```ts
export interface SequenceLayoutOptions {
  /** 是否为每条入站消息在 target 生成一个 activation。默认 true。 */
  autoActivation?: boolean;
}

export interface SequenceLayoutResult {
  nodes: GraphNode[];  // lifeline + activation
  edges: GraphEdge[];  // messages（含 waypoints，若 autoActivation，target 指向 activation）
  activationByMessage: Map<string, string>; // msgId -> activationNodeId（可选，暴露给调用方）
}

export function layoutSequence(
  participants: Participant[],
  messages: SeqMessage[],
  opts?: SequenceLayoutOptions,
): SequenceLayoutResult;
```

内部实现要点：
- lifeline 高 = max(LIFELINE_DEFAULT_HEIGHT, MESSAGE_START_Y + msgCount * MESSAGE_SPACING + CANVAS_MARGIN)
- 每条消息 msgY = CANVAS_MARGIN + MESSAGE_START_Y + i * MESSAGE_SPACING
- 若 `autoActivation`：为每条消息在 target lifeline 上生成 activation（居中 X = lifeline center，Y 中心 = msgY，w/h = ACTIVATION_W/H），edge.target 改为该 activation id
- 每条消息设 `waypoints: [{srcX, msgY}, {dstX, msgY}]`（若 target 是 activation，dstX = activation 中心 X）
- 自消息（同 lifeline）：4 个 waypoints 画向右的回路（沿用现有 aiGraphLayout 逻辑）
- 消息 edge 的 `routing: 'straight'`；返回消息 `style.dashed = true`

### Step 3：改造 `customShapes.ts`
- `HEAD_HEIGHT` 从 `sequenceConstants` re-export（保持 `import { HEAD_HEIGHT } from './customShapes'` 的外部调用不 break）
- 或者反过来：把 `HEAD_HEIGHT` **移到** sequenceConstants，`customShapes.ts` 只 `import { HEAD_HEIGHT } from '.../sequenceConstants'`，然后再 `export { HEAD_HEIGHT }`（推荐）
- 其余保持不变

### Step 4：合并 shape → CellStyle 映射到单一位置
**目标**：让 `graphModel.nodeShapeToStyle` 成为唯一的 shape → maxGraph style 映射，`graphCanvasStyle.styleForShape` 只作为其别名/薄封装。

- `graphCanvasStyle.ts` 里：删除 `styleForShape` 内部实现，改为 `import { nodeShapeToStyle } from './graphModel'; export function styleForShape(shape, dark) { return nodeShapeToStyle(shape, dark) as any; }`
- `graphModel.nodeShapeToStyle`：修正 note → `{ ...base, shape: 'note' }`，与 customShapes 里注册的 `NoteShape` 对齐
- `graphModel.styleToNodeShape`：删除 `if (style.strokeWidth === 1) return 'activation'` 过时分支；用 `if (shape === 'note') return 'note'` 反推 note
- `DEFAULT_SIZE` 中的 lifeline/activation/note 从 sequenceConstants 引用：
  ```ts
  lifeline: { w: LIFELINE_WIDTH, h: LIFELINE_DEFAULT_HEIGHT },
  activation: { w: ACTIVATION_WIDTH, h: ACTIVATION_HEIGHT },  // 现在是 40（原为错误的 60）
  note: { w: NOTE_WIDTH, h: NOTE_HEIGHT },
  ```

### Step 5：改造 `sequenceInteraction.ts`
- 删除文件顶部的 `ACTIVATION_W / ACTIVATION_H` 私有常量，改从 sequenceConstants import `ACTIVATION_WIDTH / ACTIVATION_HEIGHT`
- 自动 activation 生成逻辑保留，但**内部改为调用一个共享工具**：
  - 在 `sequenceLayout.ts` 里新增 `createActivationOnLifeline(lifelineGeo, msgY): { x, y, w, h }` helper
  - `attachAutoActivation` 调用该 helper，避免重复计算
- **删除 `attachActorSourceBlock`**：时序图中不再使用 umlActor，用例图中 umlActor 应可作为拉线起点（用户可能画"角色关联"关系）
- `attachSequenceInteraction` 减少一个 cleanup，接口保持

### Step 6：改造 `sequenceConverter.ts`（Mermaid 导入）
- 删除所有本地常量（PARTICIPANT_SPACING / LIFELINE_WIDTH / ...）
- 转换流程：
  1. Mermaid 的 `SequenceActor` → `Participant`
  2. Mermaid 的 `SequenceMessage` → `SeqMessage`
  3. 调用 `layoutSequence(participants, messages, { autoActivation: true })` 得到 nodes/edges
  4. 追加 note nodes/edges（沿用现有逻辑，用 sequenceConstants 的 NOTE_WIDTH/HEIGHT）
- **删除死代码** `activationStates` Map

### Step 7：改造 `aiGraphLayout.ts`
- 删除所有 `SEQ_*` 常量，改从 sequenceConstants import
- `autoLayoutSequence`：
  - 如果 AI 输出的 nodes 中**没有** activation → 从 lifeline + messages 提取 `Participant / SeqMessage`，调用 `layoutSequence({ autoActivation: true })`
  - 如果 AI 输出**已有** activation → 保留（认为 AI 显式表达了执行时段），仅重算 lifeline 布局并把 activation 贴到对应 lifeline；消息 edge 若 target 是 lifeline 而该 lifeline 有 activation，则重定向到最近 msgY 的 activation（可选优化，先不做）
- 简单实现：先统一走"忽略 AI 的 activation 输出，重建" —— 这样最简单一致

### Step 8：改造 `aiGraphSchema.ts`
- `VALID_NODE_SHAPES` 中 `actor` 的注释改为 "use-case actor (小人图标)，**仅用于用例图，不用于时序图**"
- schema `nodes.shape.description` 明确 "sequence diagrams: use lifeline (not actor)"
- `AI_GRAPH_EXAMPLE_SEQUENCE`：修改示例，让消息 edge 的 `target` 指向 activation（与统一后的数据形态一致），并明确注释这一约定；同时更新 activation 尺寸为 `w:16, h:40`

### Step 9：清理其它引用
- 全局搜索 `HEAD_HEIGHT` / `ACTIVATION_H` / `ACTIVATION_W` / `LIFELINE_WIDTH` / `PARTICIPANT_SPACING` / `MESSAGE_SPACING`：确认全部改为 import `sequenceConstants`
- `GraphCanvas.tsx` 里 `import { HEAD_HEIGHT } from './customShapes'` 保留（customShapes re-export）

### Step 10：文档与验证
- 在 `sequence/sequenceLayout.ts` 顶部 JSDoc 写明"这是时序图的唯一布局入口，三条路径（手绘 auto-activation / Mermaid 导入 / AI 生成）都调用它"
- 手工验证 3 条路径产出的 snapshot 结构：
  1. 打开时序图 → 手绘拉几条消息 → 保存 → 检查 snapshot：msg.target 指向 activation
  2. Mermaid 导入 3 参与者 4 消息 → 检查 snapshot：4 个 activation、msg.target 指向 activation
  3. AI 生成时序图 → 检查 snapshot：同上格式
  4. 打开保存后的时序图 → 视觉一致

---

## 五、破坏性变更与回滚

- **旧快照兼容**：旧 Mermaid 导入生成的 snapshot（msg.target 指向 lifeline，无 activation）依然可读，只是打开后不会自动补 activation——不影响功能，视觉上就是"没有活动块的时序图"。不做数据迁移。
- **AI schema 变更**：LLM 提示词中 activation 用法变了（示例里 msg.target 指向 activation）。若 LLM 输出的老格式 msg.target 指向 lifeline，`aiGraphLayout` 里 Step 7 的"重建"路径会补上 activation。**向前兼容 OK。**
- **DEFAULT_SIZE.activation.h 从 60 → 40**：此改动仅影响"用户从工具栏手动拖 activation 落点"的初始高度。40 是设计基准值，60 是历史错误值。

---

## 六、风险点

- `sequenceInteraction.attachActorSourceBlock` 目前禁止 umlActor 作 source，删除后如果用户在用例图里被此限制过，会解锁。审计确认无回归后可删。
- Mermaid 导入生成 activation 后，note 的 Y 坐标策略未变（依旧是顶部），若视觉需要跟随对应消息可作为下一轮优化。
- 若 AI 输出的 msg.target 已经是某个 activation id（用户使用了新 schema 后），Step 7 的"忽略 AI activation 重建"策略会丢失 AI 显式的 activation-msg 绑定。折中：`autoLayoutSequence` 检测到 `nodes 里已有 activation 且 edges 里已有 msg.target 指向 activation` 时，进入"尊重"分支，只重算坐标不重建结构。**先做简单版（一律重建），如出现体验问题再增强。**

---

## 七、验收清单

- [ ] 所有布局常量只在 `sequenceConstants.ts` 定义一份
- [ ] `layoutSequence` 是时序图节点/边生成的唯一入口，被 Mermaid 导入、AI 布局、手绘 auto-activation 三方共用
- [ ] 三条路径生成的 snapshot 数据形态一致（msg.target 均指向 activation，均带 waypoints）
- [ ] shape ↔ CellStyle 映射只在 `graphModel.ts` 里定义一份
- [ ] `note` 在打开保存后仍显示为折角框（而非圆角矩形）
- [ ] `DEFAULT_SIZE.activation.h === 40`
- [ ] `sequenceConverter.activationStates` 死代码已删除
- [ ] `graphModel.styleToNodeShape` 里过时的 activation 判定已删除
- [ ] `attachActorSourceBlock` 已删除，umlActor 可作为拉线起点
- [ ] `attachLifelineHoverDot` 只作用于 lifeline，umlActor 不再拥有密集锚点（`getAllConnectionConstraints` 里的 `umlActor` 分支改为四边中点即可，与用例图语义一致）
- [ ] `aiGraphSchema` 描述与示例反映新的数据形态
