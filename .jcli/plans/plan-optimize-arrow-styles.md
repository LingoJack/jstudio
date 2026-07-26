# 优化箭头样式（arrow style unification）

## 一、发现的问题

### 1. `buildEdgeStyle` 丢失 dashed 属性 ⚠️（严重 bug）

`src/components/editor/nodes/graph/graphModel.ts:125-140`：

```ts
function buildEdgeStyle(edge: GraphEdge, dark: boolean): CellStyle {
  const style: CellStyle = { /* ... */ };
  const s = edge.style;
  if (s) {
    if (s.stroke !== undefined) style.strokeColor = s.stroke;
    if (s.strokeWidth !== undefined) style.strokeWidth = s.strokeWidth;
    // ❌ 缺 dashed 处理
  }
  return style;
}
```

**影响**：
- Mermaid 导入的时序图"返回消息"（`-->` `--x`）
- Note 与 lifeline 的关联虚线
- AI 生成的所有 `style: { dashed: true }` 边

**全部实际渲染为实线**——因为 dashed 从未被写入 CellStyle。

### 2. `edge-dashed` 预设本身没写 dashed ⚠️

`graphModel.ts:80-81`：
```ts
case 'edge-dashed':
  return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: 'classic', endSize: 8 };
                                                                              ↑ 缺 dashed:true
```

用户从工具栏点"虚线箭头"预设 → 实际是实线，与图标不符。

### 3. Mermaid 消息类型映射编码错误 ⚠️

`sequenceConverter.ts` 里我按 -1/0/1/2 编码，但 mermaid 实际编码是：
- `SOLID = 0`  →  `->`
- `DOTTED = 1` → `-->`
- `SOLID_CROSS = 3` → `-x`
- `DOTTED_CROSS = 4` → `--x`
- `SOLID_OPEN = 5` → `->>`
- `DOTTED_OPEN = 6` → `-->>`
- `SOLID_POINT = 24` / `DOTTED_POINT = 25` → 圆点箭头

现在导入结果：
- `->` (type=0) 命中"实线无箭头"分支 ❌ 应为实线 classic
- `-->` (type=1) 命中"虚线箭头"分支 ✓ 巧合正确
- `->>` (type=5) 走 default → 实线 classic ✓
- `-->>` (type=6) 走 default → 实线 classic ❌ 应为虚线 open
- `-x` `--x` 应表达"取消/丢失"，用 X 十字或纯"无箭头"
- `-)` `--)` 应表达"异步"，用开放箭头

### 4. 箭头大小分散、值不一致

| 位置 | endSize | 用途 |
|---|---|---|
| `graphModel.buildEdgeStyle` | **未设** → maxGraph 默认 30 ⚠️ | 快照灌入时的所有 edge |
| `graphModel.nodeShapeToStyle` edge-* 预设 | 8 | 工具栏拖出预设连线 |
| `GraphCanvas.createEdgeState` 预览 | 8 | 拉线预览 |
| `GraphCanvas.edgeDefault` | **未设** → 默认 30 ⚠️ | 手绘落线 |

**三条路径产出 4 种箭头大小**，最严重的是快照灌入完全没设，用了 maxGraph 默认 30——一根巨大的三角形箭头。这大概率是用户觉得"箭头怪"的直接原因。

### 5. 返回消息用 classic（实心三角）不符合 UML 惯例

UML 时序图规范里：
- 同步调用 `->` / `->>`：**实心**箭头（filled arrow head）
- 返回消息 `-->` / `-->>`：**开放/线**箭头（open arrow head，即 V 形）
- 异步 `->>` 也可选开放箭头

我们所有 dashed 边都用了 `endArrow: 'classic'`（实心），视觉上返回消息和调用消息只差一个虚实 → 应把 dashed 边默认改为 `openThin` 或 `open`，让视觉一目了然。

### 6. `startArrow` 未处理

`buildEdgeStyle` 里从 `edge.startArrow ?? 'none'` 取，但 `edge.style` 分支不允许覆盖。加上 UML 里同步 vs 异步双向消息时会用到，先规范化。

### 7. `endFill` 未处理

maxGraph 的 `endArrow: 'classic'` 可结合 `endFill: 1/0` 控制实心/空心。当前完全没用，导致想画"实心箭头 / 空心三角"无法表达。**优先度低**，先不管。

---

## 二、优化目标

