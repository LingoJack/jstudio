# 全局快捷键系统 (Global Shortcut System)

## 目标

实现一个 OS 级别的全局快捷键系统：用户在应用外按快捷键 → 触发预设动作（如弹出独立 CommandPalette 窗口、在指定目录打开终端并执行命令等）。系统需具备高扩展性，后续新增任意动作类型只需注册 handler，无需改动核心流程。

## 核心设计理念

全局快捷键与应用内快捷键是**完全不同的机制**，必须分离：

| 维度 | 应用内快捷键 (现有 `shortcuts.ts`) | 全局快捷键 (本方案) |
|------|------|------|
| 捕获方 | 浏览器 JS `keydown` 事件 | OS 底层钩子 → Rust `tauri-plugin-global-shortcut` |
| 触发条件 | 窗口聚焦时 | 任何应用前台时 |
| 数据源 | `SHORTCUTS` 数组 + `keyboardShortcuts` overrides | `globalShortcuts` 配置数组（新字段） |
| 冲突域 | 各 scope 内部 (`global` / `terminal` / `editor`) | 全局快捷键之间 + 与 OS 系统快捷键 |
| 设置页 | `ShortcutsSection.tsx` | `GlobalShortcutsSection.tsx`（新页面） |

**不冲突**：两套系统的数据完全独立，各自有独立的设置区域。

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  OS 层                                                      │
│  用户在任意应用中按下 Cmd+Shift+P                           │
│  → tauri-plugin-global-shortcut 捕获                        │
│  → Rust handler 触发                                        │
└───────────────────────┬─────────────────────────────────────┘
                        │ app.emit("global-shortcut-triggered", actionConfig)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  前端 (main window, 即使被遮挡也在运行)                      │
│  监听 "global-shortcut-triggered" 事件                      │
│  → 从 ActionHandlerRegistry 查找 handler                    │
│  → 执行 handler(actionParams)                               │
│                                                             │
│  内置 Action Handlers:                                      │
│  ┌─────────────────┐ ┌──────────────────┐ ┌──────────────┐ │
│  │ open-panel      │ │ open-terminal    │ │ toggle-window│ │
│  │ (CommandPalette │ │ (cwd + command)  │ │ (show/hide)  │ │
│  │  独立窗口)      │ │                  │ │              │ │
│  └─────────────────┘ └──────────────────┘ └──────────────┘ │
│                                                             │
│  扩展方式: registerActionHandler('my-action', handler)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 文件变更清单

### Rust 后端 (5 个文件)

#### 1. `src-tauri/Cargo.toml` — 添加依赖

```toml
tauri-plugin-global-shortcut = "2"
```

#### 2. `src-tauri/src/commands/global_shortcut.rs` — 新文件

核心命令：

| 命令 | 功能 |
|------|------|
| `register_global_shortcut(app, shortcut_str, action_config_json)` | 注册单个全局快捷键，handler 内 emit 事件 |
| `unregister_global_shortcut(app, shortcut_str)` | 注销单个 |
| `unregister_all_global_shortcuts(app)` | 注销全部（设置变更时先清后注） |

**快捷键格式转换**：前端内部格式 `"mod+shift+p"` → Rust 端转换为 `Shortcut` 类型：
- `"mod"` → macOS 用 `SUPER` (⌘), Windows/Linux 用 `CONTROL` (Ctrl)，通过 `#[cfg(target_os)]` 条件编译
- `"alt"` → `ALT`
- `"shift"` → `SHIFT`
- 字母键 → `Code::KeyP` 等

handler 逻辑：
```rust
app.global_shortcut().on_shortcut(sc, move |app, _sc, event| {
    if event.state == ShortcutState::Pressed {
        let _ = app.emit("global-shortcut-triggered", &action_config);
    }
}).map_err(|e| e.to_string())?;
```

#### 3. `src-tauri/src/commands/mod.rs` — 注册模块

```rust
pub mod global_shortcut;
```

#### 4. `src-tauri/src/lib.rs` — 注册插件 + 命令

```rust
// 插件注册
.plugin(tauri_plugin_global_shortcut::Builder::new().build())

// 命令注册到 generate_handler!
global_shortcut::register_global_shortcut,
global_shortcut::unregister_global_shortcut,
global_shortcut::unregister_all_global_shortcuts,
```

