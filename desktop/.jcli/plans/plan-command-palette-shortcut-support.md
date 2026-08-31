# 命令面板快捷键支持

## 问题分析

当前 `CommandPalette.tsx` 中的命令有两类快捷键问题：

1. **硬编码的假快捷键**：`doc.new` 显示 `⌘N`、`view.sidebar` 显示 `⌘B`，但这些快捷键**实际并不生效**——它们只是 `commandRegistry.ts` 中的静态展示字符串，没有注册到 `SHORTCUTS` 注册表中，也没有全局键盘监听。
2. **更多命令无快捷键**：`view.outline`、`nav.settings` 等命令既不显示也不支持快捷键。

而 `ShortcutsSection.tsx` 的设置页面已经能自动渲染 `SHORTCUTS` 注册表中的所有条目——所以只要把新快捷键注册进去，设置页就会自动展示，无需额外修改。

## 方案设计

### 核心思路

```
commandRegistry.ts                    shortcuts.ts
┌──────────────────┐                ┌──────────────────────┐
│ PaletteCommand   │                │ SHORTCUTS[]          │
│  .shortcutId ────┼───────────────>│  app.newDocument     │
│  (引用注册表 ID)  │                │  app.toggleSidebar   │
└──────────────────┘                │  app.toggleOutline   │
       │                            │  app.openSettings    │
       │ perform(store)             └──────────────────────┘
       ▼                                      │
  CommandPalette.tsx                          │ resolveBinding()
  ┌──────────────────┐                        ▼
  │ PaletteRow       │◄──────────────── bindingToDisplay()
  │ 动态解析展示按键  │                (从注册表解析当前绑定)
  └──────────────────┘
                                                │
  App.tsx / useAppShortcuts.ts                  │
  ┌──────────────────┐                         │
  │ 全局 keydown     │◄────────────────────────┘
  │ eventToBinding → │  匹配 → 执行 command.perform(store)
  │ resolveBinding   │  编辑器内冲突 → 跳过
  └──────────────────┘
```

### 要注册的新快捷键

| Shortcut ID | 默认绑定 | 对应命令 | 说明 |
|---|---|---|---|
| `app.newDocument` | `mod+n` | `doc.new` | 新建文档 |
| `app.toggleSidebar` | `mod+b` | `view.sidebar` | 切换侧边栏 |
| `app.toggleOutline` | `mod+shift+o` | `view.outline` | 切换大纲 |
| `app.openSettings` | `mod+,` | `nav.settings` | 打开设置 |

> **`mod+b` 冲突处理**：`mod+b` 在编辑器内是粗体（TipTap 原生处理）。全局监听器在检测到焦点位于 `[contenteditable]` / `[data-editor-surface]` 内时，若按下的组合键属于已知编辑器格式化快捷键集合（`mod+b`, `mod+i`, `mod+u`, `mod+e`, `mod+shift+s`），则跳过执行，让编辑器优先处理。非编辑状态下 `mod+b` 正常切换侧边栏。

## 实施步骤（5 个文件）

### 1. `src/lib/shortcuts.ts` — 注册新快捷键

在 `SHORTCUTS` 数组的 General 区域追加 4 条定义：
```ts
{ id: 'app.newDocument',  category: 'general', scope: 'global', defaultBinding: 'mod+n',         customizable: true, labelKey: 'shortcut.app.newDocument',  descKey: '...' },
{ id: 'app.toggleSidebar',category: 'general', scope: 'global', defaultBinding: 'mod+b',         customizable: true, labelKey: 'shortcut.app.toggleSidebar',descKey: '...' },
{ id: 'app.toggleOutline',category:'general', scope: 'global', defaultBinding: 'mod+shift+o',   customizable: true, labelKey: 'shortcut.app.toggleOutline',descKey: '...' },
{ id: 'app.openSettings', category: 'general', scope: 'global', defaultBinding: 'mod+,',         customizable: true, labelKey: 'shortcut.app.openSettings', descKey: '...' },
```

### 2. `src/lib/i18n.ts` — 添加 i18n 键

在 zh 和 en 各添加 4 组 label + desc 键。

### 3. `src/lib/commandRegistry.ts` — 改用 shortcutId 引用

- 将 `PaletteCommand.shortcut?: string` 改为 `shortcutId?: string`
- `doc.new`：`shortcut: '⌘N'` → `shortcutId: 'app.newDocument'`
- `view.sidebar`：`shortcut: '⌘B'` → `shortcutId: 'app.toggleSidebar'`
- `view.outline`：新增 `shortcutId: 'app.toggleOutline'`
- `nav.settings`：新增 `shortcutId: 'app.openSettings'`

### 4. `src/components/CommandPalette.tsx` — 动态解析快捷键展示

在 `PaletteRow` 的 command 渲染分支中，将 `command.shortcut` 改为通过 `resolveBinding(command.shortcutId, overrides)` + `bindingToDisplay()` 动态解析。需要将 `overrides` 传入 `PaletteRow`（或直接在父组件解析后传入展示字符串）。

### 5. `src/App.tsx` — 添加全局快捷键监听

在现有的 `app.commandPalette` 监听器旁，扩展为处理所有带 `shortcutId` 的命令：
- 构建 shortcutId → command 的映射（从 `buildCommands()` 中筛选有 `shortcutId` 的命令）
- 对每个按下的组合键，检查是否匹配某个 shortcutId
- 编辑器冲突保护：若焦点在 contenteditable 内且匹配编辑器保留快捷键集合，跳过
- 匹配则执行 `command.perform(useStore.getState())`

## 不需要修改的文件

- **`ShortcutsSection.tsx`**：已通过 `CATEGORY_ORDER` + `getShortcutsByCategory()` 自动渲染所有 `SHORTCUTS` 条目，新增的 general 类快捷键会自动出现在设置页中。
- **`store/uiSlice.ts`**：`keyboardShortcuts` 状态和 `setKeyboardShortcut` / `resetKeyboardShortcut` 方法已通用，无需修改。
- **冲突检测**：`detectConflicts` / `checkBindingConflict` 已通用，新快捷键注册后自动参与冲突检测。

## 验证

1. `npx tsc --noEmit` 通过
2. `npm run build` 通过
3. 手动测试：
   - `⌘N` 新建文档（非编辑状态下生效）
   - `⌘B` 在非编辑状态切换侧边栏，在编辑器内仍执行粗体
   - `⌘⇧O` 切换大纲
   - `⌘,` 打开设置
   - 设置页 → 快捷键 → General 分类下出现 4 条新快捷键，可重绑
   - 命令面板中对应命令显示正确的快捷键提示（重绑后同步更新）
