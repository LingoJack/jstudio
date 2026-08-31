# SectionOutline Pin + Hover-Expand 方案

## 目标

让 SectionOutline（右侧大纲面板）拥有和 DocumentSidebar（左侧文档列表）一样的 **pin/unpin + hover 展开 overlay** 行为：

- **已 pin**：完整宽度（240px），始终占据空间，header 里 Pin 按钮高亮
- **未 pin**：折叠到 48px 窄条，只显示 Pin 按钮；鼠标 hover 时以 overlay 方式展开（不推挤编辑器内容，编辑器不 reflow），移开后延时折叠
- **完全关闭**：现有的 ListTree 开关按钮控制 outline 的显示/隐藏（isOutlineOpen）

## 设计要点

### 布局方向（右 vs 左）

DocumentSidebar 在编辑器**左侧**，overlay 用负 `margin-right` 抵消多出的宽度。
SectionOutline 在编辑器**右侧**，overlay 需要用负 `margin-left` 抵消多出的宽度。
阴影方向也相反：DocumentSidebar 用 `4px 0`（阴影向右），SectionOutline 用 `-4px 0`（阴影向左）。

### ListTree 开关按钮的处理

当前 ListTree 开关按钮浮在 DocumentPanel 右上角，在 outline 打开时位于 outline 内部。

新方案：
- **outline 关闭时**（isOutlineOpen = false）：ListTree 按钮浮在 DocumentPanel 右上角（保持现有行为）
- **outline 打开时**（isOutlineOpen = true）：ListTree 按钮移入 SectionOutline 的 header 内（和 Pin 按钮并排），不再浮动。这样折叠态时不会和 Pin 按钮重叠

### 简化 hover 逻辑

DocumentSidebar 的 hover 逻辑很复杂（suppressCollapse、lastPointerPos、leftPanelHovered），因为它有浮动菜单、拖拽、重命名等交互。
SectionOutline 没有这些交互，只需最基本的 hover enter/leave + 延时折叠（COLLAPSE_DELAY = 180ms）即可。

## 改动清单

### 1. src/store/storeHelpers.ts - 新增类型声明

在 UIStore 类型接口中添加：
- 状态字段：`outlinePinned: boolean;`（在 isOutlineOpen 附近，约 line 129）
- action：`toggleOutlinePinned: () => void;`（在 toggleOutline 附近，约 line 256）

### 2. src/store/uiSlice.ts - 新增状态和 action

- 在 initialUIState 中添加 `outlinePinned: true`（默认 pin）
- 添加 `toggleOutlinePinned` action（仿照 toggleSidebarPinned 的模式）：
  ```ts
  toggleOutlinePinned: () => {
    const next = !get().outlinePinned;
    set({ outlinePinned: next });
    storage.saveSettings({ outlinePinned: next }).catch(onSaveError('设置'));
  },
  ```

### 3. src/lib/core/storage.ts - 新增持久化字段

在 SettingsData 接口中添加：
```ts
/** Whether the section outline is pinned (true) or hover-to-expand (false). */
outlinePinned?: boolean;
```

### 4. src/store/documentsSlice.ts - 初始化加载

在 loadDocuments 中读取 settings.outlinePinned 并设置到 store（仿照 sidebarPinned 的模式）：
```ts
let outlinePinned: boolean | undefined;
// ...
if (typeof settings.outlinePinned === 'boolean') {
  outlinePinned = settings.outlinePinned;
}
// ...
...(outlinePinned !== undefined ? { outlinePinned } : {}),
```

### 5. src/lib/core/i18n/translations.ts - 新增翻译键

中文：
- `"outline.pin": "固定大纲"`
- `"outline.unpin": "取消固定"`

英文：
- `"outline.pin": "Pin Outline"`
- `"outline.unpin": "Unpin Outline"`

### 6. src/components/editor/sectionEditor/SectionOutline.tsx - 核心改动

**新增常量：**
```ts
const COLLAPSED_WIDTH = 48;
const COLLAPSE_DELAY = 180;
const OUTLINE_WIDTH = 240;
```

**从 store 读取：**
```ts
const outlinePinned = useStore((s) => s.outlinePinned);
const toggleOutlinePinned = useStore((s) => s.toggleOutlinePinned);
const toggleOutline = useStore((s) => s.toggleOutline);
```

**hover 状态（简化版，无 suppressCollapse）：**
```ts
const [hoverExpanded, setHoverExpanded] = useState(false);
const hoverCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

const scheduleCollapse = useCallback(() => {
  if (hoverCollapseTimer.current) clearTimeout(hoverCollapseTimer.current);
  hoverCollapseTimer.current = setTimeout(() => {
    setHoverExpanded(false);
  }, COLLAPSE_DELAY);
}, []);

const handleHoverEnter = useCallback(() => {
  if (outlinePinned) return;
  if (hoverCollapseTimer.current) {
    clearTimeout(hoverCollapseTimer.current);
    hoverCollapseTimer.current = null;
  }
  setHoverExpanded(true);
}, [outlinePinned]);

const handleHoverLeave = useCallback(() => {
  if (outlinePinned) return;
  scheduleCollapse();
}, [outlinePinned, scheduleCollapse]);
```