#### 5. `src-tauri/capabilities/default.json` — 添加权限

```json
"global-shortcut:allow-register",
"global-shortcut:allow-unregister",
"global-shortcut:allow-unregister-all"
```

---

### 前端核心 (4 个新文件 + 5 个修改)

#### 6. `src/lib/globalShortcuts.ts` — 新文件（核心类型 + 注册引擎）

```typescript
// ── 类型定义 ──

/** 全局快捷键动作类型（可扩展） */
type GlobalShortcutActionType = 'open-panel' | 'open-terminal' | 'toggle-window' | string;

/** 动作参数字段定义（用于设置 UI 动态渲染） */
interface ActionParamField {
  key: string;
  labelKey: string;           // i18n key
  type: 'text' | 'select' | 'directory';
  placeholder?: string;
  options?: { value: string; labelKey: string }[];
  defaultValue?: unknown;
}

/** 动作类型定义（注册到 registry） */
interface GlobalShortcutActionDef {
  type: GlobalShortcutActionType;
  labelKey: string;           // i18n key for display name
  descriptionKey: string;
  icon: LucideIcon;           // 或 string icon name
  paramFields: ActionParamField[];
  handler: (params: Record<string, unknown>, ctx: ActionContext) => void | Promise<void>;
}

/** 单条全局快捷键配置（存储在 settings.json） */
interface GlobalShortcutConfig {
  id: string;                 // "gs-{timestamp}"
  enabled: boolean;
  shortcut: string;           // "mod+shift+p" 格式
  actionType: GlobalShortcutActionType;
  actionLabel: string;        // 用户自定义名称
  actionParams: Record<string, unknown>;
}

/** 执行上下文 */
interface ActionContext {
  appWindow: Window;          // Tauri 当前窗口
  emit: (event: string, payload?: unknown) => void;
}
```

**核心函数**：

```typescript
// 动作注册表（插件式扩展）
const ACTION_REGISTRY = new Map<string, GlobalShortcutActionDef>();
export function registerActionDef(def: GlobalShortcutActionDef): void;
export function getActionDef(type: string): GlobalShortcutActionDef | undefined;
export function getAllActionDefs(): GlobalShortcutActionDef[];

// 执行动作
export async function executeAction(config: GlobalShortcutConfig, ctx: ActionContext): Promise<void>;

// 同步快捷键到 Rust（注册/注销）
export async function syncGlobalShortcuts(configs: GlobalShortcutConfig[]): Promise<void>;
// 内部：先 unregister_all，再逐个 register

// 快捷键格式转换（内部 "mod+shift+p" → Rust 兼容格式）
function toRustShortcutFormat(binding: string): string;
```

#### 7. `src/lib/globalShortcutActions.ts` — 新文件（内置动作 handler）

注册所有内置动作到 `ACTION_REGISTRY`：

**`open-panel`** — 打开独立浮窗面板
```typescript
registerActionDef({
  type: 'open-panel',
  labelKey: 'globalShortcut.action.openPanel',
  icon: LayoutGrid,
  paramFields: [
    {
      key: 'panelId',
      type: 'select',
      options: [
        { value: 'command-palette', labelKey: '...' },
        // 未来可扩展：bookmark-panel, quick-note 等
      ],
      defaultValue: 'command-palette',
    }
  ],
  handler: async (params) => {
    const panelId = params.panelId as string;
    // 根据 panelId 打开对应窗口
    if (panelId === 'command-palette') {
      new WebviewWindow(`cp-${Date.now()}`, {
        url: 'index.html?window=command-palette',
        // Spotlight 风格：无边框、居中、透明
        decorations: false,
        transparent: true,
        width: 640,
        height: 72,       // 初始高度小，展开后自适应
        resizable: false,
        alwaysOnTop: true,
        center: true,
        focus: true,
        // skipTaskbar: true,
      });
    }
  },
});
```

