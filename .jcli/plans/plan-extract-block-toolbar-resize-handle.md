# 抽取统一 BlockToolbar + ResizeHandle 组件

## 背景

`ImageView`、`FileView`、`DiagramBlockView`、`LinkView` 四个 NodeView 组件各自手写了一份结构几乎相同的浮动 toolbar 和 resize handle。CSS 层面更是有 4 套几乎一致的规则（`.image-toolbar*`、`.file-block-toolbar*`、`.diagram-block-toolbar*`、`.link-block-toolbar*` 及对应的 `-resize-handle`）。

## 方案

### 新建 2 个公共组件文件

#### 1. `src/components/ui/BlockToolbar.tsx`

导出 4 个组件（参照 `MenuList.tsx` 一文件多导出的惯例）：

| 组件 | 职责 |
|------|------|
| `BlockToolbar` | 浮动 toolbar 容器，接收 `selected` 控制显示，内部渲染 `<div className="block-toolbar" contentEditable={false}>` |
| `BlockToolbarButton` | 单个按钮，接收 `nav`（`{ activeIndex, registerButton }`）、`index`、`active?`、`disabled?` + 标准 button props；自动拼接 `is-active` / `is-focused` class |
| `BlockToolbarDivider` | 分隔线 `<span className="block-toolbar-divider" />` |
| `AlignButtonGroup` | 左对齐+居中对齐预设组合，4 个块完全一致地使用，消除最后一段重复 JSX。接收 `nav`、`align`、`onAlignChange`、`startIndex`(默认 0) |

#### 2. `src/components/ui/ResizeHandle.tsx`

| 组件 | 职责 |
|------|------|
| `ResizeHandle` | 右下角缩放手柄，接收 `onPointerDown`，渲染 `<div className="block-resize-handle" />` |

### 修改 4 个 NodeView 组件

每个文件替换逻辑相同：

1. 删除内联的 toolbar JSX（几十行 button 模板），替换为：
```tsx
<BlockToolbar selected={selected}>
  <AlignButtonGroup nav={nav} align={effectiveAlign}
    onAlignChange={(align) => updateAttributes({ align })} />
  {/* 块特有按钮 */}
  <BlockToolbarDivider />
  <BlockToolbarButton nav={nav} index={2} onClick={handleMaximize} title="...">
    <Maximize2 size={15} />
  </BlockToolbarButton>
</BlockToolbar>
```
2. 删除内联的 resize handle JSX，替换为：
```tsx
{selected && <ResizeHandle onPointerDown={onResizeStart} />}
```

具体每个块：
- **ImageView** — 仅 AlignButtonGroup（2 按钮）
- **FileView** — AlignButtonGroup + divider + preview toggle + 可选 maximize（动态 2~4 按钮）
- **DiagramBlockView** — AlignButtonGroup + divider + maximize（3 按钮）
- **LinkView** — AlignButtonGroup + divider + eye + refresh + external（5 按钮）

### CSS 统一（`vscode-theme.css`）

**新增**统一类名：
```
.block-toolbar / .block-toolbar-btn / .block-toolbar-btn:hover
.block-toolbar-btn.is-active / .block-toolbar-btn.is-focused / .block-toolbar-btn:disabled
.block-toolbar-divider
.block-resize-handle
```
取 image/file/diagram 版本为标准（28px 按钮、top -40px、2px outline）。link-block 的视觉偏差（26px、top -36px、1px outline）统一到标准。

**删除**以下旧规则（4 组 × 约 7 条 = 约 28 条规则）：
- `.image-toolbar*` + `.image-resize-handle`
- `.file-block-toolbar*` + `.file-block-resize-handle`
- `.diagram-block-toolbar*` + `.diagram-block-resize-handle`
- `.link-block-toolbar*` + `.link-block-resize-handle`

### 不改动的文件

- `useNodeToolbarNav.ts` — hook 接口不变
- `useNodeResize.ts` — hook 接口不变
- `CodeBlockView.tsx` / `CollapsibleView.tsx` / `TableControls.tsx` — 不参与此模式

## 验证

- `npx tsc --noEmit` 通过
- `npm run build` 通过
- 手动验证各块的 toolbar 对齐按钮、resize handle 功能正常（无法自动测试）
