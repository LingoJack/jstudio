# Plan: 应用多主题系统设计

## 目标

将终端的多主题架构扩展到整个应用 UI，让用户可以像选择终端主题一样选择应用外观主题。

## 当前架构分析

### 终端主题系统（已完成）

```typescript
// themes.ts
interface TerminalTheme {
  id: string;
  isDark: boolean;
  background: string;
  foreground: string;
  // ... ANSI 16 色
  ui: { barBg, barBorder, barFg, panelBg };
}

// Store
terminalThemeIdDark: string;  // 暗色模式下的终端主题
terminalThemeIdLight: string; // 亮色模式下的终端主题
```

### 应用主题系统（待实现）

当前应用只有 `themeMode: 'light' | 'dark' | 'system'`，配色硬编码在 `vscode-theme.css` 的 CSS 变量中。

## 设计方案

### 1. 创建 AppTheme 接口

```typescript
// src/lib/themes/appThemes.ts

export interface AppTheme {
  id: string;
  isDark: boolean;
  /** 主题显示名称 */
  name: string;
  /** CSS 变量映射 */
  colors: {
    // 核心背景层（三层递进）
    editorBackground: string;
    sideBarBackground: string;
    activityBarBackground: string;
    
    // 边框
    sideBarBorder: string;
    activityBarBorder: string;
    widgetBorder: string;
    
    // 文字
    foreground: string;
    descriptionForeground: string;
    
    // 交互
    focusBorder: string;
    buttonBackground: string;
    buttonForeground: string;
    buttonHoverBackground: string;
    
    // 输入
    inputBackground: string;
    inputBorder: string;
    inputForeground: string;
    
    // 标签页
    tabActiveBackground: string;
    tabActiveBorderTop: string;
    tabActiveForeground: string;
    tabInactiveBackground: string;
    tabInactiveForeground: string;
    tabBorder: string;
    
    // 菜单/列表
    menuBackground: string;
    menuBorder: string;
    menuHoverBackground: string;
    listHoverBackground: string;
    listActiveSelectionBackground: string;
    
    // 选中
    selectionBackground: string;
    
    // 其他
    titleBarBackground: string;
    titleBarBorder: string;
    titleBarForeground: string;
    panelBorder: string;
    quickInputBackground: string;
    editorWidgetBackground: string;
    scrollBarBackground: string;
    scrollBarHoverBackground: string;
    badgeBackground: string;
    badgeForeground: string;
    
    // 语法高亮（可选扩展）
    tokenComment?: string;
    tokenKeyword?: string;
    tokenString?: string;
    tokenNumber?: string;
    tokenFunction?: string;
    // ...
  };
}
```

### 2. 定义内置主题

**Light 主题：**
- `jstudio-light` — VSCode Light Modern（当前默认）
- `ink-light` — Anthropic 米白赭陶（温暖配色）

**Dark 主题：**
- `jstudio-dark` — VSCode Dark Modern（当前默认）
- `ink-dark` — Tokyo Night Moon（紫灰配色）

### 3. 主题配色数据

#### ink-light (Anthropic 米白赭陶)

```typescript
{
  id: 'ink-light',
  isDark: false,
  name: 'Ink Light',
  colors: {
    editorBackground: '#faf6f1',
    sideBarBackground: '#f5f0e8',
    activityBarBackground: '#f0ebe3',
    sideBarBorder: '#e8ddd0',
    activityBarBorder: '#ddd4c8',
    widgetBorder: '#ddd4c8',
    foreground: '#1a1612',
    descriptionForeground: '#6b5e52',
    focusBorder: '#0052D9',
    buttonBackground: '#0052D9',
    buttonForeground: '#FFFFFF',
    buttonHoverBackground: '#003CAB',
    inputBackground: '#faf6f1',
    inputBorder: '#ddd4c8',
    inputForeground: '#1a1612',
    tabActiveBackground: '#faf6f1',
    tabActiveBorderTop: '#0052D9',
    tabActiveForeground: '#1a1612',
    tabInactiveBackground: '#f5f0e8',
    tabInactiveForeground: '#8a7e72',
    tabBorder: '#ddd4c8',
    menuBackground: '#faf6f1',
    menuBorder: '#ddd4c8',
    menuHoverBackground: '#f0ebe3',
    listHoverBackground: '#f0ebe3',
    listActiveSelectionBackground: '#e8ddd0',
    selectionBackground: '#ede4d8',
    titleBarBackground: '#faf6f1',
    titleBarBorder: '#ddd4c8',
    titleBarForeground: '#1a1612',
    panelBorder: '#ddd4c8',
    quickInputBackground: '#faf6f1',
    editorWidgetBackground: '#faf6f1',
    scrollBarBackground: '#00000026',
    scrollBarHoverBackground: '#00000040',
    badgeBackground: '#ddd4c8',
    badgeForeground: '#1a1612',
  },
}
```