**计算布局变量：**
```ts
const isCollapsed = !outlinePinned && !hoverExpanded;
const effectiveWidth = isCollapsed ? COLLAPSED_WIDTH : OUTLINE_WIDTH;
const isOverlay = !outlinePinned && !isCollapsed;
const overlayShift = isOverlay ? effectiveWidth - COLLAPSED_WIDTH : 0;
```

**handleTogglePin：**
```ts
const handleTogglePin = useCallback(() => {
  toggleOutlinePinned();
  setHoverExpanded(false);
}, [toggleOutlinePinned]);
```

**渲染（根 div）：**
```tsx
<div
  data-outline-root
  className="shrink-0 h-full border-l border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] flex flex-col select-none z-30 relative overflow-hidden"
  style={{
    width: effectiveWidth,
    marginLeft: -overlayShift,
    transition: 'width 180ms ease-out, margin-left 180ms ease-out, box-shadow 180ms ease-out',
    boxShadow: isOverlay ? '-4px 0 12px rgba(0,0,0,0.3)' : '-4px 0 12px rgba(0,0,0,0)',
  }}
  onMouseEnter={handleHoverEnter}
  onMouseLeave={handleHoverLeave}
>
  {isCollapsed ? (
    // 折叠态：只显示 Pin 按钮
    <div className="h-9 shrink-0 flex items-center justify-center">
      <button
        onClick={handleTogglePin}
        className="p-1.5 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
        title={t('outline.pin')}
      >
        <Pin className="w-4 h-4" />
      </button>
    </div>
  ) : (
    <>
      {/* Header：标题 + Pin 按钮 + ListTree 关闭按钮 */}
      <div className="h-9 shrink-0 flex items-center px-3 gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)] flex-1">
          {t('outline.title')}
        </h2>
        <button
          onClick={handleTogglePin}
          className={`p-1 rounded-md transition-colors duration-150 cursor-pointer ${
            outlinePinned
              ? 'text-[var(--vscode-foreground)] bg-[var(--vscode-list-activeSelectionBackground)] hover:bg-[var(--vscode-list-hoverBackground)]'
              : 'text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
          }`}
          title={outlinePinned ? t('outline.unpin') : t('outline.pin')}
        >
          <Pin className="w-4 h-4" />
        </button>
        <button
          onClick={toggleOutline}
          className="p-1 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
          title={t('outline.hide')}
        >
          <ListTree className="w-4 h-4" />
        </button>
      </div>
      {/* 内容区保持不变 */}
      <div className="flex-1 overflow-y-auto rounded-md px-3 pb-3 space-y-0.5">
        {headings.length === 0 ? (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
            {t('outline.empty')}
          </p>
        ) : (
          renderTree(headings, 1, activeId, handleClick, collapsed, toggle)
        )}
      </div>
    </>
  )}
</div>
```

需要从 lucide-react 导入 Pin 和 ListTree 图标。

### 7. src/components/editor/sectionEditor/DocumentPanel.tsx - 调整 ListTree 按钮

当前有两处 ListTree 按钮（static 模式 + editing 模式各一个）。

**当 isOutlineOpen = true 时不再渲染浮动的 ListTree 按钮**（因为已移入 SectionOutline header）：

```tsx
{/* Outline toggle icon - only show when outline is closed */}
{!isOutlineOpen && (
  <button
    onClick={toggleOutline}
    title={t('outline.show')}
    className="absolute top-3 right-3 z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
  >
    <ListTree className="w-4 h-4" />
  </button>
)}
```

两处（static 模式约 line 1231, editing 模式约 line 1351）都做同样的调整。

## 文件变更总览

| 文件 | 变更类型 |
|------|---------|
| src/store/storeHelpers.ts | 新增 outlinePinned 类型 + toggleOutlinePinned action 类型 |
| src/store/uiSlice.ts | 新增 outlinePinned 状态 + toggleOutlinePinned action 实现 |
| src/lib/core/storage.ts | 新增 outlinePinned 持久化字段 |
| src/store/documentsSlice.ts | 初始化加载 outlinePinned |
| src/lib/core/i18n/translations.ts | 新增 outline.pin / outline.unpin 翻译 |
| src/components/editor/sectionEditor/SectionOutline.tsx | 核心改动：pin + hover-expand overlay |
| src/components/editor/sectionEditor/DocumentPanel.tsx | ListTree 按钮仅在 outline 关闭时显示 |

## 行为矩阵

| isOutlineOpen | outlinePinned | hoverExpanded | 效果 |
|---------------|---------------|---------------|------|
| false | - | - | 不显示 outline，DocumentPanel 右上角显示 ListTree 开关按钮 |
| true | true | - | 完整 240px，header 显示 Pin(高亮) + ListTree 按钮 |
| true | false | false | 折叠 48px 窄条，只显示 Pin 按钮 |
| true | false | true | 完整 240px overlay（负 margin-left 抵消），header 显示 Pin + ListTree 按钮 |
