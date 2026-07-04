/**
 * PreviewWindowApp — 预览新窗口的根组件。
 *
 * 在 main.tsx 中通过 URL 参数 `?window=preview` 检测，
 * 如果是预览窗口则渲染此组件而非主 App。
 *
 * 它通过 Rust 内存命令（get_preview_data）获取主窗口存入的文件数据，
 * 然后全屏渲染对应类型的预览内容。
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';

import { fetchPreviewData, closePreviewWindow, type PreviewPayload } from '../../lib/windows/previewWindow';
import { ensureUtf8Charset, formatFileSize, getCategoryLabel, type PreviewCategory } from '../../lib/editor/fileUtils';
import { docxToHtml } from '../../lib/editor/docxPreview';
import { storage, type ThemeMode } from '../../lib/core/storage';
import PdfPreview from '../editor/nodes/PdfPreview';

/**
 * Resolve a theme preference to actual dark/light.
 * When `mode` is `system`, queries the OS via `prefers-color-scheme`.
 * (Mirrors uiSlice.resolveDark without pulling in store dependencies.)
 */
function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Sync dark/light theme from settings so the preview window matches
 * the main window's appearance.
 */
function useThemeSync() {
  useEffect(() => {
    // Apply dark class immediately (synchronous fallback) to prevent flash.
    document.documentElement.classList.add('dark');

    storage.loadSettings().then((settings) => {
      const isDark = resolveDark(settings.theme ?? 'system');
      document.documentElement.classList.toggle('dark', isDark);
    }).catch(() => {
      // Keep dark as fallback.
    });
  }, []);
}

export default function PreviewWindowApp() {
  const [data, setData] = useState<PreviewPayload | null>(null);

  useThemeSync();

  useEffect(() => {
    fetchPreviewData().then((payload) => {
      if (payload) setData(payload);
    });
  }, []);

  if (!data) {
    return (
      <div className="preview-window-loading-screen">
        <Loader2 size={32} className="animate-spin" />
        <span>正在加载预览…</span>
      </div>
    );
  }

  const category = data.category as PreviewCategory;
  const safeSrc = ensureUtf8Charset(data.src);

  return (
    <div className="preview-window-root">
      {/* Header */}
      <div className="preview-window-header">
        <div className="preview-window-info">
          <span className="preview-window-name" title={data.fileName}>
            {data.fileName}
          </span>
          <span className="preview-window-meta">
            <span className="preview-window-type">
              {getCategoryLabel(category)}
            </span>
            <span className="preview-window-dot">·</span>
            <span className="preview-window-size">
              {formatFileSize(data.fileSize)}
            </span>
          </span>
        </div>
        <button
          type="button"
          className="preview-window-close"
          onClick={closePreviewWindow}
          title="关闭窗口"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="preview-window-body">
        <PreviewContent src={safeSrc} category={category} fileName={data.fileName} html={data.html} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Content renderer                                                    */
/* ------------------------------------------------------------------ */

function PreviewContent({
  src,
  category,
  fileName,
  html,
}: {
  src: string;
  category: PreviewCategory;
  fileName: string;
  /** Inline HTML source — when present, the html preview uses `srcDoc`. */
  html?: string;
}) {
  // ── Native DOM iframe for HTML preview (React 19 sandbox workaround) ──
  // Even though this is a separate window, we use native DOM for consistency.
  const htmlIframeRef = useRef<HTMLIFrameElement | null>(null);
  const htmlContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (category !== 'html') return;
    const container = htmlContainerRef.current;
    if (!container) return;

    // Create iframe via native DOM if not already present
    if (!htmlIframeRef.current) {
      const iframe = document.createElement('iframe');
      iframe.className = 'preview-window-frame';
      iframe.title = fileName;
      iframe.sandbox.add(
        'allow-same-origin',
        'allow-scripts',
        'allow-popups',
        'allow-forms',
      );
      if (html != null) {
        iframe.srcdoc = html;
      } else {
        iframe.src = src;
      }
      container.appendChild(iframe);
      htmlIframeRef.current = iframe;
    }

    // Update src/srcdoc if props change
    const iframe = htmlIframeRef.current;
    if (iframe) {
      if (html != null) {
        iframe.srcdoc = html;
        iframe.removeAttribute('src');
      } else {
        iframe.src = src;
        iframe.removeAttribute('srcdoc');
      }
    }
  }, [category, src, html, fileName]);

  switch (category) {
    case 'html':
      return (
        <div
          ref={htmlContainerRef}
          className="preview-window-frame-container"
          style={{ width: '100%', height: '100%' }}
        >
          {/* iframe inserted by useEffect */}
        </div>
      );

    case 'pdf':
      return <PdfPreview src={src} fillContainer />;

    case 'docx':
      return <DocxPreview src={src} />;

    case 'image':
      return <ImageZoom src={src} alt={fileName} />;

    case 'audio':
      return <MediaPreview src={src} kind="audio" />;

    case 'video':
      return <MediaPreview src={src} kind="video" />;

    case 'text':
      return <TextPreview src={src} />;

    default:
      return (
        <div className="preview-window-fallback">此文件类型不支持预览</div>
      );
  }
}