**`open-terminal`** — 在指定目录打开终端，可选执行命令
```typescript
registerActionDef({
  type: 'open-terminal',
  labelKey: 'globalShortcut.action.openTerminal',
  icon: TerminalSquare,
  paramFields: [
    {
      key: 'cwd',
      type: 'directory',           // 目录选择器
      placeholder: '~',
      defaultValue: '~',
    },
    {
      key: 'command',
      type: 'text',
      placeholder: '可选：要执行的命令',
    },
  ],
  handler: async (params) => {
    const cwd = (params.cwd as string) || '~';
    const command = params.command as string | undefined;
    // 1. 创建新 PTY 会话
    const session = await invoke<SessionInfo>('pty_create', {
      params: { cwd, cols: 80, rows: 24 },
    });
    // 2. 如有命令，写入 PTY
    if (command) {
      await invoke('pty_write', { sessionId: session.id, data: command + '\n' });
    }
    // 3. 打开终端窗口，传入 sessionId
    const label = `terminal-${Date.now()}`;
    new WebviewWindow(label, {
      url: `index.html?window=terminal&label=${label}&mode=new&session=${session.id}`,
      title: '终端',
      width: 900, height: 600,
      // ...
    });
  },
});
```

**`toggle-window`** — 显示/隐藏主窗口
```typescript
registerActionDef({
  type: 'toggle-window',
  labelKey: 'globalShortcut.action.toggleWindow',
  icon: Eye,
  paramFields: [],
  handler: async (_, ctx) => {
    const win = getCurrentWindow();
    if (await win.isVisible()) {
      await win.hide();
    } else {
      await win.show();
      await win.setFocus();
    }
  },
});
```

#### 8. `src/components/CommandPaletteWindow.tsx` — 新文件（独立 CommandPalette 窗口）

Spotlight/Raycast 风格的独立搜索窗口：

- 复用 `CommandPalette.tsx` 中的搜索/高亮/键盘导航逻辑
- 但数据获取方式不同：
  - 文档列表：直接从 `storage.loadIndex()` 加载（只读）
  - 终端会话：直接从 `pty_list()` 加载（只读）
  - 不依赖 Zustand store（因为这是独立窗口，没有主窗口的 store 状态）
- 选中条目后：
  - emit `command-palette-select` 事件到主窗口（携带选中项信息）
  - 关闭自身窗口
- 窗口行为：
  - 失焦自动关闭（`onFocusChanged` → 如非聚焦则 `close()`）
  - Escape 关闭
  - 无边框、透明背景、圆角、阴影（Spotlight 风格）

```typescript
// 主窗口侧监听
listen('command-palette-select', (event) => {
  const { kind, id } = event.payload;
  // 1. 显示主窗口
  await getCurrentWindow().show();
  await getCurrentWindow().setFocus();
  // 2. 执行选中项对应的动作
  if (kind === 'document') {
    useStore.getState().openDocument(id);
  } else if (kind === 'settings') {
    useStore.getState().openSettings(id);
  }
  // ...
});
```

#### 9. `src/main.tsx` — 添加窗口路由

```typescript
const isCommandPaletteWindow = windowType === 'command-palette';

// 在条件链中加入:
isCommandPaletteWindow ? <CommandPaletteWindow /> : ...
```

---

### 前端存储 + 设置 (3 个修改)

#### 10. `src/lib/storage.ts` — 扩展 `AppSettings`

```typescript
export interface AppSettings {
  // ... 现有字段 ...
  /** OS 级全局快捷键配置数组 */
  globalShortcuts?: GlobalShortcutConfig[];
  [key: string]: unknown;
}
```

#### 11. `src/store/uiSlice.ts` — 添加设置区域 ID

```typescript
export type SettingsSectionId = 
  | 'general' | 'editor' | 'terminal' | 'shortcuts' 
  | 'globalShortcuts'  // ← 新增
  | 'agent' | 'about' | 'help';
```

#### 12. `src/components/settings/GlobalShortcutsSection.tsx` — 新文件（设置页面）

功能：
- 已配置的全局快捷键列表（每条显示：快捷键、动作名称、启用开关、编辑、删除）
- 「添加全局快捷键」按钮
- 编辑面板：
  - 快捷键捕获（复用 `ShortcutsSection` 中的按键录制逻辑 — 提取为公共组件）
  - 动作类型下拉选择（从 `getAllActionDefs()` 动态获取）
  - 根据选中动作的 `paramFields` 动态渲染参数表单
  - 冲突检测：与其他全局快捷键冲突时警告
- 复用 `components/ui/` 的公共组件（IconButton, MenuList 等）

