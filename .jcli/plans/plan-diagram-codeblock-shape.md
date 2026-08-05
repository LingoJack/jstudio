# 画板新增「代码块」图形（可展开/折叠）

## 目标

在 GraphCanvas 画板的图形模具中新增一种 `codeblock` 形状，像 CodeBlockView 那样可以**展开/折叠**：展开时显示 header 栏 + 代码内容，折叠后只保留 header 栏（变矮）。

## 设计取舍（重要）

画板基于 maxGraph **矢量绘制 + 单 label（cell.value）**，无法复刻 CodeBlockView 的富代码块能力（语法高亮、HTML/Mermaid 预览、语言下拉、复制按钮、可编辑标题）。因此做合理简化：

| 能力 | CodeBlockView | 画板 codeblock |
|------|---------------|----------------|
| 代码内容编辑 | NodeViewContent（富文本） | cell.value，双击内联编辑（多行 `\n`） |
| 字体 | lowlight 语法高亮 | 等宽字体，无高亮 |
| 折叠/展开 | header 折叠按钮 | header chevron 区域点击切换 |
| 标题 | 可编辑 title 字段 | 固定「代码」标签（cell.value 已被代码占用，无第二文本源） |
| 语言/复制/预览 | 有 | 无（画板图形不适用） |

## 形状外观

```
展开态：                         折叠态：
┌─────────────────────────┐     ┌─────────────────────────┐
│ ▼  代码                  │     │ ▶  代码                  │
├─────────────────────────┤     └─────────────────────────┘
│ const x = 1;            │
│ console.log(x);         │
│ ...                     │
└─────────────────────────┘
```

- 外框：圆角矩形（`arcSize = SHAPE_ARC_SIZE`）。
- header 栏：顶部 `CODEBLOCK_HEADER_H = 26px`，背景用 `strokeColor` 低透明度叠加（深浅主题自适应），底部一条分隔线。
- chevron：header 左侧 26×26 区域内画三角（展开 ▼ / 折叠 ▶）。
- 「代码」标签：chevron 右侧，矢量文字。
- 代码内容：maxGraph 自动渲染的 cell.value，通过 style 定位到 header 下方（`verticalAlign=top, align=left, spacingTop=HEADER_H, spacingLeft=8`），等宽字体，`overflow=hidden`（折叠时裁剪）。

## 数据模型扩展（`graphSnapshot.ts`）

1. `GraphNodeShape` 联合类型追加 `'codeblock'`。
2. `GraphNode` 接口追加：
   - `collapsed?: boolean` — 折叠状态。
   - `expandedH?: number` — 展开时高度（折叠后保留，展开恢复用）。

折叠态下 `geometry.h = CODEBLOCK_HEADER_H`，`expandedH` 记录原高度；展开态 `geometry.h = 实际高度`。两者 + `collapsed` 通过 cell style 透传，序列化自洽（`parseGraphSnapshot` 直接透传 nodes 数组对象，无需改动）。

## 各文件改动清单

### 1. `graphTheme.ts`
- `SHAPE_PALETTE_LIGHT` / `SHAPE_PALETTE_DARK` 加 `codeblock` 配色：`fill` = 代码区背景（浅色 `#F9FAFB` / 深色 `#1F2937`），`stroke` = 边框色（沿用中性灰）。
- 新增导出常量 `CODEBLOCK_HEADER_H = 26`（header 栏高度，尺寸常量集中处）。

### 2. `graphSnapshot.ts`
- `GraphNodeShape` 加 `'codeblock'`。
- `GraphNode` 加 `collapsed?: boolean`、`expandedH?: number`。

### 3. `graphCanvasStyle.ts`
- `DEFAULT_SIZE` 加 `codeblock: { w: 240, h: 160 }`。
- `SHAPE_LABEL` 加 `codeblock: ''`（默认空，双击编辑代码）。
- `styleForShape` 加 `codeblock` case：
  ```ts
  case 'codeblock':
    return {
      ...base,
      shape: 'codeblock',
      verticalAlign: 'top',
      align: 'left',
      spacingTop: CODEBLOCK_HEADER_H,
      spacingLeft: 8,
      spacingRight: 8,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      overflow: 'hidden',
      whiteSpace: 'wrap',
    };
  ```
  （从 `graphTheme` import `CODEBLOCK_HEADER_H`）

