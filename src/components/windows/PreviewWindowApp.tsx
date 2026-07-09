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
import { useWindowThemeSync } from '../../lib/windows/useWindowThemeSync';
import PdfPreview from '../editor/nodes/PdfPreview';
import { useI18n } from '../../lib/core/i18n';

export default function PreviewWindowApp() {
  const [data, setData] = useState<PreviewPayload | null>(null);
  const { t } = useI18n();

  // Sync theme with main window (includes app theme colors)
  useWindowThemeSync();

  useEffect(() => {
    fetchPreviewData().then((payload) => {
      if (payload) setData(payload);
    });
  }, []);

  if (!data) {
    return (
      <div className="preview-loading">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  const category = data.category as PreviewCategory;
  const safeSrc = ensureUtf8Charset(data.src);

  return (
    <div className="preview-root">
      {/* Minimal header - only close button */}
      <button
        type="button"
        className="preview-close"
        onClick={closePreviewWindow}
        title={t('preview.closeWindow')}
      >
        <X size={16} />
      </button>

      {/* Content */}
      <PreviewContent src={safeSrc} category={category} fileName={data.fileName} html={data.html} />
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
  const { t } = useI18n();
  // ── Native DOM iframe for HTML preview (React 19 sandbox workaround) ──
  const htmlIframeRef = useRef<HTMLIFrameElement | null>(null);
  const htmlContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (category !== 'html') return;
    const container = htmlContainerRef.current;
    if (!container) return;

    if (!htmlIframeRef.current) {
      const iframe = document.createElement('iframe');
      iframe.className = 'preview-frame';
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
        <div ref={htmlContainerRef} className="preview-frame-wrap" />
      );

    case 'pdf':
      return <PdfPreview src={src} fillContainer />;

    case 'docx':
      return <DocxPreview src={src} />;

    case 'image':
      return <ImageZoom src={src} />;

    case 'audio':
      return <MediaPreview src={src} kind="audio" />;

    case 'video':
      return <MediaPreview src={src} kind="video" />;

    case 'text':
      return <TextPreview src={src} />;

    default:
      return <div className="preview-fallback">{t('preview.notSupported')}</div>;
  }
}

/* ------------------------------------------------------------------ */
/* DOCX preview                                                        */
/* ------------------------------------------------------------------ */

function DocxPreview({ src }: { src: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    docxToHtml(src)
      .then((result) => !cancelled && setHtml(result))
      .catch(() =>
        !cancelled && setHtml(`<p style="color:#f85149;">${t('preview.docxError')}</p>`),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [src, t]);

  if (loading)
    return (
      <div className="preview-loading-center">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );

  return (
    <div className="preview-docx">
      <div
        className="preview-docx-content"
        dangerouslySetInnerHTML={{ __html: html ?? '' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Image with zoom & pan                                              */
/* ------------------------------------------------------------------ */

function ImageZoom({ src }: { src: string }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ startX: number; startY: number; baseTx: number; baseTy: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => Math.min(Math.max(s * delta, 0.1), 10));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseTx: tx,
        baseTy: ty,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [tx, ty],
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

  const fit = useCallback(() => {
    const img = document.querySelector('.preview-image') as HTMLImageElement;
    if (!img) return;
    const container = img.parentElement;
    if (!container) return;
    const scaleX = (container.clientWidth * 0.9) / img.naturalWidth;
    const scaleY = (container.clientHeight * 0.9) / img.naturalHeight;
    setScale(Math.min(scaleX, scaleY, 3));
    setTx(0);
    setTy(0);
  }, []);

  // Auto fit on load
  const onLoad = useCallback(() => {
    setTimeout(fit, 50);
  }, [fit]);

  return (
    <div className="preview-image-area">
      <img
        src={src}
        alt=""
        className="preview-image"
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onLoad={onLoad}
        draggable={false}
      />
      <div className="preview-zoom">
        <button type="button" onClick={() => setScale((s) => Math.max(s * 0.8, 0.1))}>−</button>
        <button type="button" onClick={() => setScale((s) => Math.min(s * 1.25, 10))}>+</button>
        <button type="button" onClick={fit}>⊗</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audio / Video preview                                               */
/* ------------------------------------------------------------------ */

function MediaPreview({ src, kind }: { src: string; kind: 'audio' | 'video' }) {
  return (
    <div className="preview-media">
      {kind === 'video' ? (
        <video src={src} controls autoPlay className="preview-video" />
      ) : (
        <audio src={src} controls autoPlay className="preview-audio" />
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
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(src)
      .then((res) => res.text())
      .then((txt) => {
        if (!cancelled) setText(txt);
      })
      .catch(() => {
        if (!cancelled) setText(t('preview.textError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [src, t]);

  if (loading)
    return (
      <div className="preview-loading-center">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );

  return <pre className="preview-text">{text}</pre>;
}
