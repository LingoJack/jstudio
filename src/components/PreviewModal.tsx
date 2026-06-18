/**
 * PreviewModal — 全屏模态预览组件。
 *
 * 用于文件附件块（fileBlock）在预览模式下"放大"查看。
 * 支持 HTML/SVG、PDF、DOCX、图片、文本等所有可预览类型。
 *
 * - 点击遮罩层 / Esc / 关闭按钮 → 关闭模态
 * - 内容区域居中展示，最大化利用屏幕空间
 * - 图片支持鼠标滚轮缩放 + 拖拽平移
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';

import {
  formatFileSize,
  getCategoryLabel,
  type PreviewCategory,
} from '../lib/fileUtils';
import { ensureUtf8Charset } from '../lib/fileUtils';
import { docxToHtml } from '../lib/docxPreview';

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

export interface PreviewModalProps {
  src: string;
  fileName: string;
  fileSize: number;
  category: PreviewCategory;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function PreviewModal({
  src,
  fileName,
  fileSize,
  category,
  onClose,
}: PreviewModalProps) {
  const safeSrc = ensureUtf8Charset(src);

  // ESC 键关闭
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // 阻止 body 滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="preview-modal-overlay" onClick={onClose}>
      {/* Header bar */}
      <div className="preview-modal-header" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-info">
          <span className="preview-modal-name" title={fileName}>
            {fileName}
          </span>
          <span className="preview-modal-meta">
            <span className="preview-modal-type">
              {getCategoryLabel(category)}
            </span>
            <span className="preview-modal-dot">·</span>
            <span className="preview-modal-size">
              {formatFileSize(fileSize)}
            </span>
          </span>
        </div>
        <button
          type="button"
          className="preview-modal-close"
          onClick={onClose}
          title="关闭 (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content area */}
      <div
        className="preview-modal-body"
        onClick={(e) => e.stopPropagation()}
      >
        <PreviewContent
          src={safeSrc}
          category={category}
          fileName={fileName}
        />
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Content renderer (delegates by category)                           */
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
          className="preview-modal-frame"
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
        <div className="preview-modal-fallback">
          此文件类型不支持预览
        </div>
      );
  }
}

/* ------------------------------------------------------------------ */
/* DOCX preview (loads on demand via mammoth.js)                       */
/* ------------------------------------------------------------------ */

function DocxPreview({ src }: { src: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    docxToHtml(src)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled)
          setHtml('<p style="color:#f85149;">Failed to load DOCX</p>');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (loading) {
    return (
      <div className="preview-modal-loading">
        <Loader2 size={28} className="animate-spin" />
        <span>正在解析 DOCX…</span>
      </div>
    );
  }

  return (
    <div className="preview-modal-docx">
      <div
        className="preview-modal-docx-content"
        dangerouslySetInnerHTML={{ __html: html ?? '<p>加载中…</p>' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Image with zoom & pan                                               */
/* ------------------------------------------------------------------ */

function ImageZoom({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; baseTx: number; baseTy: number } | null>(null);

  // Wheel zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.2), 8));
  }, []);

  // Pan start
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
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setTx(dragRef.current.baseTx + dx);
    setTy(dragRef.current.baseTy + dy);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  return (
    <div className="preview-modal-image-area">
      <img
        src={src}
        alt={alt}
        className="preview-modal-image"
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
      {/* Zoom controls */}
      <div className="preview-modal-zoom-bar">
        <button
          type="button"
          className="preview-modal-zoom-btn"
          onClick={() => setScale((s) => Math.max(s * 0.8, 0.2))}
          title="缩小"
        >
          −
        </button>
        <span className="preview-modal-zoom-label">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="preview-modal-zoom-btn"
          onClick={() => setScale((s) => Math.min(s * 1.25, 8))}
          title="放大"
        >
          +
        </button>
        <button
          type="button"
          className="preview-modal-zoom-btn"
          onClick={reset}
          title="重置 (双击图片)"
        >
          ↺
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Text preview                                                        */
/* ------------------------------------------------------------------ */

function TextPreview({ src }: { src: string }) {
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    try {
      const commaIdx = src.indexOf(',');
      const header = src.substring(5, commaIdx);
      const isBase64 = header.includes('base64');
      const payload = src.substring(commaIdx + 1);
      if (isBase64) {
        setText(decodeURIComponent(escape(atob(payload))));
      } else {
        setText(decodeURIComponent(payload));
      }
    } catch {
      setText('无法读取文件内容');
    } finally {
      setLoading(false);
    }
  }, [src]);

  if (loading) {
    return (
      <div className="preview-modal-loading">
        <Loader2 size={28} className="animate-spin" />
        <span>加载中…</span>
      </div>
    );
  }

  return <pre className="preview-modal-text">{text}</pre>;
}
