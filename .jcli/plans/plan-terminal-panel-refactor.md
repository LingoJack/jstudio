# TerminalPanel 重构计划 -- 参考 kitty 核心设计

## 架构对比分析

### kitty (Python + C)

| 模块 | 文件 | 核心职责 |
|------|------|----------|
| PTY 创建 | `child.py` | forkpty(), 进程创建, 环境变量设置 |
| I/O 多路复用 | `child-monitor.c` | poll()/kqueue() 管理多 PTY fd, 读/写缓冲区 |
| 粘贴处理 | `screen.c` + `utils.py` | bracketed paste + sanitize (移除危险 ESC 序列) |
| 输入转发 | `window.py` | 键盘/粘贴 → `schedule_write_to_child` |
| 状态管理 | 全局 `Child[]` 数组 + mutex | 多 session 的统一生命周期管理 |

### jstudio (Tauri + React + xterm.js)

| 模块 | 文件 | 核心职责 |
|------|------|----------|
| PTY 创建 | `terminal.rs` | portable-pty, session 注册, reader thread |
| 输入转发 | `useTerminalManager.ts` | `term.onData` → `storage.ptyWrite` |
| 输出接收 | `useTerminalManager.ts` | Tauri event `pty-data-{id}` → `term.write` |
| 粘贴处理 | `useTerminalManager.ts` | `term.paste(text)` (依赖 xterm.js 内置) |
| 状态管理 | `terminalSlice.ts` | Redux store session 管理 |

---

## 关键设计精华 (kitty)

### 1. Bracketed Paste 实现 (screen.c:5924-5941)

```c
paste_(Screen *self, PyObject *bytes, bool allow_bracketed_paste) {
    if (allow_bracketed_paste && self->modes.mBRACKETED_PASTE)
        write_escape_code_to_child(self, ESC_CSI, BRACKETED_PASTE_START);  // \x1b[200~
    write_to_child(self, data, sz);
    if (allow_bracketed_paste && self->modes.mBRACKETED_PASTE)
        write_escape_code_to_child(self, ESC_CSI, BRACKETED_PASTE_END);    // \x1b[201~
}
```

**作用**：当 shell 开启 bracketed paste mode 时，粘贴内容会被包裹，shell 能区分"粘贴"和"手动键入"，防止意外执行危险命令。

### 2. sanitize_for_bracketed_paste (utils.py:1050-1057)

```python
def sanitize_for_bracketed_paste(text: bytes) -> bytes:
    pat = re.compile(b'(?:(?:\033\\\x5b)|(?:\x9b))201~')
    while True:
        new_text = pat.sub(b'', text)
        if new_text == text: break
        text = new_text
    return text
```

**作用**：移除粘贴内容中可能注入的 `\x1b[201~` 序列，防止提前终止 bracketed paste 包裹。

### 3. 多进程统一管理 (child-monitor.c)

- **全局 Child 数组** + mutex 锁保护
- **poll() I/O 多路复用**：同时监听所有 PTY fd
- **写缓冲区**：`schedule_write_to_child` 写入缓冲区，I/O 线程批量 flush
- **写限制**：100MB 上限防止内存爆炸

---

## xterm.js 已实现的功能

好消息：xterm.js 的 `Clipboard.ts` 已经实现了关键功能：

