# 方案：将图片/文件/链接/图表块的尺寸改为"编辑区宽度百分比"

## 背景与问题

当前所有可拖拽缩放的块（ImageView、FileView、LinkView、DiagramBlockView）都使用**绝对像素值（px）**存储宽度。这导致：
- 切换屏幕（不同分辨率）→ 图片显示过大或过小
- 缩放窗口/侧边栏 → 固定 px 宽度与编辑区比例失调

**目标**：宽度改用"占编辑区宽度的百分比"存储（0-100），高度保持 px（因为编辑区纵向是无限滚动的，高度不存在窗口缩放问题）。

## 受影响的组件（4 个，共享 `useNodeResize`）

| 组件 | 当前维度 | 改动后宽度 | 改动后高度 |
|------|---------|-----------|-----------|
| ImageView | width-only (px) | **widthPct (%)** | 不存（由图片宽高比自动计算） |
| FileView (card) | width-only (px) | **widthPct (%)** | 内容驱动，不变 |
| FileView (preview) | width+height (px) | **widthPct (%)** | 保持 px |
| LinkView | width-only (px) | **widthPct (%)** | 内容驱动，不变 |
| DiagramBlockView | width+height (px) | **widthPct (%)** | 保持 px |

## 核心设计

### 数据流（以 ImageView 为例）

```
存储层：node.attrs.widthPct = 50  (50%)
         ↓ × editorWidth / 100
渲染层：displayWidth = 400px  (假设编辑区 800px)
         ↓ 用户拖拽到 500px
提交层：onCommit(500px) → 500 / 800 × 100 = 62.5 → 四舍五入 → widthPct = 63
         ↓ updateAttributes({ widthPct: 63 })
```

窗口缩放后编辑区变为 600px：
```
node.attrs.widthPct = 63
displayWidth = 63 × 600 / 100 = 378px  ← 自动等比缩小 ✅
```

### `useNodeResize` hook 不做大改

hook 内部继续以 px 运作（拖拽本质是像素位移）。pct↔px 转换由各组件在调用边界完成：
- **输入**：`width` 参数传入由 `widthPct` 换算的 px 值
- **输出**：`onCommit` 回调里把返回的 px 值转回 pct

## 实施步骤

### Step 1: 新建 `useEditorWidth` hook

**文件**：`src/hooks/useEditorWidth.ts`（新建）

功能：
- 通过 `ResizeObserver` 监听 `.ProseMirror` 编辑区宽度变化
- 返回响应式的 `editorWidth: number`（px）
- 所有可缩放 NodeView 用它做 pct↔px 转换

```ts
export function useEditorWidth(surfaceEl?: HTMLElement | null): number {
  // ResizeObserver 监听 .ProseMirror clientWidth
  // 返回 editorWidth (px)，默认 fallback 800
}
```

**设计细节**：
- 接受一个可选的 ref 参数（优先用传入的元素），否则自动查找 `.ProseMirror`
- 使用 `ResizeObserver` 响应式更新
- 初次挂载时也读取一次

### Step 2: 更新 4 个 TipTap 扩展的属性定义

每个扩展新增 `widthPct` 属性，保留旧 `width` 用于读取兼容：

**改动文件**：
- `src/lib/imageExtension.ts`
- `src/lib/fileExtension.ts`
- `src/lib/linkExtension.ts`
- `src/lib/diagramExtension.ts`

每个文件中 `width` 属性定义后新增：
```ts
widthPct: {
  default: null,
  parseHTML: (el) => {
    const v = el.getAttribute('data-width-pct');
    return v ? Number(v) : null;
  },
  renderHTML: (attrs) => {
    if (attrs.widthPct == null) return {};
    return { 'data-width-pct': attrs.widthPct };
  },
},
```

同时更新对应的 `*NodeAttributes` 接口，加入 `widthPct: number | null`。

### Step 3: 更新 `useNodeResize` hook（小幅增强）

**文件**：`src/hooks/useNodeResize.ts`

改动很小——只是确保 hook 接受外部传入的动态 `maxWidth` 时能正确响应。实际上当前逻辑已经支持 `maxWidth: () => number`，无需大改。

唯一优化：在文档注释中补充百分比使用模式的说明。

### Step 4: 更新 ImageView 组件

**文件**：`src/components/ImageView.tsx`

