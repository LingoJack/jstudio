# 计划：为 JStudio 添加内置终端

## 目标

在 ActivityBar 中新增一个 **Terminal** 入口，点击后侧边栏切换为 **TerminalSessionList**（终端会话列表），主区域渲染真正的交互式终端（基于 xterm.js + Rust PTY）。

整体交互类似 VS Code：ActivityBar 切换视图 → 侧边栏显示对应面板 → 主区域显示终端。

---

## 架构设计

### 终端技术方案：xterm.js + portable-pty (Rust)

这是唯一能提供"真实终端体验"的方案：

| 层 | 技术 | 职责 |
|----|------|------|
| 渲染 | `@xterm/xterm` + `@xterm/addon-fit` | 前端终端画布、ANSI 着色、光标 |
| 通信 | Tauri Commands (下行) + Tauri Events (上行) | 前端 ↔ Rust 双向数据通道 |
| PTY | Rust `portable-pty` crate | 伪终端，spawn 真实 shell (zsh/bash) |

**数据流：**
```
用户键盘输入
  → xterm.js onData 回调
  → invoke('pty_write', { sessionId, data })
  → Rust 写入 PTY master
  → shell 处理

Shell 输出
  → Rust PTY read 线程循环读取
  → app.emit('pty-data-{sessionId}', output)
  → 前端 listen → xterm.write(output)
```

---

## 实施步骤

### Phase 1: Rust 后端 — PTY 层

#### 1.1 添加依赖 (`src-tauri/Cargo.toml`)
```toml
portable-pty = "0.8"
```

#### 1.2 新建 `src-tauri/src/commands/terminal.rs`

全局管理 PTY 会话，使用 `Mutex<HashMap<String, PtySession>>`。

**PtySession 结构：**
```rust
struct PtySession {
    id: String,
    writer: Box<dyn std::io::Write + Send>,  // 写入 PTY 的句柄
    child: Box<dyn portable_pty::Child + Send>, // 子进程
    title: String,
}
```

**Tauri 命令 (6 个)：**

| 命令 | 功能 |
|------|------|
| `pty_create(cwd, cols, rows)` | spawn shell，返回 sessionId |
| `pty_write(sessionId, data)` | 向 PTY 写入用户输入 |
| `pty_resize(sessionId, cols, rows)` | 调整 PTY 大小 |
| `pty_kill(sessionId)` | 杀死会话 |
| `pty_list()` | 返回活跃会话列表 |
| `pty_set_title(sessionId, title)` | 设置会话标题（重命名） |

**PTY 读取循环：**
- `pty_create` 中 spawn 一个 `std::thread::spawn`
- 循环读取 PTY reader，通过 `app_handle.emit(&format!("pty-data-{id}"), data)` 推送到前端
- 读取结束（EOF / 错误）时 emit `pty-exit-{id}` 事件

#### 1.3 注册命令 (`src-tauri/src/lib.rs`)
在 `generate_handler!` 中注册 6 个新命令。
`mod commands` 下添加 `pub mod terminal;`。

#### 1.4 权限
PTY 通信仅通过自定义命令和事件，不需要额外的 Tauri 权限声明（事件已在 `core:event:allow-emit/listen` 中）。

---

### Phase 2: 前端 — 存储层

#### 2.1 扩展 `src/lib/storage.ts`

新增 terminal 命名空间：

```typescript
// — terminal (PTY) —

ptyCreate: (opts: { cwd?: string; cols: number; rows: number }) =>
  invoke<TerminalSessionInfo>('pty_create', opts),

ptyWrite: (sessionId: string, data: string) =>
  invoke<void>('pty_write', { sessionId, data }),

ptyResize: (sessionId: string, cols: number, rows: number) =>
  invoke<void>('pty_resize', { sessionId, cols, rows }),

ptyKill: (sessionId: string) =>
  invoke<void>('pty_kill', { sessionId }),

ptyList: () => invoke<TerminalSessionInfo[]>('pty_list'),

ptySetTitle: (sessionId: string, title: string) =>
  invoke<void>('pty_set_title', { sessionId, title }),
```

新增类型 `TerminalSessionInfo`：
```typescript
export interface TerminalSessionInfo {
  id: string;
  title: string;
}
```

---

### Phase 3: 状态管理

#### 3.1 新建 `src/store/terminalSlice.ts`

```typescript
interface TerminalSession {
  id: string;
  title: string;
  createdAt: number;
}

// State
sessions: TerminalSession[];
activeSessionId: string | null;

// Actions
createSession: () => Promise<void>;      // 调用 pty_create，添加到列表
closeSession: (id: string) => Promise<void>;  // 调用 pty_kill，从列表移除
renameSession: (id: string, title: string) => void;
setActiveSession: (id: string) => void;
removeSessionState: (id: string) => void; // 仅移除前端状态（不 kill PTY），用于 exit 事件回调
```

#### 3.2 扩展 `src/store/uiSlice.ts`

新增视图切换状态：

```typescript
// 新增 state
activeSidebarView: 'documents' | 'terminal';  // 默认 'documents'

// 新增 action
setActiveSidebarView: (view: 'documents' | 'terminal') => void;
```

#### 3.3 更新 `src/store/storeHelpers.ts`（StoreState 接口）

添加 terminalSlice 和 uiSlice 新增字段的类型声明。