### A. 数据 → 样式的完整字段透传

`buildEdgeStyle` 必须把 `edge.style` 里的 **dashed / endArrow / startArrow / endFill / endSize / arrowSize** 都透传到 CellStyle。再补上 `edge.endArrow` / `edge.startArrow` 从顶层字段读取（`endArrow` 已读，`startArrow` 也已读）。

### B. 箭头尺寸单一常量

新增一处 `ARROW_END_SIZE = 8` 常量，四处（buildEdgeStyle / nodeShapeToStyle edge-* / createEdgeState / edgeDefault）全部引用。位置：`graphTheme.ts`（现有 `SHAPE_STROKE_WIDTH` 常量所在）。

### C. `edge-dashed` 预设补 dashed:true

### D. Mermaid 类型映射修正

按 mermaid 真实 LINETYPE 编码写全表。返回消息（1, 6, 25）→ `openThin` + dashed；同步调用（0, 5）→ `classic`；异步/丢失消息（3, 4）→ `openThin` + 可选 dashed；点消息（24, 25）→ `oval` + 可选 dashed。

### E. 返回消息统一为 open 箭头（UML 惯例）

`sequenceLayout` 里 `dashed: true` 的消息，默认 `endArrow` 改为 `openThin`（如未显式指定）。这个变更同时影响 Mermaid 导入、AI 生成、AI schema 示例。

### F. `sequenceInteraction.ts:215` 里 hardcoded `endArrow: 'classic'` 保持不变（那里是消息 edge 的默认箭头，合适）。

---

## 三、变更清单

### 文件 1：`src/components/editor/nodes/graph/graphTheme.ts`
新增导出：
```ts
/** 边默认箭头尺寸（maxGraph 默认 30 太大，8 更贴近 draw.io 精致风格）。 */
export const ARROW_END_SIZE = 8;
```

### 文件 2：`src/components/editor/nodes/graph/graphModel.ts`

**修改 `buildEdgeStyle`**，从 `edge.style` 透传更多字段并补 endSize：
```ts
function buildEdgeStyle(edge: GraphEdge, dark: boolean): CellStyle {
  const style: CellStyle = {
    edgeStyle: edge.routing === 'straight' ? undefined : 'orthogonalEdgeStyle',
    rounded: edge.routing !== 'straight',
    endArrow: edge.endArrow ?? 'classic',
    startArrow: edge.startArrow ?? 'none',
    endSize: ARROW_END_SIZE,
    strokeColor: getEdgeColor(dark),
    strokeWidth: SHAPE_STROKE_WIDTH,
  };
  const s = edge.style;
  if (s) {
    if (s.stroke !== undefined) style.strokeColor = s.stroke;
    if (s.strokeWidth !== undefined) style.strokeWidth = s.strokeWidth;
    if (s.dashed !== undefined) style.dashed = s.dashed;  // ← 修复丢失
  }
  return style;
}
```

**修改 `nodeShapeToStyle` 的 edge 预设**，全部引用 ARROW_END_SIZE，`edge-dashed` 补 dashed:true 并改用 openThin：
```ts
case 'edge-line':
  return { strokeColor: pal.stroke, strokeWidth: SHAPE_STROKE_WIDTH, endArrow: 'classic', endSize: ARROW_END_SIZE };
case 'edge-ortho':
  return { strokeColor: pal.stroke, strokeWidth: SHAPE_STROKE_WIDTH, edgeStyle: 'orthogonalEdgeStyle', endArrow: 'classic', endSize: ARROW_END_SIZE };
case 'edge-dashed':
  // 虚线 + 开放箭头，符合 UML 返回消息/异步响应惯例
  return { strokeColor: pal.stroke, strokeWidth: SHAPE_STROKE_WIDTH, endArrow: 'openThin', endSize: ARROW_END_SIZE, dashed: true };
case 'edge-no-arrow':
  return { strokeColor: pal.stroke, strokeWidth: SHAPE_STROKE_WIDTH, endArrow: 'none' };
```

**改进 `readSnapshotFromGraph` 反推 edge**（`styleToGraphEdgeStyle` 附近）：确保能读出 dashed / endArrow / startArrow 存回快照，保证往返一致。

### 文件 3：`src/components/editor/nodes/graph/GraphCanvas.tsx`

