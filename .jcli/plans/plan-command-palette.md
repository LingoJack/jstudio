# 命令面板 (Command Palette) 实现方案

## 目标

将标题栏现有的简单文档搜索框升级为 VS Code 风格的命令面板，支持：
- **文档搜索**（无前缀）— 复用现有 `searchQuery` + `docList` 过滤逻辑
- **命令执行**（`>` 前缀）— 快速切换视图、切换主题、新建文档等
- **键盘驱动** — `Cmd/Ctrl+P` 打开，`Cmd/Ctrl+Shift+P` 以命令模式打开

## 交互设计

### 触发方式
| 操作 | 效果 |
|------|------|
| 点击标题栏搜索框 | 打开面板（文档搜索模式） |
| `Cmd/Ctrl+P` | 打开面板（文档搜索模式） |
| `Cmd/Ctrl+Shift+P` | 打开面板（命令模式，自动填充 `>`） |
| `Esc` / 点击遮罩 | 关闭面板 |

### 面板内的前缀模式（VS Code 式）
| 输入 | 模式 | 显示内容 |
|------|------|----------|
| （无前缀） | 文档搜索 | 过滤后的文档列表 |
| `>xxx` | 命令模式 | 匹配的命令列表 |

### 命令显示格式（`Category: Title` — VS Code 风格）

每条命令在列表中按 VS Code 的方式显示为 **`分类: 命令名`**，搜索时对**分类名和命令名分别匹配**。

例如：
- 输入 `term` → 匹配 `Terminal: Go to Terminal`
- 输入 `nav` → 匹配 `Navigation: Go to Documents` / `Navigation: Go to Terminal` ...
- 输入 `theme` → 匹配 `Appearance: Switch to Dark Theme` ...

在 UI 中，分类部分以淡色渲染，命令名以正常色渲染：
```
  🖥  Terminal: Go to Terminal
       ↑淡色        ↑正常色
```

搜索匹配高亮：命中片段加粗/高亮显示。

### 键盘导航
| 按键 | 行为 |
|------|------|
| `↑` / `↓` | 在结果列表中移动选中项 |
| `Enter` | 执行选中项（打开文档 / 执行命令） |
| `Esc` | 关闭面板 |

### UI 布局

```
┌──────────── TitleBar (h-9) ────────────────┐
│  [lights]  [搜索框 trigger ▾]               │
└──────────────────┬──────────────────────────┘
                   ▼ (浮动遮罩, z-index 高于一切)
         ┌───────── 600px ─────────┐
         │ 🔍 > Go to Terminal     │  ← 输入框
         ├─────────────────────────┤
         │ 📄 New Document    ⌘N   │  ← 结果项
         │ 🖥  Go to Terminal       │
         │ ⚙️  Open Settings        │
         │ 🌙  Toggle Dark Mode     │
         │  ...                     │
         └─────────────────────────┘
```

## 文件变更清单

### 1. 新建 `src/components/CommandPalette.tsx`（核心组件）

**职责**：面板渲染 + 输入处理 + 模式检测 + 键盘导航 + 结果过滤

**内部结构**：
```
CommandPalette
├── 背景遮罩 (fixed inset-0, 点击关闭)
├── 面板容器 (absolute, 居中靠上)
│   ├── 输入行 (图标 + input)
│   └── 结果列表 (scrollable, max-h)
│       └── CommandPaletteItem / DocPaletteItem
```

**状态**（全部组件内 local state，不入 store）：
- `query: string` — 当前输入文本
- `selectedIndex: number` — 当前高亮项索引

**模式检测逻辑**：
```typescript
const isCommandMode = query.startsWith('>');
const effectiveQuery = isCommandMode ? query.slice(1).trim() : query.trim();
```

**结果来源**：
- 命令模式 → `buildCommands(store, t)` 过滤
- 文档模式 → `docList` 按 title 模糊过滤

### 2. 新建 `src/lib/commandRegistry.ts`（命令注册表）

**职责**：集中定义所有可用命令，返回 `Command[]`

```typescript
export interface PaletteCommand {
  id: string;
  icon: LucideIcon;
  /** 命令名（不含分类前缀） */
  titleZh: string;
  titleEn: string;
  /** 分类名，用于 "Category: Title" 显示 */
  categoryZh: string;
  categoryEn: string;
  shortcut?: string;       // 显示用，如 "⌘N"
  keywordsZh?: string[];   // 额外搜索关键词
  keywordsEn?: string[];
  perform: (store: StoreState) => void;
}
```

**首批命令清单**（显示格式 = `Category: Title`）：