#### 3.4 更新 `src/store/useStore.ts`

组合 terminalSlice。

---

### Phase 4: 前端组件

#### 4.1 新建 `src/components/TerminalSessionList.tsx`

侧边栏终端会话面板，UI 风格与 `DocumentList.tsx` 完全一致：
- **头部：** "终端" 标题 + 会话计数 + 新建按钮 (`+`)
- **列表：** 每个会话显示终端图标 + 标题，点击切换 active session
- **右键菜单：** 重命名 / 关闭
- 支持双击重命名（与 DocumentList 一致）
- 宽度复用 `sidebarWidth`

#### 4.2 新建 `src/components/TerminalPanel.tsx`

xterm.js 终端渲染组件：
- 初始化 `Terminal` 实例 + `FitAddon`
- `onData` → `storage.ptyWrite(activeSessionId, data)`
- listen `pty-data-{sessionId}` → `term.write(data)`
- listen `pty-exit-{sessionId}` → 回调 store 移除会话
- ResizeObserver → `storage.ptyResize()`
- 切换 activeSession 时：保存当前终端到缓存，恢复或新建目标终端实例
- **多标签页缓存：** 用 `Map<sessionId, Terminal>` 缓存每个会话的 Terminal 实例，切换时隐藏/显示而非销毁

#### 4.3 更新 `src/components/ActivityBar.tsx`

在 Documents 和 Settings 之间添加 Terminal 入口：
- 图标：`TerminalSquare`（lucide-react）
- 点击逻辑：
  - `setSettingsOpen(false)`
  - `setActiveSidebarView('terminal')`
  - 如果当前已在 terminal 视图，则 toggle sidebar
- 高亮状态：当 `activeSidebarView === 'terminal' && isSidebarOpen`

---

### Phase 5: 布局集成

#### 5.1 更新 `src/App.tsx`

```tsx
// 新增订阅
const activeSidebarView = useStore((s) => s.activeSidebarView);
const activeSessionId = useStore((s) => s.activeSessionId);

// 侧边栏：根据 activeSidebarView 决定显示哪个面板
{isSidebarOpen && !isSettingsOpen && (
  activeSidebarView === 'terminal'
    ? <TerminalSessionList />
    : <DocumentList />
)}

// 主区域：terminal 视图时显示终端
{isSettingsOpen ? (
  <Settings />
) : activeSidebarView === 'terminal' ? (
  activeSessionId ? <TerminalPanel /> : <EmptyTerminalState />
) : hasActiveDoc ? (
  <BlockEditor />
) : (
  <EmptyState />
)}
```

#### 5.2 i18n (`src/lib/i18n.ts`)

新增翻译 key：
```
'app.terminal': '终端' / 'Terminal'
'terminal.sessions': '终端会话' / 'Terminal Sessions'
'terminal.newSession': '新建终端' / 'New Terminal'
'terminal.empty': '没有活跃的终端会话' / 'No active terminal sessions'
'terminal.close': '关闭终端' / 'Close Terminal'
'terminal.rename': '重命名' / 'Rename'
'terminal.untitled': '终端' / 'Terminal'
```

#### 5.3 CSS — xterm 样式

在 `src/index.css` 或 `TerminalPanel.tsx` 中引入：
```typescript
import '@xterm/xterm/css/xterm.css';
```

微调 xterm 主题色以匹配 VSCode 暗色/亮色主题。

---

### Phase 6: 依赖安装

```bash
npm install @xterm/xterm @xterm/addon-fit
```

---

## 涉及文件清单

| 文件 | 操作 |
|------|------|
| `src-tauri/Cargo.toml` | 修改：添加 `portable-pty` |
| `src-tauri/src/commands/terminal.rs` | **新建**：PTY 管理 + 6 个命令 |
| `src-tauri/src/commands/mod.rs` | 修改：添加 `pub mod terminal;` |
| `src-tauri/src/lib.rs` | 修改：注册 6 个命令 |
| `src/lib/storage.ts` | 修改：添加 terminal 方法 + 类型 |
| `src/store/terminalSlice.ts` | **新建**：终端会话状态 |
| `src/store/uiSlice.ts` | 修改：添加 `activeSidebarView` |
| `src/store/storeHelpers.ts` | 修改：StoreState 接口 |
| `src/store/useStore.ts` | 修改：组合 terminalSlice |
| `src/components/TerminalPanel.tsx` | **新建**：xterm.js 终端渲染 |
| `src/components/TerminalSessionList.tsx` | **新建**：侧边栏会话列表 |
| `src/components/ActivityBar.tsx` | 修改：添加 Terminal 入口 |
| `src/components/App.tsx` | 修改：视图路由 |
| `src/lib/i18n.ts` | 修改：添加终端相关翻译 |
| `package.json` | 修改：添加 xterm 依赖 |

---

## 验证方式

1. `npm run tauri dev` 启动应用
2. 点击 ActivityBar 中的 Terminal 图标 → 侧边栏切换为终端会话列表
3. 点击 `+` 新建终端 → 主区域出现可交互终端
4. 执行 `ls`、`vim`、`top` 等命令验证 PTY 完整支持
5. 新建第二个终端 → 列表显示两个会话，切换无延迟
6. 关闭终端会话 → PTY 进程清理，无残留
7. `npx tsc --noEmit` 类型检查通过
