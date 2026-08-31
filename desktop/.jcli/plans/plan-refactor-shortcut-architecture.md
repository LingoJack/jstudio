# 快捷键架构重构计划

## 一、当前架构问题分析

### 1. 处理点散落多处

| 文件 | 处理的 Scope | 监听方式 |
|------|-------------|----------|
| `App.tsx` | `global` | `window.addEventListener('keydown', handler, true)` |
| `TerminalTabs.tsx` | `terminal`（部分：newTab, cycleTab, detachTab） | 同上 |
| `usePaneShortcuts.ts` | `terminal`（分屏：splitPane, focusPane 等） | 同上 |
| TipTap 编辑器 | `editor` | ProseMirror keymap |

**问题**：同一个 `keydown` 事件可能被多个 handler 同时捕获（都在 capture 阶段），导致重复执行或意外拦截。

### 2. Scope 概念未真正生效

`SHORTCUTS` 定义了 `scope: 'global' | 'terminal' | 'editor'`，但实际处理时：

```typescript
// 每个 handler 都要手动判断
if (binding === resolveBinding('terminal.newTab', ov)) {
  if (!isTerminalView) return;  // ← 手动 scope 检查
  ...
}
```

Scope 的语义没有被自动执行，靠开发者记得写 `if (!isTerminalView) return`。

### 3. Action 映射分散

- **App.tsx**：`shortcutCommandMap`（来自 `globalShortcutActions.ts`）映射 shortcutId → action
- **TerminalTabs.tsx / usePaneShortcuts.ts**：直接调用 store 方法（`createSession()`、`splitPane()` 等）

没有统一的 action 注册中心。

### 4. 逻辑重复

每个处理点都有相同的模式：

```typescript
const binding = eventToBinding(e);
if (!binding) return;
const ov = store.keyboardShortcuts;
const isTerminalView = store.activeSidebarView === 'terminal';
if (binding === resolveBinding('xxx', ov)) {
  if (!isTerminalView) return;  // scope 检查
  e.preventDefault();
  e.stopPropagation();
  doAction();
  return;
}
```

---

## 二、目标架构

### 核心原则

1. **单一入口**：所有快捷键（除 editor scope）由一个统一的处理器拦截
2. **Scope 自动激活**：根据当前视图状态自动判断哪些 scope 激活
3. **声明式 Action**：快捷键定义直接关联 action，无需手动 dispatch
4. **零重复逻辑**：scope 检查、preventDefault、eventToBinding 等只写一次

### 架构图

```
keydown 事件
    ↓
ShortcutManager（单一入口，capture 阶段）
    ↓
eventToBinding(event) → "mod+t"
    ↓
查询激活的 scope：
  - global: 始终激活
  - terminal: activeSidebarView === 'terminal'
  - editor: 焦点在编辑器内（交给 TipTap 处理，ShortcutManager 跳过）
    ↓
resolveBinding(shortcutId, overrides)
    ↓
找到匹配的 ShortcutDef，检查 scope 是否激活
    ↓
执行关联的 Action（通过 commandRegistry）
```

---

## 三、具体实现方案

### Step 1: 扩展 ShortcutDef，添加 `actionId` 字段

```typescript
// keyboardShortcuts.ts
export interface ShortcutDef {
  id: string;           // 如 "terminal.newTab"
  category: ShortcutCategory;
  scope: ShortcutScope;
  defaultBinding: ShortcutBinding;
  customizable: boolean;
  labelKey: string;
  descKey?: string;
  actionId?: string;    // 新增：关联的 command ID，默认等于 shortcutId
}
```

### Step 2: 扩展 commandRegistry，注册 terminal commands

目前 `commandRegistry.ts` 只有 global/app 级别的 commands。需要添加：

```typescript
// terminal commands
{
  id: 'terminal.newTab',
  category: 'terminal',
  scope: 'terminal',
  labelKey: 'command.terminal.newTab',
  perform: (store) => store.createSession(),
},
{
  id: 'terminal.splitPane',
  category: 'terminal',
  scope: 'terminal',
  labelKey: 'command.terminal.splitPane',
  perform: (store) => store.splitPane(),
},
// ... 其他 terminal commands
```

### Step 3: 创建 ShortcutManager

