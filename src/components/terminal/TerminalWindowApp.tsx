/**
 * TerminalWindowApp — 根组件，运行在「拆离」出来的独立 OS 窗口中
 * （?window=terminal）。
 *
 * 流程：
 *   1. 从 Rust 内存邮箱取回父窗口暂存的 detach payload（含每个 pane 的
 *      序列化 scrollback）。
 *   2. 复用主 store 的 `init()` 加载设置（主题 / 字体 / 暗色 class / 快捷键），
 *      保证子窗口外观与主窗口一致。
 *   3. 把 scrollback 暂存到 `window.__detachScrollback`，供
 *      useTerminalManager.setupTerminal 重放。
 *   4. 把 group + sessions 注入 store，然后渲染 <TerminalPanel />。
 *
 * 注意：PTY 是进程全局的，子窗口直接用相同的 session id 监听 `pty-data-{id}`
 * 即可继续收发，无需迁移 PTY。
 */

import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { fetchDetachPayload } from '../../lib/windows/terminalDetach';
import type { TerminalSession } from '../../store/terminalSlice';
import TerminalPanel from './TerminalPanel';

type Status = 'loading' | 'ready' | 'error';

export default function TerminalWindowApp() {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const payload = await fetchDetachPayload();
      if (cancelled) return;

      if (!payload || payload.panes.length === 0) {
        setStatus('error');
        return;
      }

      // Load settings (theme, fonts, dark class, keyboard shortcuts) the
      // same way the main window does, so the torn-off window matches.
      try {
        await useStore.getState().init();
      } catch (e) {
        console.error('[TerminalWindow] init failed:', e);
      }
      if (cancelled) return;

      // Stash serialized scrollback for replay; useTerminalManager consumes
      // each entry once when it sets up the corresponding terminal.
      const scrollbackMap: Record<string, string> = {};
      for (const pane of payload.panes) {
        if (pane.scrollback) scrollbackMap[pane.sessionId] = pane.scrollback;
      }
      (window as unknown as {
        __detachScrollback?: Record<string, string>;
      }).__detachScrollback = scrollbackMap;

      // Inject the detached group + its sessions into this window's store.
      const sessions: TerminalSession[] = payload.panes.map((p) => ({
        id: p.sessionId,
        title: p.title,
        customTitle: p.customTitle,
        autoTitle: p.autoTitle,
        templateId: p.templateId,
        cwd: p.cwd,
        createdAt: Date.now(),
      }));

      useStore.setState({
        sessions,
        groups: [
          {
            id: payload.groupId,
            sessionIds: payload.panes.map((p) => p.sessionId),
            activeSessionId: payload.activeSessionId,
            layout: payload.layout,
          },
        ],
        activeGroupId: payload.groupId,
        activeSessionId: payload.activeSessionId,
        // This window is terminal-only.
        activeSidebarView: 'terminal',
        isLoading: false,
      });

      setStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'error') {
    return (
      <div className="w-screen h-screen flex items-center justify-center text-[var(--vscode-errorForeground)] text-sm">
        无法加载终端会话
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="w-screen h-screen flex items-center justify-center text-[var(--vscode-descriptionForeground)] text-sm">
        正在加载终端…
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden">
      <TerminalPanel />
    </div>
  );
}
