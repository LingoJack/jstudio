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

export default function DiagramWindowApp() {
  const [payload, setPayload] = useState<DiagramPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  // Keep latest snapshot in a ref so we can send a final update on close.
  const latestSnapshot = useRef('');

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
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <GraphCanvas
          initialSnapshot={payload?.snapshot ?? ''}
          onChange={handleChange}
          darkMode={isDark}
        />
      </div>
    </div>
  );
}