```typescript
export function bracketTextForPaste(text: string, bracketedPasteMode: boolean): string {
  if (!bracketedPasteMode) return text;
  // Sanitize: ESC → U+241B (␛)
  const sanitizedText = text.replace(/\x1b/g, '\u241b');
  return `\x1b[200~${sanitizedText}\x1b[201~`;
}
```

调用 `term.paste(text)` 时，xterm.js 会：
1. 检测 shell 是否开启了 bracketed paste mode
2. 自动添加 `\x1b[200~` 和 `\x1b[201~` 包裹
3. 将 ESC 字符替换为 U+241B 防止注入

**jstudio 已经在使用 `term.paste()`！** 所以 bracketed paste 功能已经生效。

---

## 改进计划

### Phase 1: 增强粘贴安全处理

虽然 xterm.js 有基础 sanitize，但 kitty 的 sanitize 更严格（移除 `\x1b[201~` 序列而非替换）。我们可以在前端增加额外检查：

**新增文件**: `src/lib/terminal/pasteSanitize.ts`

```typescript
/**
 * Kitty-style sanitize for bracketed paste.
 * Remove any embedded bracketed-paste end sequences to prevent injection.
 * 
 * kitty utils.py:1050:
 *   pat = re.compile(b'(?:(?:\033\\\x5b)|(?:\x9b))201~')
 */
export function sanitizeForBracketedPaste(text: string): string {
  // Remove CSI 201~ sequences (both 7-bit and 8-bit forms)
  // \x1b[201~ (ESC + [ + 201 + ~)  or  \x9b201~ (CSI in 8-bit)
  return text.replace(/(?:\x1b\[201~|\x9b201~)/g, '');
}

/**
 * Prepare text for paste, combining xterm.js's ESC→U+241B with kitty's sequence removal.
 */
export function preparePasteText(text: string): string {
  // 1. Kitty-style: remove bracketed-paste end sequences
  let sanitized = sanitizeForBracketedPaste(text);
  // 2. xterm.js will handle ESC→U+241B replacement internally via term.paste()
  return sanitized;
}
```

**修改**: `useTerminalManager.ts` 粘贴处理

```typescript
// 当前实现 (line 228-236):
if (isPaste && (event.key === 'v' || event.key === 'V')) {
  event.preventDefault();
  readText()
    .then((text) => {
      if (text) term.paste(text);  // ← 直接粘贴
    })
    .catch(console.error);
  return false;
}

// 改进后:
import { preparePasteText } from '../../lib/terminal/pasteSanitize';
if (isPaste && (event.key === 'v' || event.key === 'V')) {
  event.preventDefault();
  readText()
    .then((text) => {
      if (text) term.paste(preparePasteText(text));  // ← 先 sanitize
    })
    .catch(console.error);
  return false;
}
```

### Phase 2: 重构 TerminalPanel 组件架构

参考 kitty 的 `ChildMonitor` 设计，将多个 PTY session 的管理统一到一个清晰的架构中：

**当前问题**：
- `useTerminalManager` 混合了 xterm 创建、PTY 事件监听、IME 处理、粘贴处理
- `TerminalPanel` 作为容器但逻辑分散

**新架构**：

```
TerminalPanel.tsx (容器)
  ├── usePtySessions.ts       (PTY session 生命周期管理)
  │     - createSession / killSession / resizeSession
  │     - 监听 pty-data / pty-exit events
  │
  ├── useTerminalInstances.ts (xterm.js 实例管理)
  │     - setupTerminal / destroyTerminal
  │     - FitAddon / SerializeAddon / WebglAddon
  │     - ResizeObserver
  │
  ├── useTerminalInput.ts     (输入处理：键盘/粘贴/IME)
  │     - attachCustomKeyEventHandler
  │     - beforeinput bridge
  │     - composition tracking
  │     - paste with sanitize
  │
  └── TerminalTabs.tsx        (Tab UI)
        └── PaneLayoutView.tsx (布局)
              └── TerminalPane.tsx (单个终端视图)
```

**新增文件**：`src/components/terminal/usePtySessions.ts`

```typescript
/**
 * PTY session lifecycle management.
 * 
 * Inspired by kitty's child-monitor.c:
 *   - Global session registry
 *   - Unified event handling
 *   - Batch operations
 */
export function usePtySessions() {
  const sessionsRef = useRef<Map<string, PtySessionState>>(new Map());
  const unlistenRef = useRef<Map<string, UnlistenFn[]>>(new Map());
  
  // Create a new PTY session
  const createSession = useCallback(async (params: CreateParams): Promise<SessionInfo> => {
    const info = await storage.ptyCreate(params);
    // Wire up pty-data / pty-exit listeners
    const unlistenData = await listen(`pty-data-${info.id}`, ...);
    const unlistenExit = await listen(`pty-exit-${info.id}`, ...);
    unlistenRef.current.set(info.id, [unlistenData, unlistenExit]);
    return info;
  }, []);
  
  // Write to PTY (with optional batching)
  const writeToSession = useCallback(async (sessionId: string, data: string) => {
    await storage.ptyWrite(sessionId, data);
  }, []);
  
  // Resize PTY
  const resizeSession = useCallback(async (sessionId: string, cols: number, rows: number) => {
    await storage.ptyResize(sessionId, cols, rows);
  }, []);
  
  // Kill session
  const killSession = useCallback(async (sessionId: string) => {
    // Cleanup listeners first
    const unlistens = unlistenRef.current.get(sessionId);
    unlistens?.forEach(fn => fn());
    await storage.ptyKill(sessionId);
  }, []);
  
  return { createSession, writeToSession, resizeSession, killSession };
}
```

**新增文件**：`src/components/terminal/useTerminalInput.ts`

```typescript
/**
 * Terminal input handling: keyboard, paste, IME.
 * 
 * Extracted from useTerminalManager for clarity.
 * Inspired by kitty's window.py input handling.
 */
export function useTerminalInput(term: Terminal, sessionId: string) {
  const attachInputHandlers = useCallback(() => {
    // 1. Keyboard → PTY (onData)
    term.onData((data) => storage.ptyWrite(sessionId, data));
    
    // 2. Custom key handler (IME + paste interception)
    term.attachCustomKeyEventHandler((event) => {
      // IME composition: let browser handle
      if (event.isComposing || event.keyCode === 229) return false;
      
      // Shift-only: IME toggle
      if (event.key === 'Shift' && !event.ctrlKey && !event.metaKey && !event.altKey) return false;
      
      // Paste (Cmd+V / Ctrl+V): intercept and sanitize
      const isMac = navigator.platform.toLowerCase().includes('mac');
      if ((isMac ? event.metaKey : event.ctrlKey) && (event.key === 'v' || event.key === 'V')) {
        event.preventDefault();
        readText().then(text => {
          if (text) term.paste(preparePasteText(text));  // ← sanitize
        });
        return false;
      }
      
      return true;
    });
    
    // 3. macOS beforeinput bridge (Shift+symbol)
    // ... (existing implementation)
    
    // 4. IME composition tracking
    // ... (existing implementation)
  }, [term, sessionId]);
  
  return { attachInputHandlers };
}
```

### Phase 3: 增加多进程管理能力

参考 kitty 的 `ChildMonitor` 设计，在后端增加多 PTY 进程的统一管理能力：

**当前**：`terminal.rs` 使用 `HashMap<String, PtySession>` + `Mutex`

**改进**：增加以下能力：

```rust
// 新增: 批量操作
#[tauri::command]
pub fn pty_write_batch(session_id: String, chunks: Vec<String>) -> Result<(), String> {
    // 类似 kitty 的 schedule_write_to_child，批量写入减少 syscall
    let mut sessions = SESSIONS.lock()?;
    let session = sessions.get_mut(&session_id)?;
    for chunk in chunks {
        session.writer.write_all(chunk.as_bytes())?;
    }
    session.writer.flush()?;
    Ok(())
}

// 新增: 写缓冲区状态查询 (防止 backlog 过大)
#[tauri::command]
pub fn pty_write_buffer_size(session_id: String) -> Result<usize, String> {
    // kitty 有 100MB write_buf_limit
    let sessions = SESSIONS.lock()?;
    // portable-pty 没有直接暴露缓冲区大小，但可以估算
    Ok(0)  // placeholder
}

// 新增: 优雅退出 (SIGTERM before SIGKILL)
#[tauri::command]
pub fn pty_kill_graceful(session_id: String, timeout_ms: u64) -> Result<(), String> {
    let mut sessions = SESSIONS.lock()?;
    if let Some(session) = sessions.get_mut(&session_id) {
        // 1. Send SIGTERM
        session.child.kill()?;
        // 2. Wait with timeout
        // ... (需要 platform-specific 实现)
    }
    Ok(())
}
```

---

## 实施优先级

| Phase | 改进 | 工作量 | 影响 |
|-------|------|--------|------|
| 1 | 粘贴安全处理 | 低 | 安全增强 |
| 2 | TerminalPanel 架构重构 | 中 | 可维护性提升 |
| 3 | 多进程管理增强 | 高 | 性能/可靠性提升 |

建议先实施 Phase 1（粘贴安全），这是最直接的 kitty 设计精华应用。

---

## 文件变更清单

### Phase 1 (粘贴安全)

| 操作 | 文件 |
|------|------|
| 新增 | `src/lib/terminal/pasteSanitize.ts` |
| 修改 | `src/components/terminal/useTerminalManager.ts` |

### Phase 2 (架构重构)

| 操作 | 文件 |
|------|------|
| 新增 | `src/components/terminal/usePtySessions.ts` |
| 新增 | `src/components/terminal/useTerminalInstances.ts` |
| 新增 | `src/components/terminal/useTerminalInput.ts` |
| 新增 | `src/components/terminal/TerminalPane.tsx` |
| 重构 | `src/components/terminal/TerminalPanel.tsx` |
| 重构 | `src/components/terminal/useTerminalManager.ts` (拆分逻辑) |

### Phase 3 (后端增强)

| 操作 | 文件 |
|------|------|
| 修改 | `src-tauri/src/commands/terminal.rs` |
| 修改 | `src/lib/core/storage.ts` (新增 API) |