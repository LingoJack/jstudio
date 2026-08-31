# 快捷键管理 Settings Section 实施计划

## 一、目标

在 Settings 页面新增「快捷键」section，实现：
1. **统一展示**所有应用内快捷键（可定制 + 只读）
2. **用户自定义**可定制快捷键的按键绑定
3. **冲突检测**——同 scope 下按键组合重复时高亮警告
4. **持久化**——自定义绑定存入 `settings.json`

> 范围：应用内快捷键（Phase 1）。编辑器格式化类（TipTap 内置 Bold/Italic 等）和 Markdown 输入类本期只做只读展示，不参与重绑定。

---

## 二、快捷键盘点与分类

### 可定制（Customizable）—— Phase 1 重点

| ID | 分类 | scope | 默认绑定 | 说明 | 实现位置 |
|----|------|-------|----------|------|----------|
| `app.commandPalette` | 通用 | global | `Mod+P` | 打开命令面板 | `App.tsx` |
| `terminal.newTab` | 终端·标签页 | terminal | `Mod+T` | 新建标签页 | `TerminalTabs.tsx` |
| `terminal.closeTab` | 终端·标签页 | terminal | `Mod+W` | 关闭标签页 | `usePaneShortcuts.ts` |
| `terminal.cycleTabLeft` | 终端·标签页 | terminal | `Mod+Shift+ArrowLeft` | 切换到左标签页 | `TerminalTabs.tsx` |
| `terminal.cycleTabRight` | 终端·标签页 | terminal | `Mod+Shift+ArrowRight` | 切换到右标签页 | `TerminalTabs.tsx` |
| `terminal.splitPane` | 终端·分屏 | terminal | `Mod+Enter` | 分屏 | `usePaneShortcuts.ts` |
| `terminal.closePane` | 终端·分屏 | terminal | `Mod+Shift+W` | 仅关闭当前面板 | `usePaneShortcuts.ts` |
| `terminal.focusPrevPane` | 终端·分屏 | terminal | `Mod+ArrowLeft` | 焦点切到上一面板 | `usePaneShortcuts.ts` |
| `terminal.focusNextPane` | 终端·分屏 | terminal | `Mod+ArrowRight` | 焦点切到下一面板 | `usePaneShortcuts.ts` |
| `terminal.cycleLayout` | 终端·分屏 | terminal | `Mod+Shift+L` | 循环面板布局 | `usePaneShortcuts.ts` |
| `terminal.movePane` | 终端·分屏 | terminal | `Mod+Shift+F` | 移动面板位置 | `usePaneShortcuts.ts` |
| `editor.insertBlockBelow` | 编辑器·块操作 | editor | `Mod+Enter` | 下方插入空行 | `blockNavigation.ts` |
| `editor.insertBlockAbove` | 编辑器·块操作 | editor | `Mod+Shift+Enter` | 上方插入空行 | `blockNavigation.ts` |

### 只读展示（Display-only）—— Phase 1 不参与重绑定

| 分类 | 快捷键 | 说明 |
|------|--------|------|
| 编辑器·格式化 | `Mod+B / I / U / E` | 加粗/斜体/下划线/行内代码 |
| 编辑器·格式化 | `Mod+Shift+S` | 删除线 |
| 编辑器·格式化 | `Mod+Z / Mod+Shift+Z` | 撤销/重做 |
| 编辑器·格式化 | `Mod+A` | 全选（自定义 SelectAllText 扩展） |
| Markdown 输入 | `# / ## / ### / > / - / 1. / \`\`\` / ---` | Markdown 快捷输入 |
| Slash 菜单 | `/` | 唤出斜杠菜单 |

> 只读区域直接复用现有 `HelpSection.tsx` 中的数据结构思路（EDITOR_SHORTCUT_ROWS / MARKDOWN_ROWS），但以更紧凑的卡片形式嵌入新 section 底部，作为「参考」区域。

---

## 三、架构设计

### 3.1 新增文件

```
src/
├── lib/
│   └── shortcuts.ts                     # 快捷键注册表 + 绑定格式 + 冲突检测
├── hooks/
│   └── useResolvedShortcut.ts           # 读取 store 中用户自定义绑定
├── store/
│   ├── uiSlice.ts                       # 新增 keyboardShortcuts 状态 + setter
│   └── storeHelpers.ts                  # StoreState 接口新增字段
└── components/
    └── settings/
        └── ShortcutsSection.tsx         # 新的 Settings section 组件
```

### 3.2 核心数据结构 — `lib/shortcuts.ts`