#### ink-dark (Tokyo Night Moon)

```typescript
{
  id: 'ink-dark',
  isDark: true,
  name: 'Ink Dark',
  colors: {
    editorBackground: '#222436',
    sideBarBackground: '#1e2030',
    activityBarBackground: '#1e2030',
    sideBarBorder: '#2f334d',
    activityBarBorder: '#2f334d',
    widgetBorder: '#2f334d',
    foreground: '#c8d3f5',
    descriptionForeground: '#7f88b0',
    focusBorder: '#82aaff',
    buttonBackground: '#82aaff',
    buttonForeground: '#1e2030',
    buttonHoverBackground: '#6090c0',
    inputBackground: '#1e2030',
    inputBorder: '#2f334d',
    inputForeground: '#c8d3f5',
    tabActiveBackground: '#222436',
    tabActiveBorderTop: '#82aaff',
    tabActiveForeground: '#c8d3f5',
    tabInactiveBackground: '#1e2030',
    tabInactiveForeground: '#7f88b0',
    tabBorder: '#2f334d',
    menuBackground: '#1e2030',
    menuBorder: '#2f334d',
    menuHoverBackground: '#2f334d',
    listHoverBackground: '#2f334d',
    listActiveSelectionBackground: '#2d3f76',
    selectionBackground: '#2d3f76',
    titleBarBackground: '#1e2030',
    titleBarBorder: '#2f334d',
    titleBarForeground: '#c8d3f5',
    panelBorder: '#2f334d',
    quickInputBackground: '#1e2030',
    editorWidgetBackground: '#1e2030',
    scrollBarBackground: '#79797966',
    scrollBarHoverBackground: '#79797999',
    badgeBackground: '#2f334d',
    badgeForeground: '#c8d3f5',
  },
}
```

#### jstudio-light (VSCode Light Modern — 保留当前默认)

```typescript
{
  id: 'jstudio-light',
  isDark: false,
  name: 'JStudio Light',
  colors: {
    editorBackground: '#F8F8F8',
    sideBarBackground: '#FFFFFF',
    activityBarBackground: '#FFFFFF',
    // ... 当前 vscode-theme.css :root 的所有值
  },
}
```

#### jstudio-dark (VSCode Dark Modern — 保留当前默认)

```typescript
{
  id: 'jstudio-dark',
  isDark: true,
  name: 'JStudio Dark',
  colors: {
    editorBackground: '#181818',
    sideBarBackground: '#1F1F1F',
    activityBarBackground: '#1F1F1F',
    // ... 当前 vscode-theme.css .dark 的所有值
  },
}
```

### 4. Store 扩展

```typescript
// uiSlice.ts

// 新增状态
appThemeIdDark: string;   // 暗色模式下使用的应用主题
appThemeIdLight: string;  // 亮色模式下使用的应用主题

// 默认值
const DEFAULT_APP_THEME_ID_DARK = 'jstudio-dark';
const DEFAULT_APP_THEME_ID_LIGHT = 'jstudio-light';

// 新增 actions
setAppThemeIdDark: (id: string) => void;
setAppThemeIdLight: (id: string) => void;

// 新增 applyAppTheme() 函数
function applyAppTheme(theme: AppTheme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    const cssVarName = `--vscode-${camelToKebab(key)}`;
    root.style.setProperty(cssVarName, value);
  }
}
```

### 5. Settings UI 扩展

在 `GeneralSection.tsx` 的 Theme 区域下方新增"应用配色主题"选择：

```tsx
{/* ---- App Color Theme (Dark) ---- */}
<div>
  <label>暗色配色主题</label>
  <AppThemeGrid isDark selectedId={appThemeIdDark} onSelect={setAppThemeIdDark} />
</div>

{/* ---- App Color Theme (Light) ---- */}
<div>
  <label>亮色配色主题</label>
  <AppThemeGrid isDark={false} selectedId={appThemeIdLight} onSelect={setAppThemeIdLight} />
</div>
```