改动：
1. 引入 `useEditorWidth`
2. 计算 `widthPx`：`widthPct != null ? widthPct × editorWidth / 100 : (width ?? null)`
   - 优先用 `widthPct`，回退到旧 `width`（px），再回退到 null（默认宽度）
3. 传 `width: widthPx` 给 `useNodeResize`
4. `onCommit` 中：`const pct = Math.round(finalWidth / editorWidth × 100)`，返回 `{ widthPct: pct, width: null }`
5. **懒迁移**：首次渲染时，如果 `width`（px）存在但 `widthPct` 为 null，调用 `updateAttributes({ widthPct: 计算值, width: null })` 做一次性迁移
6. 给 ImageView 加上 `maxWidth`（之前没有），限制为编辑区宽度

### Step 5: 更新 FileView 组件

**文件**：`src/components/FileView.tsx`

改动（与 ImageView 类似，但多了 height 维度）：
1. 引入 `useEditorWidth`
2. 宽度：同 ImageView 的 pct 逻辑
3. 高度：保持 px 不变（preview 模式继续用 `height`）
4. `onCommit`：`{ widthPct: pct, width: null }`（不写 height 的高度，height 照旧）
5. 懒迁移同上
6. `figureStyle.width` 改为 `widthPx ? ${widthPx}px : '400px'`

### Step 6: 更新 LinkView 组件

**文件**：`src/components/LinkView.tsx`

改动同 ImageView（width-only 模式），`fallbackWidth` 改为基于百分比计算。

### Step 7: 更新 DiagramBlockView 组件

**文件**：`src/components/DiagramBlockView.tsx`

改动同 FileView preview 模式（width pct + height px）。

### Step 8: 更新类型定义

**文件**：`src/types/document.ts`

`BlockProperties` 接口中补充 `widthPct?: number` 字段（如果该接口仍被使用）。

## 向后兼容策略

| 场景 | 处理方式 |
|------|---------|
| 旧文档有 `width: 400`（px），无 `widthPct` | 首次渲染时懒迁移：按当前编辑区宽度算出 pct，写入 `widthPct`，清除 `width` |
| 新文档 | 直接使用 `widthPct`，`width` 始终为 null |
| HTML 导入（parseHTML） | 同时解析 `data-width`（旧 px）和 `data-width-pct`（新 pct），优先 pct |
| HTML 导出（renderHTML） | 输出 `data-width-pct`；如果 `widthPct` 为 null 但有旧 `width`，仍输出 `data-width` |

## 不改动的部分

- **高度**：所有 height 属性保持 px（编辑区纵向无限滚动，不存在窗口缩放问题）
- **`useNodeResize` 核心拖拽算法**：继续在 px 域运作
- **ResizeObserver 已有的 3 处使用**（CodeBlockView、终端相关）：不涉及
- **存储格式**：仍是 `document.json`，只是 attrs 多了 `widthPct` 字段

## 涉及文件清单

| 文件 | 操作 |
|------|------|
| `src/hooks/useEditorWidth.ts` | **新建** |
| `src/hooks/useNodeResize.ts` | 小改（注释 + 可能的微调） |
| `src/lib/imageExtension.ts` | 新增 widthPct 属性 |
| `src/lib/fileExtension.ts` | 新增 widthPct 属性 |
| `src/lib/linkExtension.ts` | 新增 widthPct 属性 |
| `src/lib/diagramExtension.ts` | 新增 widthPct 属性 |
| `src/components/ImageView.tsx` | pct↔px 转换 + 懒迁移 |
| `src/components/FileView.tsx` | pct↔px 转换 + 懒迁移 |
| `src/components/LinkView.tsx` | pct↔px 转换 + 懒迁移 |
| `src/components/DiagramBlockView.tsx` | pct↔px 转换 + 懒迁移 |
| `src/types/document.ts` | 补充 widthPct 类型（如需要） |

## 验证方式

1. `npx tsc --noEmit` 类型检查通过
2. `npm run dev` 启动后手动测试：
   - 插入图片/文件/链接/图表，拖拽缩放 → 确认尺寸正确
   - 缩放窗口 → 确认已缩放的块等比例跟随
   - 打开旧文档 → 确认旧 px 值被正确迁移为 pct
3. `npm run build` 构建无报错