```typescript
// lib/shortcuts/ShortcutManager.ts

export class ShortcutManager {
  private activeScopes: Set<ShortcutScope> = new Set(['global']);
  
  // 监听 store 变化，更新 activeScopes
  private syncActiveScopes(store: StoreState) {
    this.activeScopes.clear();
    this.activeScopes.add('global');
    
    if (store.activeSidebarView === 'terminal') {
      this.activeScopes.add('terminal');
    }
    
    // editor scope 由 TipTap 处理，ShortcutManager 跳过
    // 如果焦点在编辑器内且 binding 在 EDITOR_RESERVED 中，不拦截
  }
  
  // 统一的 keydown handler
  private handleKeyDown(e: KeyboardEvent) {
    const binding = eventToBinding(e);
    if (!binding) return;
    
    const store = useStore.getState();
    this.syncActiveScopes(store);
    
    // Editor conflict protection
    if (this.isEditorReserved(binding)) {
      return; // 让 TipTap 处理
    }
    
    // 查找匹配的 shortcut
    for (const def of SHORTCUTS) {
      const effectiveBinding = resolveBinding(def.id, store.keyboardShortcuts);
      if (effectiveBinding !== binding) continue;
      
      // Scope 检查
      if (!this.activeScopes.has(def.scope)) continue;
      
      // 执行 action
      e.preventDefault();
      e.stopPropagation();
      
      const actionId = def.actionId || def.id;
      const command = COMMANDS.find(c => c.id === actionId);
      if (command?.perform) {
        command.perform(store);
      }
      return;
    }
  }
  
  // 启动监听
  start() {
    window.addEventListener('keydown', this.handleKeyDown, true);
  }
  
  stop() {
    window.removeEventListener('keydown', this.handleKeyDown, true);
  }
}
```

### Step 4: 在 App.tsx 中初始化

```typescript
// App.tsx
import { shortcutManager } from './lib/shortcuts/ShortcutManager';

// 在 App 组件挂载时启动
useEffect(() => {
  shortcutManager.start();
  return () => shortcutManager.stop();
}, []);
```

### Step 5: 移除分散的监听点

- **TerminalTabs.tsx**：删除整个 `useEffect` keyboard handler
- **usePaneShortcuts.ts**：删除整个 hook，或保留为空壳（如果其他逻辑需要）
- **App.tsx**：删除 `bindingActionMap` 和相关的 `useEffect` keyboard handler

---

## 四、Editor Scope 的特殊处理

Editor scope 的快捷键（如 `editor.insertBlockBelow`）仍然由 TipTap 的 `addKeyboardShortcuts` 处理，因为：

1. TipTap 需要知道当前编辑器状态（光标位置、选区等）
2. 编辑器事务（Transaction）需要通过 TipTap 的 API 提交
3. 某些快捷键只在特定块类型下生效（如代码块内）

`ShortcutManager` 对 editor scope 的处理策略：

```typescript
// 编辑器保留快捷键集合
const EDITOR_RESERVED = new Set([
  'mod+b', 'mod+i', 'mod+u', 'mod+shift+s', 'mod+e',
  'mod+z', 'mod+shift+z', 'mod+a',
  'mod+enter', 'mod+shift+enter',  // insertBlockBelow/Above
]);

// 在 handleKeyDown 中：
if (this.isEditorFocus() && EDITOR_RESERVED.has(binding)) {
  return; // 让 TipTap 处理
}
```

---

## 五、文件结构重构

```
src/lib/shortcuts/
├── keyboardShortcuts.ts      # SHORTCUTS 定义、类型、工具函数（保留）
├── ShortcutManager.ts        # 新增：统一快捷键处理器
├── globalShortcutActions.ts  # 删除或合并到 commandRegistry
└── index.ts                  # Barrel export
```

---

## 六、实施顺序

1. **扩展 ShortcutDef**（添加 `actionId` 字段）
2. **扩展 commandRegistry**（添加 terminal commands）
3. **创建 ShortcutManager**（核心逻辑）
4. **在 App.tsx 初始化 ShortcutManager**
5. **清理 TerminalTabs.tsx 的键盘监听**
6. **删除 usePaneShortcuts.ts**
7. **清理 App.tsx 的旧 keyboard handler**
8. **类型检查 + 测试**

---

## 七、预期收益

| 方面 | 当前 | 重构后 |
|------|------|--------|
| 事件监听点 | 3+ 处 | 1 处 |
| Scope 检查 | 手动写 `if` | 自动生效 |
| Action 映射 | 分散在 2 个系统 | 统一在 commandRegistry |
| 重复逻辑 | 每个处理点重复 | 零重复 |
| 新增快捷键 | 需改多处 | 只改 SHORTCUTS + commandRegistry |
| 维护难度 | 高 | 低 |