### 6. CSS 变量动态注入策略

**方案 A（推荐）：混合静态 + 动态**
- `vscode-theme.css` 保留静态默认值（作为 fallback）
- `applyAppTheme()` 动态覆盖 CSS 变量

**方案 B：纯动态**
- `vscode-theme.css` 只定义变量名，不设默认值
- 所有值由 `applyAppTheme()` 注入

采用方案 A，好处是：
- 首屏渲染有颜色（避免白屏闪烁）
- 主题切换时动态覆盖
- 兼容现有代码

## 实施步骤

### Step 1: 创建 `src/lib/themes/appThemes.ts`

定义 `AppTheme` 接口和 `APP_THEMES` 数组。

### Step 2: 扩展 `uiSlice.ts`

- 新增 `appThemeIdDark` / `appThemeIdLight` 状态
- 新增 `setAppThemeIdDark` / `setAppThemeIdLight` actions
- 实现 `applyAppTheme()` 函数
- 在 `init()` 和 `setThemeMode()` 中调用 `applyAppTheme()`

### Step 3: 扩展 `storage.ts`

- 新增 `appThemeIdDark` / `appThemeIdLight` 到 Settings 类型
- 持久化到 SQLite settings 表

### Step 4: 修改 `GeneralSection.tsx`

- 添加应用主题选择 UI（复用 ThemeGrid 组件风格）
- 新增 i18n 翻译键

### Step 5: 初始化逻辑

在 `useStore.init()` 中：
1. 加载 saved `appThemeIdDark` / `appThemeIdLight`
2. 根据 `themeMode` 解析当前是 dark 还是 light
3. 调用 `applyAppTheme()` 注入 CSS 变量

### Step 6: 主题切换逻辑

当 `themeMode` 变化或 `appThemeId` 变化时：
1. 解析当前应使用的主题
2. 调用 `applyAppTheme()`

## 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/themes/appThemes.ts` | 新建 | AppTheme 接口 + 内置主题数据 |
| `src/lib/themes/index.ts` | 新建 | Barrel export |
| `src/lib/core/storage.ts` | 修改 | Settings 类型新增 appThemeIdDark/Light |
| `src/store/uiSlice.ts` | 修改 | 新增状态 + actions + applyAppTheme() |
| `src/components/settings/GeneralSection.tsx` | 修改 | 添加应用主题选择 UI |
| `src/lib/core/i18n.ts` | 修改 | 新增翻译键 |
| `vscode-theme.css` | 保留 | 作为 fallback 默认值 |

## 默认值策略

- **新用户**：默认 `jstudio-light` / `jstudio-dark`（保持现有外观）
- **老用户**：升级后保持现有配色（默认值对应当前 VSCode 风格）
- 用户可随时切换到 `ink-light` / `ink-dark` 获得 Anthropic 风格

## 主题卡片 UI 设计

复用 `TerminalSection.tsx` 的 `ThemeGrid` 组件风格：

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│  ┌──────────┐                   │  │  ┌──────────┐                   │
│  │  Preview │  JStudio Light    │  │  │  Preview │  Ink Light        │
│  │   Box    │  ○ ○ ○ ○ ○ ○      │  │  │   Box    │  ○ ○ ○ ○ ○ ○      │
│  └──────────┘                   │  │  └──────────┘                   │
└─────────────────────────────────┘  └─────────────────────────────────┘
```

Preview Box 显示：
- 三层背景色（Activity Bar > Sidebar > Editor）
- 选中边框颜色
- 按钮颜色
- 文字颜色

## 与终端主题的关系

应用主题和终端主题**独立选择**，用户可以：
- 应用使用 `ink-light`，终端使用 `jstudio-light`（混合风格）
- 应用和终端都使用 `ink-light`（统一风格）

这保持了现有终端主题系统的灵活性。

## 预期效果

- 用户在 Settings > General 可以选择应用配色主题
- Light/Dark 各有多个主题可选
- 主题切换即时生效（CSS 变量动态注入）
- 与终端主题系统并行，互不干扰
- 扩展性好，未来可轻松添加更多主题