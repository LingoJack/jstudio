/**
 * DiagramWindowApp — 根组件，运行在独立的 OS 窗口中（?window=diagram）。
 *
 * 1. 从 Rust 内存获取初始快照。
 * 2. 渲染全尺寸 Excalidraw 画板。
 * 3. 用户编辑时通过 Tauri event 实时回传快照到主窗口。
 * 4. 主题跟随系统设置同步。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExcalidrawCanvas } from '../editor/nodes/ExcalidrawCanvas';
import { GraphCanvas } from '../editor/nodes/graph/GraphCanvas';
import { detectSnapshotKind } from '../editor/nodes/graph/graphSnapshot';
import {
  fetchDiagramData,
  sendDiagramUpdate,
  type DiagramPayload,
} from '../../lib/windows/diagramWindow';
import { storage, type ThemeMode } from '../../lib/storage';

/**
 * Resolve a theme preference to actual dark/light.
 * When `mode` is `system`, queries the OS via `prefers-color-scheme`.
 */
function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Sync dark/light theme from settings so the diagram window matches
 * the main window's appearance.
 */
function useThemeSync() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Initial load from settings
    storage.loadSettings().then((settings) => {
      const dark = resolveDark(settings.theme ?? 'system');
      setIsDark(dark);
      document.documentElement.classList.toggle('dark', dark);
    }).catch(() => {
      // Fallback: check system preference
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(dark);
      document.documentElement.classList.toggle('dark', dark);
    });

    // Listen for system preference changes (when theme is 'system')
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      storage.loadSettings().then((settings) => {
        if (settings.theme === 'system') {
          setIsDark(e.matches);
          document.documentElement.classList.toggle('dark', e.matches);
        }
      }).catch(() => {});
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDark;
}

export default function DiagramWindowApp() {
  const [payload, setPayload] = useState<DiagramPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep latest snapshot in a ref so we can send a final update on close.
  const latestSnapshot = useRef('');

  // Sync theme with main window
  const isDark = useThemeSync();

  useEffect(() => {
    let cancelled = false;
    fetchDiagramData().then((data) => {
      if (cancelled) return;
      if (data) {
        latestSnapshot.current = data.snapshot || '';
        setPayload(data);
      } else {
        setError('无法加载画板数据');
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Send a final update before the window closes.
  // NOTE: `beforeunload` in a WebView cannot reliably await an async Tauri
  // IPC call — the window may be destroyed before `emitTo` completes.
  // Instead, we rely on real-time `sendDiagramUpdate` calls on every edit
  // (see handleChange below), so the main window always has the latest
  // snapshot.  This listener is a best-effort safety net only.
  useEffect(() => {
    const handleClose = () => {
      if (latestSnapshot.current) {
        // Fire-and-forget; cannot await in beforeunload.
        sendDiagramUpdate(latestSnapshot.current);
      }
    };

    window.addEventListener('beforeunload', handleClose);
    return () => window.removeEventListener('beforeunload', handleClose);
  }, []);

  const handleChange = useCallback((json: string) => {
    latestSnapshot.current = json;
    // Send each update back to the main window in real time.
    // This ensures data is never lost even if the window is closed abruptly.
    sendDiagramUpdate(json);
  }, []);

  if (loading) {
    return (
      <div className="diagram-window-loading">
        <div className="spinner" />
        <span>正在加载画板…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="diagram-window-error">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div
      className="diagram-window-root"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {detectSnapshotKind(payload?.snapshot ?? '') === 'excalidraw' ? (
          <ExcalidrawCanvas
            initialSnapshot={payload?.snapshot ?? ''}
            onChange={handleChange}
            darkMode={isDark}
          />
        ) : (
          <GraphCanvas
            initialSnapshot={payload?.snapshot ?? ''}
            onChange={handleChange}
            darkMode={isDark}
          />
        )}
      </div>
    </div>
  );
}
