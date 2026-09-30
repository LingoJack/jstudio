/**
 * PreviewWindowApp — 预览新窗口的根组件。
 *
 * 在 main.tsx 中通过 URL 参数 `?window=preview` 检测，
 * 如果是预览窗口则渲染此组件而非主 App。
 *
 * 它通过 Rust 内存命令（get_preview_data）获取主窗口存入的文件数据，
 * 然后全屏渲染对应类型的预览内容。
 */

import { useEffect, useState, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';

import { fetchPreviewData, closePreviewWindow, type PreviewPayload } from '../../lib/windows/previewWindow';
import { ensureUtf8Charset, formatFileSize, getCategoryLabel, type PreviewCategory } from '../../lib/editor/fileUtils';
import { useAssetBlobUrl } from '../../lib/editor/content/useAssetBlobUrl';
import { docxToHtml } from '../../lib/editor/docxPreview';
import { useWindowThemeSync } from '../../lib/windows/useWindowThemeSync';
import { useCloseOnCmdW } from '../../lib/windows/useCloseOnCmdW';
import PdfPreview from '../editor/nodes/PdfPreview';
import MermaidViewer from '../editor/nodes/code-block/MermaidViewer';
import PanZoomStage, { PAN_BUTTONS, type PanZoomStageHandle } from './PanZoomStage';
import { useI18n } from '../../lib/core/i18n';
import ChildWindowDragBar from './ChildWindowDragBar';

export default function PreviewWindowApp() {
  const [data, setData] = useState<PreviewPayload | null>(null);
  const { t } = useI18n();

  // Sync theme with main window (includes app theme colors)
  useWindowThemeSync();
  // Cmd+W (native "Close Tab" menu) should close this preview window.
  useCloseOnCmdW();

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

  return (
    <div className="preview-root">
      <ChildWindowDragBar />
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
      <PreviewContent
        src={data.src}
        category={category}
        fileName={data.fileName}
        html={data.html}
        mermaidSvg={data.mermaidSvg}
        docContext={data.docContext}
      />
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
  mermaidSvg,
  docContext,
}: {
  src: string;
  category: PreviewCategory;
  fileName: string;
  /** Inline HTML source — when present, the html preview uses `srcDoc`. */
  html?: string;
  /** Rendered mermaid SVG — rendered with the shared pan/zoom stage. */
  mermaidSvg?: string;
  /** Document context for resolving doc-relative assets to blob URLs. */
  docContext?: PreviewPayload['docContext'];
}) {
  const { t } = useI18n();

  // Resolve local assets to same-origin blob URLs; non-asset / empty srcs pass through.
  const { url: resolvedSrc, loading: assetLoading, error: assetError } = useAssetBlobUrl(
    src,
    docContext?.studioRoot ?? '',
    docContext?.docId ?? '',
  );
  const safeSrc = ensureUtf8Charset(resolvedSrc);

  // ── Native DOM iframe for HTML preview (React 19 sandbox workaround) ──
  const htmlIframeRef = useRef<HTMLIFrameElement | null>(null);
  const htmlContainerRef = useRef<HTMLDivElement | null>(null);
  // Pan/zoom stage handle. Wheel/mouse events over the iframe are captured
  // by the iframe's own document and NEVER reach the parent window, so
  // mirrored listeners inside the (same-origin) iframe doc forward them to
  // the stage with coordinates converted into the parent's space.
  const htmlStageRef = useRef<PanZoomStageHandle | null>(null);

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
        iframe.src = safeSrc;
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
        iframe.src = safeSrc;
        iframe.removeAttribute('srcdoc');
      }
    }

    // ── Forward viewer gestures from the iframe document to the stage ──
    // Setting srcdoc/src swaps the document (dropping any previous
    // listeners), so re-attach on every `load`; the doc-level flag keeps
    // re-attachment idempotent against StrictMode's double effect run.
    const forwardPanZoom = () => {
      if (!iframe) return;
      const doc = iframe.contentDocument;
      if (!doc) return;
      const docAny = doc as Document & { __panZoomForwarded?: boolean };
      if (docAny.__panZoomForwarded) return;
      docAny.__panZoomForwarded = true;

      // iframe-viewport coords → parent viewport coords. The iframe's rect
      // is measured post-transform, so rect/clientWidth is the live zoom
      // scale - recomputed per event, never cached.
      const mapPoint = (e: MouseEvent | WheelEvent) => {
        const rect = iframe.getBoundingClientRect();
        const sx = iframe.clientWidth > 0 ? rect.width / iframe.clientWidth : 1;
        const sy = iframe.clientHeight > 0 ? rect.height / iframe.clientHeight : 1;
        return { x: rect.left + e.clientX * sx, y: rect.top + e.clientY * sy };
      };

      doc.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        const { x, y } = mapPoint(e);
        htmlStageRef.current?.handleWheel({
          clientX: x,
          clientY: y,
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaMode: e.deltaMode,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
        });
      }, { passive: false });

      doc.addEventListener('mousedown', (e: MouseEvent) => {
        if (!PAN_BUTTONS.has(e.button)) return;
        e.preventDefault();
        const { x, y } = mapPoint(e);
        htmlStageRef.current?.handlePanStart(x, y);
      });
      doc.addEventListener('mousemove', (e: MouseEvent) => {
        if (!htmlStageRef.current?.isPanning()) return;
        const { x, y } = mapPoint(e);
        htmlStageRef.current?.handlePanMove(x, y);
      });
      doc.addEventListener('mouseup', () => {
        htmlStageRef.current?.handlePanEnd();
      });
      // The parent window's global contextmenu suppression does not reach
      // into the iframe document - suppress it here so right-drag pans.
      doc.addEventListener('contextmenu', (e: Event) => e.preventDefault());
    };

    if (iframe) {
      forwardPanZoom();
      iframe.addEventListener('load', forwardPanZoom);
      return () => iframe.removeEventListener('load', forwardPanZoom);
    }
  }, [category, safeSrc, html, fileName]);

  if (assetLoading) {
    return (
      <div className="preview-loading-center">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (assetError) {
    return (
      <div className="preview-fallback">
        {t('preview.notSupported')}
      </div>
    );
  }

  switch (category) {
    case 'mermaid':
      return (
        <div className="mermaid-window-stage">
          <MermaidViewer
            svg={mermaidSvg ?? null}
            showControls
            wheelMode="always-zoom"
          />
        </div>
      );

    case 'html':
      return (
        <PanZoomStage ref={htmlStageRef} wheelMode="always-zoom">
          <div ref={htmlContainerRef} className="preview-frame-wrap" />
        </PanZoomStage>
      );

    case 'pdf':
      return <PdfPreview src={safeSrc} fillContainer />;

    case 'docx':
      return <DocxPreview src={safeSrc} />;

    case 'image':
      return <ImageZoom src={safeSrc} />;

    case 'audio':
      return <MediaPreview src={safeSrc} kind="audio" />;

    case 'video':
      return <MediaPreview src={safeSrc} kind="video" />;

    case 'text':
      return <TextPreview src={safeSrc} />;

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
/* Image with zoom & pan (shared PanZoomStage — same gestures as the   */
/* mermaid / html windows: wheel zoom, three-button drag pan, dblclick */
/* reset, toolbar)                                                     */
/* ------------------------------------------------------------------ */

function ImageZoom({ src }: { src: string }) {
  // object-fit:contain handles the initial fit; stage scale 1 = fitted.
  return (
    <div className="preview-image-area">
      <PanZoomStage wheelMode="always-zoom" showControls>
        <img src={src} alt="" className="preview-image" draggable={false} />
      </PanZoomStage>
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