| 显示文本 (EN) | 显示文本 (ZH) | 快捷键 | 动作 |
|---------------|---------------|--------|------|
| Navigation: Go to Documents | 导航: 转到文档 | — | `setSettingsOpen(false)` + `setActiveSidebarView('documents')` + 确保 `isSidebarOpen` |
| Navigation: Go to Terminal | 导航: 转到终端 | — | `setSettingsOpen(false)` + `setActiveSidebarView('terminal')` |
| Navigation: Open Settings | 导航: 打开设置 | — | `setSettingsOpen(true)` |
| Document: New Document | 文档: 新建文档 | ⌘N | `createDocument()` |
| Document: Import Markdown | 文档: 导入 Markdown | — | 触发文件选择 |
| View: Toggle Sidebar | 视图: 切换侧边栏 | ⌘B | `toggleSidebar()` |
| View: Toggle Outline | 视图: 切换大纲 | — | `toggleOutline()` |
| Appearance: Toggle Dark Mode | 外观: 切换深色模式 | — | `toggleDarkMode()` |
| Appearance: Switch to Dark Theme | 外观: 切换到深色主题 | — | `setThemeMode('dark')` |
| Appearance: Switch to Light Theme | 外观: 切换到浅色主题 | — | `setThemeMode('light')` |
| Appearance: Switch to System Theme | 外观: 跟随系统主题 | — | `setThemeMode('system')` |

**过滤算法**：将输入分词后对 `category + title + keywords` 做大小写不敏感的子串匹配，评分规则：
- 标题匹配（100 分） > 分类匹配（60 分） > 关键词匹配（30 分）
- 越靠前匹配分数越高
- 最终按总分降序排列

> **设计决策**：命令文本使用内联 zh/en 而非 i18n key，因为每条命令需要中英双语的分类名 + 标题 + 关键词，用独立结构更清晰。i18n 中仅添加面板 UI 文案（占位符、空结果等）。

### 3. 修改 `src/components/SearchBar.tsx`

从「实时搜索 input」改为「打开面板的 trigger」：
- 外观保持不变（仍然像一个搜索框），但变为 `<button>` 或 `readOnly input`
- 点击 → 调用 `setCommandPaletteOpen(true)`
- 显示当前 `searchQuery`（保持视觉一致性，但实际搜索在面板中操作）
- placeholder 改为显示快捷键提示，如 `搜索... (⌘P)`

### 4. 修改 `src/store/uiSlice.ts`

新增状态和方法：
```typescript
// state
isCommandPaletteOpen: false,

// methods
toggleCommandPalette: () => void;
setCommandPaletteOpen: (open: boolean) => void;
```

> 面板的 `query` 不入 store，保持为组件内部状态。原有的 `searchQuery` 保留不变（文档列表仍依赖它做实时过滤）。当在面板中选中文档时，面板会设置 `searchQuery` 以保持侧边栏过滤一致。

### 5. 修改 `src/store/storeHelpers.ts`

在 `StoreState` 接口中声明新增的 `isCommandPaletteOpen`、`toggleCommandPalette`、`setCommandPaletteOpen`。

### 6. 修改 `src/App.tsx`

- 在 `<ToastContainer />` 之前渲染 `<CommandPalette />`
- 添加全局 `useEffect` 键盘监听：
  ```typescript
  // Cmd/Ctrl+P → open palette (doc mode)
  // Cmd/Ctrl+Shift+P → open palette (command mode)
  ```

### 7. 修改 `src/lib/i18n.ts`

新增 key：
```typescript
'palette.placeholder': '搜索文档或输入 > 执行命令…',
'palette.placeholderShort': '搜索…',
'palette.noResults': '无匹配结果',
'palette.shortcutHint': '⌘P',
'palette.section.navigation': '导航',
'palette.section.document': '文档',
'palette.section.view': '视图',
'palette.section.appearance': '外观',
```

## 实现顺序

1. **store 层**：`storeHelpers.ts` + `uiSlice.ts` 添加 palette 状态
2. **命令注册表**：`commandRegistry.ts`
3. **核心组件**：`CommandPalette.tsx`
4. **i18n**：添加新 key
5. **SearchBar 改造**：改为 trigger
6. **App 集成**：渲染组件 + 全局快捷键
7. **验证**：`npx tsc --noEmit` + 手动验证

## 风格约束

- 使用 `--vscode-quickInput-background` 作为面板背景
- 选中项使用 `--vscode-list-activeSelectionBackground`
- 图标统一 `w-4 h-4`，lucide-react
- 圆角 `rounded-lg`，边框 `--vscode-input-border`
- 动画：面板打开时 `opacity + translateY` 过渡（150ms）
- 完全响应式：面板宽度 `min(600px, 90vw)`
