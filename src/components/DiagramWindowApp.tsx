/**
 * DiagramWindowApp — 新窗口的根组件（画板放大编辑）。
 *
 * 运行在独立的 OS 窗口中（?window=diagram）。
 * 1. 从 Rust 内存获取初始快照。
 * 2. 渲染全尺寸 tldraw 画板。
 * 3. 用户编辑时通过 Tauri event 实时回传快照到主窗口。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { TldrawCanvas } from './TldrawCanvas';
import {
  fetchDiagramData,
  sendDiagramUpdate,
  closeDiagramWindow,
  type DiagramPayload,
} from '../lib/diagramWindow';

export default function DiagramWindowApp() {
  const [payload, setPayload] = useState<DiagramPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep latest snapshot in a ref so we can send a final update on close.
  const latestSnapshot = useRef('');

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
  useEffect(() => {
    const handleClose = async () => {
      if (latestSnapshot.current) {
        await sendDiagramUpdate(latestSnapshot.current);
      }
      closeDiagramWindow();
    };

    window.addEventListener('beforeunload', handleClose);
    return () => window.removeEventListener('beforeunload', handleClose);
  }, []);

  const handleChange = useCallback((json: string) => {
    latestSnapshot.current = json;
    // Send each debounced update back to the main window.
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
        <TldrawCanvas
          initialSnapshot={payload?.snapshot ?? ''}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