### 4. `customShapes.ts`
- 新增 `CodeBlockShape extends Shape`，`paintBackground` 画：外框圆角矩形 + header 背景 + header 分隔线 + chevron 三角（按 `this.style?.collapsed` 决定朝向）+ 「代码」标签文字。
- `registerCustomShapes()` 中 `ShapeRegistry.add('codeblock', CodeBlockShape)`。
- 从 `graphTheme` import `CODEBLOCK_HEADER_H`。

### 5. `graphModel.ts`
- `nodeShapeToStyle` 加 `codeblock` case（与 `styleForShape` 一致的样式）。
- `styleToNodeShape` 加 `if (shape === 'codeblock') return 'codeblock';`。
- `buildNodeStyle`：透传 `node.collapsed` → `base.collapsed`、`node.expandedH` → `base.expandedH`。
- `readSnapshotFromGraph`：读 `style.collapsed` → `node.collapsed`、`style.expandedH` → `node.expandedH`（折叠态 `node.h` 自然为 `HEADER_H`，`expandedH` 保留原高度）。

### 6. `ShapeGlyph.tsx`
- 加 `codeblock` 图标：圆角矩形 + header 横线 + 两行代码短线（与画板实际图形一致）。

### 7. `GraphCanvas.tsx`
- `shapeTools` 数组追加 `{ shape: 'codeblock', title: '代码块' }`。
- `ensurePreviewShape` / `applyPreviewSize` 加 `codeblock` case（预览用矩形 + header 线）。
- 新增折叠/展开交互：在 container 上加 `mousedown` capture 监听器：
  - 非绘制态、编辑态下，把点击点转图坐标，`getCellAt` 命中 vertex 且 `style.shape === 'codeblock'`，且落在 header 左侧 chevron 区域（`[x, x+HEADER_H] × [y, y+HEADER_H]`）时，`preventDefault + stopPropagation` 拦截，调用 `toggleCodeBlockCollapse(graph, cell)`：
    - 折叠→展开：`geometry.h = expandedH ?? 160`，`style.collapsed = false`。
    - 展开→折叠：`style.expandedH = geo.height`，`geometry.h = HEADER_H`，`style.collapsed = true`。
    - 在 `batchUpdate` 内执行（单步 undo），完成后 `view.invalidate(cell)` 触发重绘，model CHANGE 事件自动 `scheduleEmit` 持久化。
  - cleanup 时 removeEventListener。

## 交互流程

1. 工具栏点「代码块」→ 画布拖拽划定大小（或点击落默认 240×160）→ 生成 codeblock，默认展开、label 空。
2. 双击 → maxGraph 内联编辑 cell.value（代码内容，多行）。
3. 点击 header 左侧 chevron 区域 → 折叠/展开切换（几何高度变化 + chevron 朝向变化），自动持久化。
4. 选中后可拖拽/resize/改对齐/改填充色，与其他形状一致；折叠态下高度固定为 header 高（resize 仍可改宽）。

## 风险与验证

- **maxGraph label 定位**：`spacingTop` / `overflow:hidden` 的实际裁剪行为需在实现后验证；若折叠时代码文字仍溢出 header，改用更大的 `spacingTop` 或折叠时临时把 label `spacingTop` 设为超过 bounds。
- **chevron 点击与 maxGraph 事件冲突**：capture 阶段 `stopPropagation` 拦截，参照已有绘制态 `onMouseDown` 的做法；需确保只在命中 chevron 时拦截，其余放行。
- **折叠后连线端点**：连到 codeblock 的边在折叠后端点会随几何变化重路由（maxGraph 自动），属预期行为。
- **主题切换**：`applyThemeColors` 已遍历 vertex 用 `paletteFor(shape)` 刷新 fill/stroke，codeblock 加 palette 后自动覆盖；header 背景在 Shape 内基于 strokeColor 计算，重绘自动更新。

## 不在本次范围

- 语法高亮、语言选择、复制按钮、HTML/Mermaid 预览（受矢量绘制限制，不做）。
- 可编辑标题（cell.value 已用于代码，无第二文本源）。
- 折叠态禁止 resize 高度（MVP 不特殊处理，用户一般不在折叠态 resize）。