#### 13. `src/components/settings/ShortcutsSection.tsx` — 添加跳转入口

在页面顶部添加一个提示框/链接，指向「全局快捷键」设置页：
> "需要在应用外触发快捷键？[配置全局快捷键 →]"

#### 14. `src/App.tsx` — 初始化 + 事件监听

在 App 组件的 `useEffect` 中：
```typescript
useEffect(() => {
  // 1. 加载全局快捷键配置
  const settings = await storage.loadSettings();
  const configs = settings.globalShortcuts ?? [];
  
  // 2. 同步到 Rust（注册到 OS）
  await syncGlobalShortcuts(configs.filter(c => c.enabled));
  
  // 3. 监听触发事件
  const unlisten = await listen('global-shortcut-triggered', (event) => {
    const config = event.payload as GlobalShortcutConfig;
    executeAction(config, { appWindow: getCurrentWindow(), emit: ... });
  });
  
  // 4. 监听 CommandPalette 窗口的选择事件
  const unlistenSelect = await listen('command-palette-select', ...);
  
  return () => { unlisten(); unlistenSelect(); };
}, []);
```

#### 15. `src/lib/i18n.ts` — 添加国际化 key

新增 `globalShortcut.*` 命名空间的翻译条目（中/英）。

---

## 扩展性设计

### 新增一个全局快捷键动作的完整步骤

假设未来要支持「快速创建笔记」动作：

```typescript
// 1. 在任意模块中注册（只需 3 行）
registerActionDef({
  type: 'quick-note',
  labelKey: 'globalShortcut.action.quickNote',
  icon: PenLine,
  paramFields: [],
  handler: async (_, ctx) => {
    // 创建新文档 → 打开主窗口 → 切换到该文档
    const win = getCurrentWindow();
    await win.show();
    await win.setFocus();
    ctx.emit('quick-create-note');
  },
});
```

```typescript
// 2. i18n 添加翻译
'globalShortcut.action.quickNote': '快速创建笔记',
```

**无需修改**：设置页 UI（自动渲染新动作选项）、核心注册/监听逻辑、Rust 后端。

### 关键设计决策

1. **Action Registry 而非 switch-case**：`Map<string, GlobalShortcutActionDef>` 模式，新增动作只需 `registerActionDef()`，零侵入。

2. **Param Schema 驱动 UI**：`paramFields` 定义每个动作的参数。设置页根据 schema 动态渲染表单（text input / dropdown / directory picker）。新增带参数的动作无需写 UI 代码。

3. **配置全 JSON 可序列化**：`GlobalShortcutConfig[]` 存储在 `settings.json`，不依赖代码中的硬编码。用户可在设置页增删改。

4. **窗口模式路由复用**：`main.tsx` 的 URL param 路由模式已验证（preview/diagram/terminal），新增 `command-palette` 类型完全一致。

---

## 实施步骤

1. **Rust 后端**：添加依赖 → 编写 `global_shortcut.rs` → 注册插件和命令 → 更新权限
2. **核心引擎**：编写 `globalShortcuts.ts`（类型 + 注册表 + 同步逻辑）
3. **内置动作**：编写 `globalShortcutActions.ts`（三个 handler）
4. **独立窗口**：编写 `CommandPaletteWindow.tsx` → 更新 `main.tsx` 路由
5. **存储扩展**：更新 `storage.ts` AppSettings
6. **设置页面**：编写 `GlobalShortcutsSection.tsx`
7. **集成**：更新 `App.tsx` 初始化 + 事件监听
8. **i18n + 设置入口**：添加翻译、设置页导航
9. **验证编译**：`npm run tauri dev` 端到端测试

## 风险与注意事项

- **macOS 权限**：全局快捷键在 macOS 上不需要额外系统权限（不像辅助功能），`tauri-plugin-global-shortcut` 使用的是系统 API
- **快捷键冲突**：如果用户选择的快捷键已被 OS 或其他应用占用，`register` 会失败。需要在 Rust 端返回友好错误信息，前端提示用户更换
- **CommandPalette 独立窗口数据**：不使用 Zustand store（独立窗口无主窗口状态），直接调 storage API 只读加载
- **窗口生命周期**：CommandPalette 窗口是临时的（选完即关），不持久化状态
