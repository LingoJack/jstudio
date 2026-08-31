# 修复 Mermaid 时序图导入

## 问题根因

`sequenceConverter.ts` 有三个核心 bug：

### 1. 消息类型映射完全错误
当前代码使用 `-1, 0, 1, 2` 映射箭头样式，但 mermaid v11 的 LINETYPE 常量是：
- `0` = SOLID（实线无箭头）
- `1` = DOTTED（虚线无箭头）
- `5` = SOLID_OPEN（实线开放箭头 `->`）
- `6` = DOTTED_OPEN（虚线开放箭头 `-->`）
- `24` = SOLID_POINT（实线填充箭头 `->>`）
- `25` = DOTTED_POINT（虚线填充箭头 `-->>`）
- `33` = BIDIRECTIONAL_SOLID / `34` = BIDIRECTIONAL_DOTTED

用户的 `->>` 映射到 type=24，当前代码 `switch` 没有这个 case，走到 `default` 虽然返回了 `classic` 箭头，但 `-->>` 映射到 type=25 也会走到 default 返回实线，**虚线丢失**。

### 2. 缺少 exit/entry 连接约束（线穿过图形的根因）
当前创建的 edge 没有设置 `exit`/`entry` 字段。`graphModel.ts` 的 `buildEdgeStyle` 在没有 `exit`/`entry` 时不会写入 `exitX/exitY/entryX/entryY`，maxGraph 退回 perimeter 模式计算端点，把连线吸到 lifeline 矩形的中点，导致水平线穿过头部矩形。

对照 `sequenceInteraction.ts` 中 "autoActivation disabled" 路径（L454-483），正确做法是：
- `exit: { x: 0.5, y: relativeY }` — 源生命线中心线上的相对 Y
- `entry: { x: 0.5, y: relativeY }` — 目标生命线中心线上的相对 Y（同一绝对 Y，保证水平）
- `exitAbsY` / `entryAbsY` — 绝对 Y 值，供 resize sync 使用

### 3. 未过滤非消息条目
`getMessages()` 返回所有信号，包括 note（type=2）、loop/alt/opt 标记（type=10-31）等。这些条目的 `from`/`to` 可能为 undefined，当前代码只检查 `fromNodeId`/`toNodeId` 是否存在，但没有跳过 note 和控制流标记，可能导致 `msgIdx` 计数偏移、消息间距不均匀。

## 修改方案

**仅修改 `src/lib/editor/mermaid/sequenceConverter.ts`**

### A. 重写 `getMessageStyle` — 按 LINETYPE 正确映射

```
SOLID_POINT(24) / DOTTED_POINT(25) → filled arrow ('classic')
SOLID_OPEN(5) / DOTTED_OPEN(6)     → open arrow ('openThin')
SOLID_CROSS(3) / DOTTED_CROSS(4)   → cross arrow ('classic')
SOLID(0) / DOTTED(1)               → no arrow ('none')
BIDIRECTIONAL(33/34)               → 'classic' + startArrow='classic'
```

线型：`0, 3, 5, 24, 33` → solid；`1, 4, 6, 25, 34` → dashed

### B. 过滤消息列表

只保留 `from` 和 `to` 都为非空字符串、且 type 不是 note(2)/loop(10-11)/alt(12-14)/opt(15-16)/active(17-18)/par(19-21)/rect(22-23)/autonumber(26)/critical(27-29)/break(30-31) 的条目。

简单实现：只保留 type ∈ {0,1,3,4,5,6,24,25,33,34} 的消息。

### C. 设置 exit/entry 约束

对每条消息，计算 `msgY`（绝对 Y），然后：
- `exit: { x: 0.5, y: (msgY - srcLifeline.y) / srcLifeline.h }`
- `entry: { x: 0.5, y: (msgY - tgtLifeline.y) / tgtLifeline.h }`
- `exitAbsY: msgY`
- `entryAbsY: msgY`

### D. 处理自环消息（from === to）

添加 waypoints 形成右侧 U 形回路（参照 sequenceInteraction A2 场景）：
```
waypoints: [
  { x: centerX + 30, y: msgY },
  { x: centerX + 30, y: msgY }
]
```

### E. 处理 message 字段为对象的情况

mermaid v11 中 `message` 可能是 `{ start, step, visible }`（autonumber），需要转为字符串或空字符串。

## 不做的事

- **不创建 activation 节点** — 保持简单，参照 "autoActivation disabled" 路径。如果后续需要可以再加。
- **不处理 note** — mermaid 的 note 语义复杂（left/right/over），先跳过。
- **不处理 loop/alt/opt 等控制流块** — 这些是复合结构，超出当前范围。
