# 终端标签页：Rename + 智能标题 + 历史记录

## 目标

1. **右键 Rename**：右键标签页弹出上下文菜单（Rename / Close），Rename 进入行内编辑
2. **智能标题优先级**：用户 rename > 正在执行的程序（OSC 自动检测，过长中间压缩 `...`）> 工作目录 basename > "Terminal"
3. **历史记录按钮**：`+` 右侧加一个 Clock 图标，点击弹出下拉列表，展示最近 10 个使用过的 workdir，点击某项即可快速新开一个 tab 到该目录
4. **持久化**：最近 10 个 workdir 动态维护，持久化到 `settings.json`

## 方案设计

### 不需要 Rust 改动

xterm.js 内置 OSC 0/2 title 序列解析，当 shell 发出 `\x1b]0;title\x07` 时，`term.onTitleChange` 自动触发。现代 shell（zsh/bash）在 `precmd`/`preexec` 中会自动设置标题为当前命令或目录。我们只需在前端 wire up 这个事件即可。

### 数据模型变更

**`TerminalSession` 新增两个字段**（`terminalSlice.ts`）：

```typescript
export interface TerminalSession {
  id: string;
  title: string;                // 后端 title（保留，兼容 pty_set_title）
  customTitle: string | null;   // 用户 rename（null = 未重命名）
  autoTitle: string | null;     // xterm onTitleChange 检测到的标题
  templateId: string | null;
  cwd: string;
  createdAt: number;
}
```

**新增 `recentDirs` 状态 + 动作**：

```typescript
recentDirs: string[];                      // 最近 10 个 workdir
addRecentDir: (cwd: string) => void;       // 去重、前插、截断到 10
initRecentDirs: (raw: unknown) => void;    // 从 settings 加载
```

### 标题显示逻辑

```typescript
function getDisplayTitle(session: TerminalSession): string {
  // 1. 用户 rename 优先
  if (session.customTitle) return session.customTitle;
  // 2. OSC 自动检测的标题
  if (session.autoTitle) return formatAutoTitle(session.autoTitle);
  // 3. 工作目录 basename
  return getCwdBasename(session.cwd);
}

function formatAutoTitle(raw: string): string {
  // 处理 "user@host: path" → 提取 path basename
  // 处理命令名 → 如果过长（>25），中间压缩 "npm run...te-app"
  // 短标题直接返回
}
```

### 涉及文件（6 个）

| 文件 | 改动 |
|------|------|
| `src/store/terminalSlice.ts` | TerminalSession 加 `customTitle`/`autoTitle`；加 `recentDirs` 状态 + `addRecentDir`/`initRecentDirs`；`createSession`/`splitPane` 创建时调 `addRecentDir`；`renameSession` 改为操作 `customTitle`；加 `setAutoTitle` |
| `src/store/storeHelpers.ts` | `StoreState` 接口加 `recentDirs`、`addRecentDir`、`initRecentDirs`、`setAutoTitle` |
| `src/store/documentsSlice.ts` | init 流程中加载 `terminalRecentDirs` 并调 `initRecentDirs` |
| `src/components/terminal/useTerminalManager.ts` | `setupTerminal` 中 wire `term.onTitleChange` → `setAutoTitle(sessionId, title)` |
| `src/components/terminal/TerminalTabs.tsx` | 右键菜单、行内 Rename 编辑、Clock 历史按钮 + 下拉弹层 |
| `src/components/terminal/TerminalTabContextMenu.tsx` | **新建** — 参照 `DocumentContextMenu.tsx` 模式 |

### 详细实现

#### 1. terminalSlice.ts

**新增状态**：
```typescript
recentDirs: [] as string[],
```

**新增动作**：