/* ------------------------------------------------------------------ */
/* DOCX preview                                                        */
/* ------------------------------------------------------------------ */

function DocxPreview({ src }: { src: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    docxToHtml(src)
      .then((result) => !cancelled && setHtml(result))
      .catch(() =>
        !cancelled && setHtml('<p style="color:#f85149;">Failed to load DOCX</p>'),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [src]);

  if (loading)
    return (
      <div className="preview-window-loading-center">
        <Loader2 size={28} className="animate-spin" />
        <span>正在解析 DOCX…</span>
      </div>
    );

  return (
    <div className="preview-window-docx">
      <div
        className="preview-window-docx-content"
        dangerouslySetInnerHTML={{ __html: html ?? '<p>加载中…</p>' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Image with zoom & pan                                              */
/* ------------------------------------------------------------------ */

function ImageZoom({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; baseTx: number; baseTy: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.2), 8));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= 1) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseTx: tx,
        baseTy: ty,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [scale, tx, ty],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setTx(dragRef.current.baseTx + (e.clientX - dragRef.current.startX));
    setTy(dragRef.current.baseTy + (e.clientY - dragRef.current.startY));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  return (
    <div className="preview-window-image-area">
      <img
        src={src}
        alt={alt}
        className="preview-window-image"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          cursor: scale > 1 ? (dragRef.current ? 'grabbing' : 'grab') : 'default',
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={reset}
        draggable={false}
      />
      <div className="preview-window-zoom-bar">
        <button
          type="button"
          className="preview-window-zoom-btn"
          onClick={() => setScale((s) => Math.max(s * 0.8, 0.2))}
          title="缩小"
        >−</button>
        <span className="preview-window-zoom-label">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="preview-window-zoom-btn"
          onClick={() => setScale((s) => Math.min(s * 1.25, 8))}
          title="放大"
        >+</button>
        <button
          type="button"
          className="preview-window-zoom-btn"
          onClick={reset}
          title="重置 (双击图片)"
        >↺</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audio / Video preview                                               */
/* ------------------------------------------------------------------ */

function MediaPreview({ src, kind }: { src: string; kind: 'audio' | 'video' }) {
  return (
    <div className="preview-window-media">
      {kind === 'video' ? (
        <video src={src} controls autoPlay className="preview-window-video" />
      ) : (
        <div className="preview-window-audio-wrap">
          <div className="preview-window-audio-icon">♪</div>
          <audio src={src} controls autoPlay className="preview-window-audio" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Text preview                                                        */
/* ------------------------------------------------------------------ */

function TextPreview({ src }: { src: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(src)
      .then((res) => res.text())
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setText('无法读取文件内容');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (loading)
    return (
      <div className="preview-window-loading-center">
        <Loader2 size={28} className="animate-spin" />
        <span>加载中…</span>
      </div>
    );

  return <pre className="preview-window-text">{text}</pre>;
}