```typescript
/** 快捷键作用域——决定冲突检测的范围 */
export type ShortcutScope = 'global' | 'terminal' | 'editor';

/** 快捷键分类——用于 UI 分组 */
export type ShortcutCategory = 'general' | 'terminal-tabs' | 'terminal-panes' | 'editor-blocks';

/**
 * 绑定字符串格式（归一化、小写）：
 *   "mod+p"            → Cmd/Ctrl + P
 *   "mod+shift+arrowleft" → Cmd/Ctrl + Shift + ←
 *   "mod+enter"        → Cmd/Ctrl + Enter
 *
 * 修饰键顺序固定: mod → alt → shift → key
 * "mod" 在 Mac 上映射为 ⌘，Windows 上映射为 Ctrl
 */
export type ShortcutBinding = string;

/** 单条快捷键定义 */
export interface ShortcutDef {
  /** 唯一标识，如 "app.commandPalette" */
  id: string;
  /** 分类（UI 分组用） */
  category: ShortcutCategory;
  /** 作用域（冲突检测用） */
  scope: ShortcutScope;
  /** 默认绑定，如 "mod+p" */
  defaultBinding: ShortcutBinding;
  /** 是否允许用户重绑定 */
  customizable: boolean;
  /** i18n key 前缀，自动派生 labelKey / descKey */
  labelKey: string;
}

/** 快捷键注册表——所有快捷键的唯一真实来源 */
export const SHORTCUTS: ShortcutDef[] = [ ... ];

/** 用户自定义覆盖表: { "terminal.newTab": "mod+shift+t", ... } */
export type ShortcutOverrides = Record<string, ShortcutBinding>;

/** 将 e.key / e.code + 修饰键 → 归一化绑定字符串 */
export function eventToBinding(e: KeyboardEvent): ShortcutBinding | null;

/** 将绑定字符串 → 平台显示字符串（如 "mod+p" → "⌘P" / "Ctrl+P"） */
export function bindingToDisplay(binding: ShortcutBinding): string;

/** 从 store 中解析某条快捷键的当前绑定（用户覆盖 > 默认） */
export function resolveBinding(
  id: string,
  overrides: ShortcutOverrides | undefined,
): ShortcutBinding;

/** 冲突检测：返回同 scope 下的冲突对列表 */
export function detectConflicts(
  overrides: ShortcutOverrides | undefined,
): Map<ShortcutBinding, ShortcutDef[]>;
```

### 3.3 Store 变更 — `uiSlice.ts` + `storeHelpers.ts`

**uiSlice.ts** 新增：
```typescript
// 状态
keyboardShortcuts: ShortcutOverrides;          // {} 默认空（全用默认值）

// 方法
setKeyboardShortcut: (id: string, binding: string) => void;   // 设置单条
resetKeyboardShortcut: (id: string) => void;                   // 重置单条
resetAllKeyboardShortcuts: () => void;                         // 重置全部
```

**持久化**：`setKeyboardShortcut` 内部调用 `storage.saveSettings({ keyboardShortcuts })`，与现有 `fontId`、`themeMode` 等的持久化模式完全一致。

**storeHelpers.ts** 新增 `keyboardShortcuts` 字段 + 3 个方法签名到 `StoreState`。

**storage.ts** 的 `AppSettings` 接口新增 `keyboardShortcuts?: ShortcutOverrides`（已有 `[key: string]: unknown` 索引签名，但显式声明更清晰）。

**init 加载**：在 `App.tsx` 的 `loadSettings` 回调中，读取 `settings.keyboardShortcuts` 并写入 store。

### 3.4 冲突检测逻辑

```
检测规则：
1. 将所有快捷键（含默认和用户覆盖）按 scope 分组
2. 同一 scope 内，如果两条快捷键的绑定完全相同 → 冲突
3. 跨 scope 不算冲突（如 terminal 的 Mod+Enter 和 editor 的 Mod+Enter）
4. 用户正在录制新绑定时，实时检测目标 scope 下是否已有其他快捷键占用了该组合
```

冲突展示：在 ShortcutsSection UI 中，冲突行标红 + 显示冲突的对方快捷键名称。

---

## 四、UI 设计 — `ShortcutsSection.tsx`

### 4.1 Settings 导航集成

在 `Settings.tsx` 的 `NAV_ITEMS` 中新增：

```typescript
{
  id: 'shortcuts',                                    // SettingsSectionId 新增 'shortcuts'
  labelKey: 'settings.shortcuts',
  icon: Keyboard,                                     // lucide-react 的 Keyboard 图标
  subItems: [
    { anchorId: 'settings-shortcuts-general',  labelKey: 'shortcuts.category.general' },
    { anchorId: 'settings-shortcuts-terminal', labelKey: 'shortcuts.category.terminal' },
    { anchorId: 'settings-shortcuts-editor',   labelKey: 'shortcuts.category.editor' },
    { anchorId: 'settings-shortcuts-reference', labelKey: 'shortcuts.reference' },
  ],
},
```