- `createEdgeState`：`endSize: ARROW_END_SIZE`（保持数值一致，仅换常量）
- `edgeDefault`：添加 `edgeDefault.endSize = ARROW_END_SIZE`（此前未设，会用 30 巨箭头）

### 文件 4：`src/lib/editor/mermaid/sequenceConverter.ts`

**重写 `getMessageStyle`**，按 mermaid 真实 LINETYPE 编码：

```ts
/**
 * Mermaid LINETYPE 编码 → 我们的边样式。
 *
 * mermaid/dist/mermaid.js 内部常量：
 *   SOLID       = 0    ->     实线同步调用（实心箭头）
 *   DOTTED      = 1    -->    虚线返回响应（开放箭头）
 *   SOLID_CROSS = 3    -x     实线终止消息（X 十字）—— 简化为无箭头实线
 *   DOTTED_CROSS= 4    --x    虚线终止消息               —— 简化为无箭头虚线
 *   SOLID_OPEN  = 5    ->>    实线异步调用（开放箭头）
 *   DOTTED_OPEN = 6    -->>   虚线异步响应（开放箭头）
 *   SOLID_POINT = 24   -)     实线点箭头（oval）
 *   DOTTED_POINT= 25   --)    虚线点箭头（oval）
 */
function getMessageStyle(type: number | undefined): {
  dashed: boolean;
  endArrow: string;
} {
  switch (type) {
    case 0:  return { dashed: false, endArrow: 'classic' };
    case 1:  return { dashed: true,  endArrow: 'openThin' };
    case 3:  return { dashed: false, endArrow: 'none' };
    case 4:  return { dashed: true,  endArrow: 'none' };
    case 5:  return { dashed: false, endArrow: 'openThin' };
    case 6:  return { dashed: true,  endArrow: 'openThin' };
    case 24: return { dashed: false, endArrow: 'oval' };
    case 25: return { dashed: true,  endArrow: 'oval' };
    default: return { dashed: false, endArrow: 'classic' };
  }
}
```

### 文件 5：`src/lib/editor/aiGraph/aiGraphLayout.ts`

`autoLayoutSequence` 里从 AI edge 提取 SeqMessage 时，如果 `dashed` 但未指定 endArrow，把 endArrow 默认设为 `openThin`（现有代码只 pass `e.endArrow` 直接透传，dashed 边就会用 classic）。

或者：**在 `sequenceLayout.ts` 里统一处理**——`layoutSequence` 生成 edge 时，若 msg.dashed 且未指定 endArrow → 用 openThin。这样三条路径都自动生效，无需各自加。**推荐这个方案**。

### 文件 6：`src/lib/editor/sequence/sequenceLayout.ts`

修改 edge 组装逻辑：
```ts
const defaultEndArrow = msg.dashed ? 'openThin' : 'classic';
const edge: GraphEdge = {
  id: prefix + msg.id,
  source: fromGeo.id,
  target: edgeTargetId,
  label: msg.label ?? '',
  routing: 'straight',
  endArrow: msg.endArrow ?? defaultEndArrow,
};
```

### 文件 7：`src/lib/editor/aiGraph/aiGraphSchema.ts`

示例里 dashed 返回消息不必显式写 `endArrow`（由 sequenceLayout 自动决定 openThin）。可保持现状。仅在 `nodes[].shape` 描述里补充一句说明 "dashed 消息会自动使用 open arrow head"，让 LLM 少想。

### 文件 8：`src/components/editor/nodes/graph/ShapeGlyph.tsx`

`edge-dashed` 图标里箭头改为**开放 V 形**（不再是实心三角），与 openThin 一致：
```tsx
<path d="M12 8 L10 6 M12 8 L10 10" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" fill="none" />
```

---

## 四、验证方式

1. `npx tsc --noEmit` 通过
2. 视觉验证：
   - 新建时序图，画一条 lifeline → lifeline 消息，箭头大小≈8 且实心
   - 画 dashed 边（AI/Mermaid 生成的返回消息）：视觉为虚线 + V 形开放箭头
   - 从工具栏拖 "edge-dashed" 预设：视觉为虚线 + V 形开放箭头
   - Mermaid 导入 `sequenceDiagram\nA->>B: sync\nB-->>A: return` → sync 实线实心箭头，return 虚线 V 箭头
3. 快照往返：保存 → 打开，箭头样式（dashed / endArrow / endSize）保持
