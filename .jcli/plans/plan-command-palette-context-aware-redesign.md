# 命令面板重构：`>` 前缀 + 上下文感知搜索

## 核心理念

模仿 VSCode 命令面板的经典交互模式：
- 面板打开时，输入框**预填 `>`**，直接进入命令模式
- 用户删掉 `>` → 自动切换到**搜索模式**（搜索内容随当前视图变化）
- 用户输入 `>` → 切回命令模式
- Tab 键也可以在两种模式间切换
- Tab 标签随当前视图动态变化

## 模式判断逻辑

```
query = input 完整文本
isCommandMode = query.trimStart().startsWith('>')
effectiveQuery = isCommandMode ? query去掉>前缀 : query
```

## 搜索上下文（Search Scope）

从 store 状态派生当前视图：

| 当前视图 | 判断条件 | 搜索目标 | 点击行为 |
|---------|---------|---------|---------|
| 文档 | `!isSettingsOpen && activeSidebarView === 'documents'` | `documents` 数组 | `openDocument(id)` |
| 终端 | `!isSettingsOpen && activeSidebarView === 'terminal'` | `sessions` 数组 | `setActiveSession(id)` + 聚焦终端 |
| 设置 | `isSettingsOpen` | 设置分区列表 (general/editor/terminal/help/about) | 跳转到对应分区 |

Tab 标签动态显示：
- 命令模式 Tab：始终显示「命令」
- 搜索模式 Tab：显示「文档」/「终端」/「设置」（取决于当前视图）

## 实施步骤

### Step 1: uiSlice — 新增 settingsActiveSection 状态

**文件**: `src/store/uiSlice.ts`
- 新增 `settingsActiveSection: SectionId` 状态（默认 `'general'`）
- 新增 `setSettingsActiveSection` setter

**文件**: `src/store/storeHelpers.ts`
- 类型声明中添加 `settingsActiveSection` 和 `setSettingsActiveSection`

### Step 2: Settings.tsx — 改用 store 驱动 activeSection

**文件**: `src/components/Settings.tsx`
- 移除 `useState<SectionId>('general')`
- 改用 `useStore` 读取 `settingsActiveSection` 和 `setSettingsActiveSection`
- 这样命令面板就能通过 store 跳转到指定分区

### Step 3: i18n — 新增搜索相关翻译

**文件**: `src/lib/i18n.ts`
- 新增 `palette.tabSettings`、`palette.tabTerminal`
- 新增 `palette.settingsSection.general/editor/terminal/help/about`
- 更新 placeholder 文案

### Step 4: CommandPalette.tsx — 完整重写

**文件**: `src/components/CommandPalette.tsx`

#### 输入框设计
- 模式指示符区域：显示 `>` 或搜索图标，灰色不可编辑
- 实际输入区域：用户只看到 `>` 后面的部分
- 内部状态 `query` 始终包含完整文本（含可能的 `>` 前缀）

#### 键盘交互
- 打开时预填 `query = '>'`
- 输入 `>` 且当前不在命令模式 → 切换到命令模式
- 删掉 `>` 且当前在命令模式 → 切换到搜索模式
- Tab → 切换模式（添加/移除 `>`）
- Backspace 在 `query === '>'` 时 → 阻止删除（保持在命令模式空查询）

#### PaletteItem 类型扩展
```typescript
type PaletteItem =
  | { kind: 'command'; scored: ScoredCommand }
  | { kind: 'document'; doc: DocumentMeta; titleMatch }
  | { kind: 'session'; session: TerminalSession; titleMatch }
  | { kind: 'settings'; sectionId: SectionId; titleMatch }
```

#### 搜索函数
- `filterSessions(sessions, query)` — 搜索 session.customTitle / autoTitle / title
- `filterSettingsSections(query, language)` — 搜索设置分区名称

#### 执行逻辑
- command → `command.perform(store)`
- document → `openDocument(id)`
- session → `setActiveSession(id)` + 关闭面板
- settings → `setSettingsOpen(true)` + `setSettingsActiveSection(id)` + 关闭面板

## 不改动的部分
- commandRegistry.ts 保持不变
- 现有 VSCode 主题变量样式保持不变
- 底部 footer 提示栏保留
- 动画效果保留
