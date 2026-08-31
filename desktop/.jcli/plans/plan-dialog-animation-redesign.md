# 弹窗动画重新设计 + 尺寸加大

## 目标
1. **动画**：参照 macOS/iOS 弹窗 -- 入场 + 退场动画，质感平滑，无过冲无回弹
2. **尺寸**：所有弹窗统一加大

## 一、问题分析

### 当前"闪两下"根因
CommandPalette 用 `useState(false)` + `useEffect` 控制动画：首次渲染 `isAnimatingIn=false` 面板直接显示（第一闪），然后 useEffect 改为 `true` 动画从 opacity:0 开始（第二闪）。

### 当前"无动画感"原因
纯 CSS 动画挂载即播放，但 180ms + 8px 位移太微弱，加上无退场动画（关闭瞬间消失），整体感受不完整。

## 二、方案设计

### 1. 新建 `useDialogTransition` hook
**文件**: `src/components/ui/useDialogTransition.ts`

管理弹窗的入场/退场状态，返回 `'closed' | 'enter' | 'exit'`：
- `open` false→true：状态变 `'enter'`，入场动画播放
- `open` true→false：状态变 `'exit'`，退场动画播放，动画结束后变 `'closed'` 卸载
- 用 `useLayoutEffect` 确保状态更新在浏览器绘制前完成，**杜绝闪烁**
- 处理快速开关场景（清除 pending exit timer）

同时导出 `useAnimatedExit` —— 给 BackupRestoreDialog 用（它由父组件条件渲染，没有 `open` prop），包装 `onClose` 实现"先播退场动画再卸载"。

### 2. CSS 动画（`vscode-theme.css`）
替换现有的 `dialog-backdrop-in` / `dialog-panel-in`，新增 `-out` 退场动画：

| 动画 | 效果 | 时长 | 曲线 |
|------|------|------|------|
| backdrop-in | opacity 0→1 | 200ms | ease-out |
| backdrop-out | opacity 1→0 | 150ms | ease-in |
| panel-in | opacity 0→1 + scale 0.94→1 | 280ms | cubic-bezier(0.32, 0.72, 0, 1) |
| panel-out | opacity 1→0 + scale 1→0.94 | 180ms | cubic-bezier(0.4, 0, 1, 1) |

- 纯 opacity + scale，无 translateY（避免方向感混乱）
- 入场比退场慢，符合"进入有分量、离开干脆"的手感
- 无过冲无回弹

### 3. 各弹窗改动

#### A. 有 `open` prop 的弹窗（5 个）
**CommandPalette / OpenDocumentDialog / TrashDialog / AIGraphImportDialog / MermaidImportDialog**

改动模式：
```tsx
// Before
if (!open) return null;

// After
const transition = useDialogTransition(open);
if (transition === 'closed') return null;
// panel className 根据 transition 选择 in/out 动画类
```

- 入场：`animate-dialog-panel-in` / `animate-dialog-backdrop-in`
- 退场：`animate-dialog-panel-out` / `animate-dialog-backdrop-out`

#### B. BackupRestoreDialog（条件渲染，无 `open` prop）
```tsx
const { exiting, close } = useAnimatedExit(onClose);
// 所有 onClose() 调用改为 close()
// panel className 根据 exiting 选择 in/out 动画类
```

### 4. 尺寸加大

| 弹窗 | 当前宽度 | 新宽度 | 其他 |
|------|---------|--------|------|
| CommandPalette | 520px | 600px | 结果区 max-h 320→360px |
| OpenDocumentDialog | 480px | 600px | 结果区 max-h 360→420px |
| TrashDialog | 480px | 600px | max-h 70vh→80vh |
| AIGraphImportDialog | 560px | 680px | max-h 80vh→85vh, textarea 160→200px |
| MermaidImportDialog | 560px | 680px | max-h 80vh→85vh |
| BackupRestoreDialog | 1200×860 | 1280×900 | 微调 |

## 三、文件清单

| 文件 | 操作 |
|------|------|
| `src/components/ui/useDialogTransition.ts` | **新建** -- hook |
| `src/styles/vscode-theme.css` | 修改 -- 替换/新增动画 keyframes 和类 |
| `src/components/editor/CommandPalette.tsx` | 修改 -- 用 hook + 加大 |
| `src/components/documents/OpenDocumentDialog.tsx` | 修改 -- 用 hook + 加大 |
| `src/components/documents/TrashDialog.tsx` | 修改 -- 用 hook + 加大 |
| `src/components/editor/nodes/graph/AIGraphImportDialog.tsx` | 修改 -- 用 hook + 加大 |
| `src/components/editor/nodes/graph/MermaidImportDialog.tsx` | 修改 -- 用 hook + 加大 |
| `src/components/documents/BackupRestoreDialog.tsx` | 修改 -- 用 useAnimatedExit + 加大 |

## 四、验证
- `npx tsc --noEmit` 类型检查
- `npm run build` 构建