`SettingsSectionId` 类型扩展：`'general' | 'editor' | 'terminal' | 'shortcuts' | 'help' | 'about'`

### 4.2 ShortcutsSection 布局

```
┌─────────────────────────────────────────────────────┐
│ ⌨ 快捷键                                             │
│ 自定义应用内的键盘快捷键。                           │
│                                                       │
│ ── 通用 ──────────────────────────────────────────── │
│  打开命令面板            [ ⌘P ] ← 点击重新绑定       │
│                                                       │
│ ── 终端 · 标签页 ──────────────────────────────────  │
│  新建标签页              [ ⌘T ]                       │
│  关闭标签页              [ ⌘W ]                       │
│  切换到左标签页          [ ⌘⇧← ]                      │
│  切换到右标签页          [ ⌘⇧→ ]                      │
│                                                       │
│ ── 终端 · 分屏 ────────────────────────────────────  │
│  分屏                    [ ⌘↵ ]                       │
│  关闭面板                [ ⌘⇧W ]                      │
│  ...                                                  │
│                                                       │
│ ── 编辑器 · 块操作 ────────────────────────────────  │
│  下方插入空行            [ ⌘↵ ]                       │
│  上方插入空行            [ ⌘⇧↵ ]                      │
│                                                       │
│ ⚠ 冲突提示（如有）                                    │
│                                                       │
│ ── 参考快捷键（只读）──────────────────────────────  │
│  [折叠] 编辑器格式化  Bold ⌘B  Italic ⌘I  ...       │
│  [折叠] Markdown 输入  # → H1  ## → H2  ...          │
│                                                       │
│ ── 重置 ───────────────────────────────────────────  │
│                              [ 重置全部为默认值 ]     │
└─────────────────────────────────────────────────────┘
```

### 4.3 绑定录制交互

1. 快捷键行右侧是一个类 `kbd` 样式的按钮，显示当前绑定（如 `⌘P`）
2. 点击后进入录制模式：按钮变为 `按下快捷键...`，带脉冲动画
3. 监听下一个 `keydown` 事件：
   - 调用 `eventToBinding(e)` 转为绑定字符串
   - 如果按下 `Escape` → 取消录制
   - 如果按下单独的修饰键（Shift/Ctrl/Cmd/Alt）→ 等待，不结束
   - 检测同 scope 下是否有冲突，有则显示警告但不阻止保存（用户可选择覆盖）
4. 录制完成后自动退出，调用 `setKeyboardShortcut(id, binding)` 持久化
5. 行右侧出现 `重置` 小按钮（仅当该快捷键有自定义覆盖时显示）

### 4.4 冲突 UI

```
┌─────────────────────────────────────────────────────┐
│  ⚠ 冲突: "关闭标签页" 和 "关闭面板" 在终端作用域     │
│    共用 ⌘W。请修改其中一个。                         │
│                                                       │
│  关闭标签页        [ ⌘W ] ← 红色高亮                  │
│  关闭面板          [ ⌘W ] ← 红色高亮                  │
└─────────────────────────────────────────────────────┘
```

---

## 五、集成改造（让现有快捷键读取自定义绑定）

### 5.1 `App.tsx` — 命令面板快捷键

**现状**：硬编码 `e.metaKey || e.ctrlKey` + `e.key === 'p'`

**改造**：
```typescript
const handler = (e: KeyboardEvent) => {
  const binding = eventToBinding(e);
  if (!binding) return;
  const target = resolveBinding('app.commandPalette', get().keyboardShortcuts);
  if (binding === target) {
    e.preventDefault();
    get().toggleCommandPalette();
  }
};
```

### 5.2 `usePaneShortcuts.ts` — 终端分屏快捷键

**现状**：6 个 if-else 分支，硬编码每个 key

**改造**：
```typescript
const handler = (e: KeyboardEvent) => {
  const binding = eventToBinding(e);
  if (!binding) return;

  const ov = useStore.getState().keyboardShortcuts;

  if (binding === resolveBinding('terminal.splitPane', ov)) { ... }
  if (binding === resolveBinding('terminal.cycleLayout', ov)) { ... }
  if (binding === resolveBinding('terminal.movePane', ov)) { ... }
  if (binding === resolveBinding('terminal.focusPrevPane', ov)) { ... }
  if (binding === resolveBinding('terminal.focusNextPane', ov)) { ... }
  if (binding === resolveBinding('terminal.closeTab', ov)) { ... }
  if (binding === resolveBinding('terminal.closePane', ov)) { ... }
};
```

### 5.3 `TerminalTabs.tsx` — 终端标签页快捷键

同上模式，改造 `Mod+T`、`Mod+Shift+←/→`。

