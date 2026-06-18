/**
 * PreviewWindowApp — 预览新窗口的根组件。
 *
 * 在 main.tsx 中通过 URL 参数 `?window=preview` 检测，
 * 如果是预览窗口则渲染此组件而非主 App。
 *
 * 它会通过 Tauri event 接收主窗口发来的文件数据，
 * 然后全屏渲染对应类型的预览内容。
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';

import { onPreviewData, closePreviewWindow, type PreviewPayload } from '../lib/previewWindow';
import { ensureUtf8Charset, formatFileSize, getCategoryLabel, type PreviewCategory } from '../lib/fileUtils';
import { docxToHtml } from '../lib/docxPreview';

export default function PreviewWindowApp() {
  const [data, setData] = useState<PreviewPayload | null>(null);

  useEffect(() => {
    const unlistenPromise = onPreviewData((payload) => {
      setData(payload);
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
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
        <PreviewContent src={safeSrc} category={category} fileName={data.fileName} />
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
}: {
  src: string;
  category: PreviewCategory;
  fileName: string;
}) {
  switch (category) {
    case 'html':
    case 'pdf':
      return (
        <iframe
          src={src}
          className="preview-window-frame"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          title={fileName}
        />
      );

    case 'docx':
      return <DocxPreview src={src} />;

    case 'image':
      return <ImageZoom src={src} alt={fileName} />;

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
/* Text preview                                                        */
/* ------------------------------------------------------------------ */

function TextPreview({ src }: { src: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    try {
      const commaIdx = src.indexOf(',');
      const header = src.substring(5, commaIdx);
      const isBase64 = header.includes('base64');
      const payload = src.substring(commaIdx + 1);
      setText(
        isBase64
          ? decodeURIComponent(escape(atob(payload)))
          : decodeURIComponent(payload),
      );
    } catch {
      setText('无法读取文件内容');
    } finally {
      setLoading(false);
    }
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