```typescript
/** 设置 session 的 OSC 自动标题 */
setAutoTitle: (sessionId, title) => {
  set((s) => ({
    sessions: s.sessions.map((sess) =>
      sess.id === sessionId && !sess.customTitle  // 不覆盖用户 rename
        ? { ...sess, autoTitle: title }
        : sess,
    ),
  }));
},

/** 用户重命名 — 设置 customTitle，清空 autoTitle 的显示优先级 */
renameSession: (id, title) => {
  set((s) => ({
    sessions: s.sessions.map((sess) =>
      sess.id === id
        ? { ...sess, customTitle: title.trim() || null, title: title.trim() || sess.title }
        : sess,
    ),
  }));
  storage.ptySetTitle(id, title).catch(console.error);
},

/** 添加最近工作目录（去重、前插、截断到 10） */
addRecentDir: (cwd) => {
  const normalized = cwd.replace(/^~$/, '~');
  set((s) => {
    const filtered = s.recentDirs.filter((d) => d !== normalized);
    const recentDirs = [normalized, ...filtered].slice(0, 10);
    storage.saveSettings({ terminalRecentDirs: recentDirs }).catch(console.error);
    return { recentDirs };
  });
},

/** 从 settings 初始化 recentDirs */
initRecentDirs: (raw) => {
  let dirs: string[] = [];
  if (Array.isArray(raw)) {
    dirs = raw.filter((d) => typeof d === 'string' && d.length > 0).slice(0, 10);
  }
  set({ recentDirs: dirs });
},
```

**修改 `createSession`**：创建 session 后调用 `get().addRecentDir(cwd)`，初始化 `customTitle: null, autoTitle: null`。

**修改 `splitPane`**：同上。

#### 2. storeHelpers.ts

StoreState 接口添加：
```typescript
recentDirs: string[];
setAutoTitle: (sessionId: string, title: string) => void;
addRecentDir: (cwd: string) => void;
initRecentDirs: (raw: unknown) => void;
```

#### 3. documentsSlice.ts

init 流程中（约 L96 附近）加：
```typescript
if (settings.terminalRecentDirs !== undefined) {
  terminalRecentDirsRaw = settings.terminalRecentDirs;
}
```
然后在 L187 附近加：
```typescript
get().initRecentDirs(terminalRecentDirsRaw);
```

#### 4. useTerminalManager.ts

在 `setupTerminal` 中，data listener 之前加：
```typescript
// Shell title change (OSC 0/2) → update auto title
term.onTitleChange((title) => {
  useStore.getState().setAutoTitle(sessionId, title);
});
```

#### 5. TerminalTabs.tsx

**显示标题**：替换原来的 `title` 取值为 `getDisplayTitle(session)`。

**右键菜单**：
- tab `<div>` 加 `onContextMenu` → 记录 `{ x, y, groupId }` → 渲染 `TerminalTabContextMenu`
- 菜单项：Rename / Close
- 点击外部关闭

**行内 Rename**：
- 状态 `renamingGroupId: string | null`
- 当 renaming 时，标签页的 `<span>` 替换为 `<input>`，自动聚焦和选中
- Enter 确认 / Escape 取消 / blur 确认

**历史按钮**：
- `+` 右侧加 Clock 图标按钮
- 点击弹出下拉弹层（fixed 定位，与 `+` 按钮对齐）
- 列表项：folder 图标 + workdir 路径（过长的尾部截断）
- 点击项 → `createSession` with `{ cwd: dir }`（需要新增创建指定 cwd 的 session 的能力，或临时 addTemplate + createSession）
- 底部：清除历史

**createSession 支持 cwd**：在 `createSession(templateId)` 签名上扩展，或新增 `createSessionWithCwd(cwd)` action。推荐在 createSession 里增加可选第二参数 `{ cwd }`。

#### 6. TerminalTabContextMenu.tsx（新建）

参照 `DocumentContextMenu.tsx`：
```tsx
interface Props {
  x: number;
  y: number;
  onRename: () => void;
  onClose: () => void;
}
// Pencil icon + "Rename"
// X icon + "Close"
```

## 实现顺序

1. terminalSlice.ts — 数据模型 + 动作
2. storeHelpers.ts — 接口声明
3. documentsSlice.ts — init 加载
4. useTerminalManager.ts — onTitleChange
5. TerminalTabContextMenu.tsx — 新建
6. TerminalTabs.tsx — 整合所有 UI
