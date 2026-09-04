/**
 * DiagramWindowApp — 根组件，运行在独立的 OS 窗口中（?window=diagram）。
 *
 * 1. 从 Rust 内存获取初始快照。
 * 2. 渲染全尺寸 Graph 画板。
 * 3. 用户编辑时通过 Tauri event 实时回传快照到主窗口。
 * 4. 主题跟随系统设置同步，包括应用配色主题。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { GraphCanvas } from '../editor/nodes/graph/GraphCanvas';

import {
  fetchDiagramData,
  sendDiagramUpdate,
  type DiagramPayload,
} from '../../lib/windows/diagramWindow';
import { useWindowThemeSync } from '../../lib/windows/useWindowThemeSync';
import { useCloseOnCmdW } from '../../lib/windows/useCloseOnCmdW';
import { useCmdEnterConfirm } from '../../lib/windows/useCmdEnterConfirm';
import { useI18n } from '../../lib/core/i18n';
import { DEFAULT_MINDMAP_SCHEME } from '../editor/nodes/graph/graphTheme';
import type { MindmapScheme } from '../../lib/editor/extensions/diagramExtension';

export default function DiagramWindowApp() {
  const [payload, setPayload] = useState<DiagramPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  // Keep latest snapshot in a ref so we can send a final update on close.
  const latestSnapshot = useRef('');
  // 当前思维导图配色方案 + ref（ref 供 handleChange 稳定回调读取）。
  // 初始值来自 payload，用户在内联工具栏切换后会同步更新；
  // 切换后随快照一起回传主窗口，保持 block 属性与 mm 标记一致。
  const [mindmapScheme, setMindmapScheme] = useState<MindmapScheme>(DEFAULT_MINDMAP_SCHEME);
  const mindmapSchemeRef = useRef<MindmapScheme>(DEFAULT_MINDMAP_SCHEME);

  // Sync theme with main window (includes app theme colors)
  const isDark = useWindowThemeSync();
  // Cmd+W (native "Close Tab" menu) should close this diagram window.
  useCloseOnCmdW();
  // Cmd/Ctrl+Enter：确认提交并关闭窗口（数据已通过 handleChange 实时回传）。
  // close() 会触发 CloseRequested → beforeunload 安全网，逻辑与 Cmd+W 一致。
  // 注意：正在内联编辑某个 shape 文本时，Cmd+Enter 会先被 useGraphKeyboard
  // （子组件 effect，注册更早）拦截为"确认 shape 文本编辑"，不会到达此处。
  useCmdEnterConfirm(() => {
    getCurrentWindow().close().catch((err) => {
      console.error('[DiagramWindowApp] Cmd+Enter close failed:', err);
    });
  });

  useEffect(() => {
    let cancelled = false;
    fetchDiagramData().then((data) => {
      if (cancelled) return;
      if (data) {
        latestSnapshot.current = data.snapshot || '';
        const initialScheme = (data.mindmapScheme ?? DEFAULT_MINDMAP_SCHEME) as MindmapScheme;
        mindmapSchemeRef.current = initialScheme;
        setMindmapScheme(initialScheme);
        setPayload(data);
      } else {
        setError(t('diagram.loadError'));
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
        sendDiagramUpdate(latestSnapshot.current, mindmapSchemeRef.current);
      }
    };

    window.addEventListener('beforeunload', handleClose);
    return () => window.removeEventListener('beforeunload', handleClose);
  }, []);

  const handleChange = useCallback((json: string) => {
    latestSnapshot.current = json;
    // Send each update back to the main window in real time.
    // This ensures data is never lost even if the window is closed abruptly.
    sendDiagramUpdate(json, mindmapSchemeRef.current);
  }, []);

  const handleMindmapSchemeChange = useCallback((next: MindmapScheme) => {
    mindmapSchemeRef.current = next;
    setMindmapScheme(next);
    // 立即把新方案回传主窗口，避免窗口被强行关闭时 scheme 丢失。
    if (latestSnapshot.current) {
      sendDiagramUpdate(latestSnapshot.current, next);
    }
  }, []);

  if (loading) {
    return (
      <div className="diagram-window-loading">
        <div className="spinner" />
        <span>{t('diagram.loading')}</span>
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
      {/* Dedicated drag strip ABOVE the canvas — a layout element, not an
          overlay. The overlay variant (ChildWindowDragBar, z-10) sits in the
          same stacking context as the floating toolbar and mxGraph canvas;
          its hit-region overlapping the toolbar's top rows made hover/click
          flaky in this window. A real 36px flex row can never cover them. */}
      <div data-tauri-drag-region className="h-9 shrink-0" />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <GraphCanvas
          initialSnapshot={payload?.snapshot ?? ''}
          onChange={handleChange}
          darkMode={isDark}
          mindmapScheme={mindmapScheme}
          onMindmapSchemeChange={handleMindmapSchemeChange}
        />
      </div>
    </div>
  );
}
