# 为 BlockEditor 添加 GPU 光标拖尾动画

## 目标

让 TipTap 编辑器区域拥有类似终端的 kitty-style GPU 光标拖尾动画 —— 当光标在编辑器内移动时（键盘导航、点击不同位置），一个带渐变淡出的光标残影会以指数缓动方式追逐到新位置，产生彗星尾巴效果。

## 技术分析

### 终端的做法（CursorTrail）
- 一个覆盖所有 pane 的 `<canvas>` overlay div（`pointerEvents: none`, `z-index: 5`）
- WebGL2 渲染：单个 quad（2 个三角形），4 个角各自以指数缓动追逐光标的 4 个角
- 运动方向前方的角用快速衰减（0.1s），后方的角用慢速衰减（0.4s），形成彗星形状
- 片段着色器在真实光标位置开一个 cutout 矩形，使可见光标始终不被遮挡
- `requestAnimationFrame` 驱动的主循环，每帧测量网格、更新目标、更新角、渲染

### 编辑器的差异
TipTap 编辑器的光标是浏览器原生 caret（`contentEditable`），没有像 xterm 那样的 `buffer.active.cursorX/Y`。我们需要通过 **`Selection` API**（`window.getSelection().getRangeAt(0).getBoundingClientRect()`）来获取光标在屏幕上的像素位置。

## 实现方案

### 新增文件

#### 1. `src/components/EditorCursorTrail.ts` — 编辑器光标拖尾类

这是一个独立于终端 `CursorTrail` 的轻量版本，专门适配 contentEditable 编辑器：

```typescript
export class EditorCursorTrail {
  // WebGL2 canvas overlay
  // 不依赖 xterm，改用 Selection API 获取光标位置
  
  // 核心差异：
  // 1. 无网格测量（measureGrid 不需要）—— 直接用 caret rect
  // 2. 光标位置 = getCaretPixelRect()，返回 {left, right, top, bottom}
  // 3. 光标形状固定为 caret 样式（一条竖线），不需要 block/underline/bar 分支
  // 4. 拖尾形状 = 细竖条（caret 宽度约 2px，高度 = 行高）
  
  attach(editorElement: HTMLElement): void
  // 监听 editor 内的 selectionchange 事件来检测光标移动
  
  // 其余 WebGL 初始化、corner chasing physics、render 逻辑与终端版本完全一致
  // 复用相同的 DECAY_FAST=0.1, DECAY_SLOW=0.4 指数缓动
}
```

**光标位置获取策略：**
- 使用 `document.addEventListener('selectionchange', ...)` 监听选区变化
- 通过 `window.getSelection().getRangeAt(0).getBoundingClientRect()` 获取 caret 的屏幕像素坐标
- 转换为 overlay canvas 本地坐标系

**光标形状：**
- contentEditable 的 caret 是一条竖线（宽度约 2px，高度 = font-size × line-height）
- 拖尾 quad 使用相同形状：`thickX = 2px / cellW`, `thickY = 1.0`

### 修改文件

#### 2. `src/components/BlockEditor.tsx` — 集成光标拖尾

在编辑器容器内添加 overlay canvas 和初始化逻辑：

```tsx
// 新增 ref
const overlayRef = useRef<HTMLDivElement>(null);
const trailRef = useRef<EditorCursorTrail | null>(null);

// 新增 effect：创建拖尾
useEffect(() => {
  const overlay = overlayRef.current;
  const editorEl = document.querySelector('.ProseMirror');
  if (!overlay || !editorEl) return;
  
  const canvas = document.createElement('canvas');
  // ... 设置样式
  
  const trail = new EditorCursorTrail(canvas, color, editorEl);
  trail.resize();
  trail.start();
  trailRef.current = trail;
  
  return () => trail.dispose();
}, [editor]);

// 新增 ResizeObserver effect（同终端做法）

// JSX 新增 overlay div
<div ref={overlayRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }} />
```

### 具体实现细节

**EditorCursorTrail.ts 完整逻辑：**

```
构造函数：
  - WebGL2 context 获取
  - 编译 TRAIL_VS / TRAIL_FS 着色器（复用终端 shaders.ts）
  - 创建 VAO + VBO（12 floats = 6 vertices × 2 coords）
  - 初始化 4 个 corner 到 (0,0)

attach(editorEl):
  - 存储 editorElement 引用
  - 不需要 poke（编辑器没有跨 pane 切换）

loop():
  1. measureCaretRect():
     - const sel = window.getSelection()
     - if sel.rangeCount === 0 → cursorVisible = false, return
     - const range = sel.getRangeAt(0).cloneRange()
     - if range.collapsed:
         rect = range.getBoundingClientRect()  // caret rect
       else:
         rect = null  // 有选区时不显示拖尾
     - 将 rect 从屏幕坐标转换为 canvas 本地坐标
  2. updateTarget(rect):
     - 如果 rect 为 null（有选区或无焦点）→ cursorVisible = false
     - 否则 → cursorEdgeX/Y = [left, right, top, bottom]
  3. updateCorners(dt)  ← 与终端版本完全相同的物理逻辑
  4. updateOpacity(dt)  ← 与终端版本完全相同
  5. render()           ← 与终端版本完全相同
```

**颜色：**
- 使用 `var(--vscode-editorCursor-foreground)` 如果存在
- 回退到 `var(--vscode-focusBorder)` 
- 最终回退到 `#007fd4`（VSCode 默认蓝色）

**性能优化：**
- 当 caret 不动且 opacity = 1 时，可以跳过渲染（`needsRender` 检查）
- selectionchange 事件做轻量化标记，真正测量在 rAF 里做

### 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/EditorCursorTrail.ts` | **新增** | 编辑器光标拖尾类（WebGL2，~250行） |
| `src/components/BlockEditor.tsx` | **修改** | 添加 overlay canvas + 初始化拖尾 |

### 注意事项

1. **不修改终端的 CursorTrail**：编辑器版本是完全独立的类，不复用也不修改终端代码
2. **contentEditable focus 失去时隐藏拖尾**：当编辑器失去焦点（点击标题、侧边栏等），拖尾淡出
3. **有选区时不显示拖尾**：拖尾只在 collapsed caret 时显示，选中文本时不显示
4. **代码块内也能工作**：因为 contentEditable 的 caret 在任何块类型中行为一致
5. **Tailwind CSS v4**：overlay div 用 inline style 定位，不引入新 CSS 类
6. **DPR 适配**：canvas 尺寸 = CSS 尺寸 × devicePixelRatio，vertex 用 CSS 像素
