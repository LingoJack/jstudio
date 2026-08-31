# Toast 通知系统

## 目标

创建一个全局 Toast 通知模块，固定在应用右上角，所有组件都可以调用。替换掉 `GeneralSection.tsx` 中 JcliSection 里手写的 `error/success` 临时状态 + 内联提示块。

## 架构设计

采用 **Zustand slice + 独立容器组件 + 命令式 helper** 三层结构，不依赖 React Context，与项目现有的 slice 模式一致。

```
toastSlice.ts (store)     ← 状态层：管理 toast 队列
ToastContainer.tsx (组件) ← 视图层：渲染右上角通知列表
toast.ts (helper)         ← 调用层：命令式 API，任意文件可 import
```

### 为什么不用 Context?

项目已有 Zustand store + slice 模式（`useStore.ts`），Toast 状态本质上是全局 UI 状态，放进 store 最自然。同时提供一个不依赖 React 的 `toast.ts` helper，让非组件代码（如 storage.ts 的 catch）也能触发通知。

## 文件清单

### 1. 新增 `src/store/toastSlice.ts` — Toast 状态 slice

```typescript
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration: number; // ms, 0 = 不自动关闭
}

// slice state:
toasts: ToastItem[]
addToast: (type, message, duration?) => void
removeToast: (id) => void
clearToasts: () => void
```

- 默认 duration: `success/info` = 3s, `error/warning` = 5s
- 最多同时显示 5 条，超出时移除最早的
- 在 `storeHelpers.ts` 的 `StoreState` 接口中声明类型
- 在 `useStore.ts` 中组合 slice

### 2. 新增 `src/components/ui/Toast.tsx` — Toast 容器组件

- 固定定位在右上角 (`fixed top-4 right-4 z-[200]`)
- 从 store 订阅 `toasts` 数组
- 每条 toast 渲染为一个卡片（带左边框颜色条 + 图标 + 消息 + 关闭按钮）
- 使用 lucide-react 图标：`CheckCircle2` / `XCircle` / `Info` / `AlertCircle` / `X`
- 进入动画：从右侧滑入 + 淡入（CSS keyframes）
- 退出动画：淡出
- 使用 VSCode CSS 变量保持主题一致

### 3. 新增 `src/lib/toast.ts` — 命令式调用 helper

```typescript
import { useStore } from '../store/useStore';

export const toast = {
  success: (msg: string, duration?: number) =>
    useStore.getState().addToast('success', msg, duration),
  error: (msg: string, duration?: number) =>
    useStore.getState().addToast('error', msg, duration),
  info: (msg: string, duration?: number) =>
    useStore.getState().addToast('info', msg, duration),
  warning: (msg: string, duration?: number) =>
    useStore.getState().addToast('warning', msg, duration),
};
```

好处：任意 `.tsx` / `.ts` 文件直接 `import { toast } from '@/lib/toast'` 即可调用，无需 hooks。

### 4. 修改 `src/App.tsx` — 挂载 ToastContainer

在 App 根节点的末尾（`</div>` 前）渲染 `<ToastContainer />`。

### 5. 修改 `src/store/storeHelpers.ts` — 声明 StoreState

在 `StoreState` 接口中添加 toast 相关字段：

```typescript
// — toast (toast slice) —
toasts: ToastItem[];
addToast: (type: ToastType, message: string, duration?: number) => void;
removeToast: (id: string) => void;
clearToasts: () => void;
```

### 6. 修改 `src/store/useStore.ts` — 组合 slice

引入并展开 `createToastSlice`。

### 7. 修改 `src/components/settings/GeneralSection.tsx` — 接入 toast

- JcliSection：删除 `error` / `success` / `busy` 的 useState，安装/卸载成功/失败时改为调用 `toast.success()` / `toast.error()`
- GeneralSection（DataLocation）：`handleOpen` 失败时改为 `toast.error()`
- 删除组件内手写的 success/error 提示块 JSX

### 8. 修改 `src/styles/vscode-theme.css` — Toast 动画

新增 `@keyframes toast-slide-in` 和 `@keyframes toast-fade-out`。

## UI 设计

```
┌───────────────────────────────────┐
│ ✓  jcli 安装成功              ✕  │   ← success (绿色左边框)
└───────────────────────────────────┘
┌───────────────────────────────────┐
│ ✕  安装失败: permission denied ✕  │   ← error (红色左边框)
└───────────────────────────────────┘
```

- 位置：右上角，`top-4 right-4`，`z-index: 200`（高于一切 modal/menu）
- 宽度：`w-80`（320px），消息过长自动换行
- 卡片：`bg-[var(--vscode-notification-toast-background)]` + 左边框 3px
- 颜色映射：
  - success → `var(--vscode-testing-iconPassed)`
  - error → `var(--vscode-errorForeground)`
  - warning → `var(--vscode-editorWarning-foreground)`
  - info → `var(--vscode-notificationsInfoIcon-foreground)`

## 验证

- `npx tsc --noEmit` 通过
- Toast 在右上角显示，3s/5s 后自动消失
- JcliSection 安装/卸载使用 toast 而非内联提示