### 5.4 `blockNavigation.ts` — 编辑器块操作

**现状**：使用 TipTap 的 `addKeyboardShortcuts`，返回 `{ 'Mod-Enter': handler, 'Mod-Shift-Enter': handler }`

**改造**：
```typescript
addKeyboardShortcuts() {
  const ov = useStore.getState().keyboardShortcuts;
  const below = resolveBinding('editor.insertBlockBelow', ov);  // "mod+enter"
  const above = resolveBinding('editor.insertBlockAbove', ov);  // "mod+shift+enter"

  const map: Record<string, ReturnType<...>> = {};
  map[below] = onModEnter;
  map[above] = onModShiftEnter;
  // ... 其他非自定义的快捷键（ArrowUp/Down/Left/Backspace）保持不变
  return map;
}
```

> **注意**：TipTap 的 keymap 格式使用 `Mod-Enter`（连字符 + 首字母大写），需要在 `resolveBinding` 返回的 `mod+enter` 格式与 TipTap 格式间做转换。提供一个 `toTiptapBinding(binding)` 辅助函数。

---

## 六、实施步骤

### Step 1: 创建快捷键核心模块 `lib/shortcuts.ts`
- 定义 `ShortcutDef`、`ShortcutScope`、`ShortcutCategory` 类型
- 定义 `SHORTCUTS` 注册表数组（13 条可定制 + 8 条只读格式化 + 8 条 Markdown）
- 实现 `eventToBinding()` — KeyboardEvent → 归一化绑定字符串
- 实现 `bindingToDisplay()` — 绑定字符串 → 平台显示字符串
- 实现 `resolveBinding()` — id + overrides → 当前绑定
- 实现 `detectConflicts()` — 冲突检测
- 实现 `toTiptapBinding()` — 绑定字符串 → TipTap 格式

### Step 2: 扩展 Store
- `uiSlice.ts`：新增 `keyboardShortcuts` 状态 + `setKeyboardShortcut` / `resetKeyboardShortcut` / `resetAllKeyboardShortcuts`
- `storeHelpers.ts`：`StoreState` 接口新增对应类型声明
- `storage.ts`：`AppSettings` 接口显式声明 `keyboardShortcuts?`

### Step 3: 创建 Settings UI 组件 `ShortcutsSection.tsx`
- 快捷键列表（分组展示）
- 绑定录制交互（点击 → 录制 keydown → 保存）
- 冲突检测 UI（红色高亮 + 冲突说明）
- 重置按钮（单条重置 + 全部重置）
- 只读参考区域（编辑器格式化 + Markdown 输入）

### Step 4: 集成到 Settings 导航
- `Settings.tsx`：NAV_ITEMS 新增 shortcuts section
- `uiSlice.ts`：`SettingsSectionId` 新增 `'shortcuts'`

### Step 5: 改造现有快捷键监听器
- `App.tsx`：命令面板快捷键读取自定义绑定
- `usePaneShortcuts.ts`：终端分屏快捷键读取自定义绑定
- `TerminalTabs.tsx`：终端标签页快捷键读取自定义绑定
- `blockNavigation.ts`：编辑器块操作快捷键读取自定义绑定

### Step 6: i18n
- `lib/i18n.ts`：新增快捷键相关的中英文翻译 key

### Step 7: 初始化加载
- `App.tsx` 的 init 流程中，读取 `settings.keyboardShortcuts` 写入 store

### Step 8: 类型检查 + 测试
- `npx tsc --noEmit`
- 手动测试：录制、冲突检测、重置、持久化

---

## 七、注意事项

1. **eventToBinding 的 key 归一化**：`e.key` 在不同键盘布局/输入法下可能不稳定，需要同时检查 `e.code`（如 `KeyP` vs `KeyP`）。优先用 `e.key.toLowerCase()`，特殊键（方向键、Enter 等）用 `e.code` 作为 fallback。

2. **TipTap keymap 格式转换**：TipTap 使用 `Mod-Enter`（连字符分隔，首字母大写），我们的内部格式是 `mod+enter`（加号分隔，全小写）。在 blockNavigation 中需要转换。

3. **录制模式的全局监听**：录制时需要一个 capture 阶段的 `keydown` 监听器，`e.preventDefault()` + `e.stopPropagation()` 阻止所有其他处理，只消费这一次按键。

4. **不参与自定义的快捷键**：TipTap 的 Bold/Italic 等来自 StarterKit 扩展，自定义需要替换为自定义 Extension 并动态修改 keymap，复杂度高。Phase 1 只做展示。

5. **Rust 后端无需改动**：`settings.json` 已通过通用的 `read_settings` / `write_settings` 命令读写，`keyboardShortcuts` 作为 JSON 字段自动序列化。
