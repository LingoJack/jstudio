/**
 * FileView — React NodeView for the file attachment block.
 *
 * Three visual states:
 *   1. Placeholder (no src): dashed-border box prompting the user to click
 *      and pick a file via the Tauri file dialog.
 *   2. Card mode: compact card showing file name, type, and size.
 *   3. Preview mode: inline rendered preview of the file content.
 *
 * Preview support:
 *   - HTML / SVG  → sandboxed <iframe> (native DOM, bypasses React 19 sandbox bug)
 *   - PDF         → custom pdf.js viewer (PdfPreview component)
 *   - DOCX        → mammoth.js converts to HTML, rendered in a container
 *   - Image       → <img>
 *   - Audio       → <audio> with native controls
 *   - Video       → <video> with native controls
 *   - Text (txt, md, json, csv, code, etc.) → <pre>
 *
 * Selection model:
 *   - When NOT selected, a transparent overlay sits above <iframe> previews
 *     so the user can click to select the node (iframes eat mouse events).
 *   - When selected, the overlay disappears so the user can interact with
 *     the preview content. A floating toolbar (top-right) and resize handle
 *     (bottom-right) appear, matching ImageView's UX.
 *
 * React 19 sandbox iframe workaround:
 *   - HTML/SVG preview uses native DOM to create the iframe (not JSX).
 *   - React 19 dev mode traverses DOM during reconciliation, including
 *     sandboxed iframes, which triggers SecurityError: Sandbox access violation.
 *   - By using native DOM, React never sees the iframe's internals.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper, type Editor } from '@tiptap/react';
import { File as FileIcon, Eye, PanelsTopLeft, Loader2, Maximize2 } from 'lucide-react';

import { useStore } from '../../../store/useStore';
import { ipc } from '../../../lib/core/ipc';
import {
  formatFileSize,
  getExtension,
  getMimeType,
  getPreviewCategory,
  getCategoryLabel,
  ensureUtf8Charset,
  FILE_EXTENSIONS,
  type PreviewCategory,
} from '../../../lib/editor/fileUtils';
import { docxToHtml } from '../../../lib/editor/docxPreview';
import { saveBytesAsAsset, genStoredName } from '../../../lib/editor/upload';
import { useAssetBlobUrl } from '../../../lib/editor/content/useAssetBlobUrl';
import { useNodeResize } from '../hooks/useNodeResize';
import { useEditorWidth } from '../hooks/useEditorWidth';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import { useNodeSelected } from '../hooks/useNodeSelected';
import { useNodeSelectionClick } from '../hooks/useNodeSelectionClick';
import { UploadIcon } from '../../ui/icons';
import {
  BlockToolbar,
  AlignButtonGroup,
  BlockToolbarButton,
  BlockToolbarDivider,
} from '../../ui/BlockToolbar';
import { ResizeHandle } from '../../ui/ResizeHandle';
import type { FileNodeAttributes } from '../../../lib/editor/extensions/fileExtension';
import { openPreviewWindow } from '../../../lib/windows/previewWindow';
import { useI18n } from '../../../lib/core/i18n';
import PdfPreview from './PdfPreview';

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function FileView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const { t } = useI18n();
  const { src, fileName, fileSize, fileType, displayMode, width, widthPct, height, heightPct, align } =
    node.attrs as FileNodeAttributes;

  const studioRoot = useStore((s) => s.studioRoot);
  const activeDocId = useStore((s) => s.activeDocId);

  // Inline previews use a same-origin blob URL because Tauri's
  // `asset://localhost` origin is treated as cross-origin to the page's
  // `tauri://localhost` origin and gets blocked by WebKit.
  const {
    url: blobSrc,
    loading: assetLoading,
    error: assetError,
  } = useAssetBlobUrl(src ?? '', studioRoot, activeDocId);

  // "Real" selection: only a genuine NodeSelection on THIS node counts as
  // selected — NOT a text selection that sweeps across the file block.
  // TipTap's NodeViewProps.selected turns true for the latter, wrongly
  // showing the toolbar/ring/handle while the user selects neighbouring text.
  const selected = useNodeSelected((editor as Editor | null) ?? null, getPos);

  // Keyboard navigation for the floating toolbar (Tab/Enter/Esc)
  const canPreview = getPreviewCategory(fileType, fileName) !== 'other';
  const isPreviewMode = displayMode === 'preview' && canPreview;
  // Button count depends on whether preview buttons are shown:
  //   align-left, align-center, [toggle preview], [maximize]
  const toolbarBtnCount = 2 + (canPreview ? (isPreviewMode ? 2 : 1) : 0);
  const {
    activeIndex,
    registerButton,
    editing,
    interactiveRef,
    interactiveProps,
  } = useNodeToolbarNav(
    selected,
    (editor as Editor | null) ?? null,
    toolbarBtnCount,
    isPreviewMode, // interactive only when an inline preview is showing
  );

  const effectiveAlign = (align ?? 'center') as 'left' | 'center';

  // ── Native DOM iframe management (React 19 sandbox workaround) ──
  //
  // React 19 in dev mode traverses the DOM tree during reconciliation,
  // including sandboxed iframes, triggering SecurityError: Sandbox access violation.
  // We render the HTML/SVG iframe via native DOM so React never sees its internals.
  const htmlIframeRef = useRef<HTMLIFrameElement | null>(null);
  const htmlIframeContainerRef = useRef<HTMLDivElement | null>(null);

  // When entering edit mode, move focus into the inline preview so its native
  // controls (iframe content, <video>/<audio> keyboard shortcuts, PDF viewer)
  // receive keystrokes instead of ProseMirror.
  const previewRef = useRef<HTMLDivElement | null>(null);
  const setPreviewRef = useCallback(
    (el: HTMLDivElement | null) => {
      previewRef.current = el;
      interactiveRef(el);
    },
    [interactiveRef],
  );
  useEffect(() => {
    if (!editing) return;
    const container = previewRef.current;
    if (!container) return;
    const focusable = container.querySelector(
      'iframe, video, audio, [tabindex]',
    ) as HTMLElement | null;
    const target = focusable ?? container;
    if (target.tabIndex < 0 && target === container) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, [editing]);

  // Preview category for the current file (html/pdf/image/audio/video/docx/text/other).
  const category = useMemo(
    () => getPreviewCategory(fileType, fileName),
    [fileType, fileName],
  );

  /**
   * Patched src: ensures text-based data URLs include `charset=utf-8`
   * so HTML/SVG/text previews render correctly instead of mojibake.
   * Operates on the resolved blob URL; a no-op for non-data URLs.
   */
  const safeSrc = useMemo(() => ensureUtf8Charset(blobSrc), [blobSrc]);

  // ── Native DOM iframe for HTML/SVG preview (React 19 sandbox workaround) ──
  // Create/update/remove the iframe via native DOM so React never traverses it.
  useEffect(() => {
    const container = htmlIframeContainerRef.current;
    if (!container) return;

    // Only create iframe when in preview mode AND category is html
    const shouldShowIframe = isPreviewMode && category === 'html' && safeSrc;

    if (shouldShowIframe && !htmlIframeRef.current) {
      // Create iframe via native DOM
      const iframe = document.createElement('iframe');
      iframe.className = 'file-block-preview-frame';
      iframe.title = fileName;
      iframe.sandbox.add('allow-same-origin');
      iframe.src = safeSrc;
      container.appendChild(iframe);
      htmlIframeRef.current = iframe;
    }

    // Remove iframe when no longer needed
    if (!shouldShowIframe && htmlIframeRef.current) {
      htmlIframeRef.current.remove();
      htmlIframeRef.current = null;
    }

    // Update src if it changed (iframe already exists)
    if (
      shouldShowIframe &&
      htmlIframeRef.current &&
      htmlIframeRef.current.src !== safeSrc
    ) {
      htmlIframeRef.current.src = safeSrc;
    }
  }, [isPreviewMode, category, safeSrc, fileName]);

  const [loading, setLoading] = useState(false);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);

  // Open file content in a new independent OS window for enlarged preview.
  const handleOpenPreview = useCallback(() => {
    if (!src) return;
    openPreviewWindow({
      src, // portable `assets/…` path; preview window resolves via docContext
      fileName,
      fileSize,
      category: getPreviewCategory(fileType, fileName),
      docContext: { studioRoot, docId: activeDocId },
    });
  }, [src, fileName, fileSize, fileType, studioRoot, activeDocId]);

  /* -------------------------------------------------------------- */
  /* Upload handler                                                 */
  /* -------------------------------------------------------------- */

  const handlePlaceholderClick = useCallback(async () => {
    if (src) return;
    setLoading(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'Files', extensions: FILE_EXTENSIONS }],
      });
      if (!filePath || typeof filePath !== 'string') return;

      const originalName = filePath.split(/[/\\]/).pop() || 'file';
      const ext = getExtension(originalName);
      const mime = getMimeType(ext);

      const bytes = await ipc.readFileBytes(filePath);
      const sizeBytes = bytes.length;
      const storedName = genStoredName('file', ext);
      const ref = await saveBytesAsAsset(bytes, mime, activeDocId, storedName);

      // Auto-select initial display mode.
      const autoMode: 'card' | 'preview' =
        category === 'other' || category === 'text' ? 'card' : 'preview';
      const actualCategory = getPreviewCategory(mime, originalName);
      const autoModeFinal: 'card' | 'preview' =
        actualCategory === 'other' || actualCategory === 'text'
          ? 'card'
          : 'preview';

      updateAttributes({
        src: ref,
        fileName: originalName,
        fileSize: sizeBytes,
        fileType: mime,
        displayMode: autoModeFinal,
        width: null,
        widthPct: null,
      });
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, activeDocId, updateAttributes]);

  /* -------------------------------------------------------------- */
  /* DOCX preview: load on demand                                   */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    if (
      category === 'docx' &&
      isPreviewMode &&
      src &&
      !docxHtml &&
      !docxLoading
    ) {
      setDocxLoading(true);
      docxToHtml(safeSrc)
        .then((html) => setDocxHtml(html))
        .catch(() =>
          setDocxHtml(`<p style="color:#f85149;">${t('preview.docxError')}</p>`),
        )
        .finally(() => setDocxLoading(false));
    }
  }, [category, isPreviewMode, src, safeSrc, docxHtml, docxLoading, t]);

  /* -------------------------------------------------------------- */
  /* Resize: drag the bottom-right handle (via shared useNodeResize) */
  /* -------------------------------------------------------------- */

  const containerRef = useRef<HTMLDivElement>(null);

  // Track editor width for pct ↔ px conversion.
  const editorWidth = useEditorWidth();

  // Lazy migration: if legacy pixel `width` exists but `widthPct` is null,
  // compute the percentage from the current editor width and persist it.
  useEffect(() => {
    if (width != null && widthPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((width / editorWidth) * 100)));
      updateAttributes({ widthPct: pct, width: null });
    }
  }, [width, widthPct, editorWidth, updateAttributes]);

  // Lazy migration: if legacy pixel `height` exists but `heightPct` is null,
  // compute the percentage from the current editor width and persist it.
  useEffect(() => {
    if (height != null && heightPct == null && editorWidth > 0) {
      const pct = Math.min(100, Math.max(1, Math.round((height / editorWidth) * 100)));
      updateAttributes({ heightPct: pct, height: null });
    }
  }, [height, heightPct, editorWidth, updateAttributes]);

  // Compute the pixel width from widthPct (preferred) or fall back to legacy px.
  const widthPx = widthPct != null ? Math.round((widthPct * editorWidth) / 100) : width;

  // Compute the pixel height from heightPct (preferred) or fall back to legacy px.
  const heightPx = heightPct != null ? Math.round((heightPct * editorWidth) / 100) : height;

  // Separate ref for reading DOM in maxWidth (before hook call).
  const figureRefInternal = useRef<HTMLDivElement>(null);

  const { ref: figureRef, displayWidth, displayHeight, onResizeStart } =
    useNodeResize<HTMLDivElement>({
      width: widthPx,
      // Only track height in preview mode — card mode height is content-driven.
      height: isPreviewMode ? heightPx : undefined,
      updateAttributes,
      minWidth: 200,
      minHeight: 150,
      fallbackWidth: 400,
      fallbackHeight: 300,
      maxWidth: () => {
        const el = figureRefInternal.current;
        const editorSurface = el?.closest('.ProseMirror') as HTMLElement | null;
        if (editorSurface) {
          const style = getComputedStyle(editorSurface);
          const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
          return editorSurface.clientWidth - padX - 24;
        }
        return window.innerWidth - 24;
      },
      onCommit: (finalWidth, finalHeight) => {
        const pct =
          editorWidth > 0
            ? Math.min(100, Math.max(1, Math.round((finalWidth / editorWidth) * 100)))
            : 50;
        const attrs: Record<string, number | null> = { widthPct: pct, width: null };
        if (isPreviewMode && finalHeight !== null) {
          const hPct =
            editorWidth > 0
              ? Math.min(100, Math.max(1, Math.round((finalHeight / editorWidth) * 100)))
              : null;
          attrs.heightPct = hPct;
          attrs.height = null;
        }
        return attrs;
      },
    });

  // Merge hook's ref + internal ref onto the same DOM element.
  const setFigureRef = useCallback((el: HTMLDivElement | null) => {
    figureRef.current = el;
    figureRefInternal.current = el;
  }, []);

  /* -------------------------------------------------------------- */
  /* Inline styles driven by displayWidth / displayHeight           */
  /* -------------------------------------------------------------- */

  const figureStyle: React.CSSProperties = {};
  if (displayWidth) {
    figureStyle.width = `${displayWidth}px`;
  } else {
    figureStyle.width = '400px';
  }

  // In preview mode, apply the tracked height to the preview content area.
  const previewStyle: React.CSSProperties = {};
  if (isPreviewMode && displayHeight) {
    previewStyle.height = `${displayHeight}px`;
  }

  // Reliable click-to-select fallback. When NOT selected, a click anywhere on
  // the figure (card body, or the transparent overlay above an iframe preview)
  // selects the node — covering WKWebView's flaky native node-selection. When
  // already selected we skip it so the user can interact with the live preview
  // (PDF/media controls) without re-selecting and stealing focus.
  const handleSelectMouseDown = useNodeSelectionClick(editor, getPos, {
    selected,
    skipWhenSelected: true,
  });

  /* -------------------------------------------------------------- */
  /* Render                                                         */
  /* -------------------------------------------------------------- */

  return (
    <NodeViewWrapper className="file-block-wrapper" data-align={effectiveAlign} as="div">
      <div className="file-block-container" ref={containerRef}>
        {/* Placeholder state */}
        {!src ? (
          <button
            type="button"
            className="image-node-placeholder"
            onClick={handlePlaceholderClick}
            disabled={loading}
            aria-label={t('image.selectFile')}
          >
            <span className="image-node-placeholder-icon">
              {loading ? (
                <Loader2 size={28} className="animate-spin" />
              ) : (
                <UploadIcon />
              )}
            </span>
            <span className="image-node-placeholder-text">
              {loading ? t('image.loading') : t('image.uploadFile')}
            </span>
          </button>
        ) : (
          /* Loaded state */
          <div
            ref={setFigureRef}
            className={`file-block-figure ${selected ? 'is-selected' : ''} ${
              editing ? 'is-editing' : ''
            } ${isPreviewMode ? 'is-preview' : 'is-card'}`}
            style={figureStyle}
            onMouseDown={handleSelectMouseDown}
            {...interactiveProps}
          >
            {/* Floating toolbar (top-right) — visible when selected */}
            <BlockToolbar selected={selected}>
              <AlignButtonGroup
                nav={{ activeIndex, registerButton }}
                align={effectiveAlign}
                onAlignChange={(a) => updateAttributes({ align: a })}
              />
              {canPreview && (
                <>
                  <BlockToolbarDivider />
                  <BlockToolbarButton
                    nav={{ activeIndex, registerButton }}
                    index={2}
                    title={isPreviewMode ? t('image.cardMode') : t('image.previewMode')}
                    onClick={() =>
                      updateAttributes({
                        displayMode: isPreviewMode ? 'card' : 'preview',
                      })
                    }
                  >
                    {isPreviewMode ? <PanelsTopLeft size={15} /> : <Eye size={15} />}
                  </BlockToolbarButton>
                  {isPreviewMode && (
                    <BlockToolbarButton
                      nav={{ activeIndex, registerButton }}
                      index={3}
                      title={t('image.zoomNewWindow')}
                      onClick={handleOpenPreview}
                    >
                      <Maximize2 size={15} />
                    </BlockToolbarButton>
                  )}
                </>
              )}
            </BlockToolbar>

            {/* Card mode */}
            {!isPreviewMode && (
              <div className="file-block-card" contentEditable={false}>
                <div className="file-block-card-icon">
                  <FileIcon size={24} />
                </div>
                <div className="file-block-card-info">
                  <span className="file-block-card-name" title={fileName}>
                    {fileName}
                  </span>
                  <span className="file-block-card-meta">
                    <span className="file-block-card-type">
                      {getCategoryLabel(category)}
                    </span>
                    <span className="file-block-card-dot">·</span>
                    <span className="file-block-card-size">
                      {formatFileSize(fileSize)}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Preview mode */}
            {isPreviewMode && (
              <div
                ref={setPreviewRef}
                className="file-block-preview"
                contentEditable={false}
                style={previewStyle}
              >
                {/* Transparent overlay only when NOT selected — lets the user
                    click to select the node even over an <iframe>. Once the
                    block is selected the overlay is removed so the preview's
                    own controls (PDF page/zoom toolbar, media controls) are
                    immediately clickable without entering edit mode. */}
                {!selected && !assetLoading && !assetError && (
                  <div className="file-block-preview-overlay" />
                )}

                {assetLoading ? (
                  <div className="file-block-preview-loading">
                    <Loader2 size={20} className="animate-spin" />
                    <span>{t('image.loading')}</span>
                  </div>
                ) : assetError ? (
                  <div className="file-block-preview-loading">
                    <span>{t('image.cannotRead')}</span>
                  </div>
                ) : (
                  <>
                    {/* HTML / SVG — native DOM iframe (React 19 sandbox workaround) */}
                    {/* The iframe is created/managed by useEffect above, not JSX.
                        React 19 dev mode traverses DOM including sandboxed iframes,
                        triggering SecurityError. Native DOM bypasses this.
                        contentEditable={false} ensures ProseMirror ignores this container. */}
                    {category === 'html' && (
                      <div
                        ref={htmlIframeContainerRef}
                        className="file-block-preview-frame-container"
                        contentEditable={false}
                      >
                        {/* iframe inserted by useEffect, not JSX */}
                      </div>
                    )}

                    {/* PDF — custom pdf.js viewer with zoom / pan controls */}
                    {category === 'pdf' && (
                      <PdfPreview src={safeSrc} />
                    )}

                    {/* Image */}
                    {category === 'image' && (
                      <div className="file-block-preview-image-wrap">
                        <img
                          src={safeSrc}
                          alt={fileName}
                          className="file-block-preview-image"
                        />
                      </div>
                    )}

                    {/* Audio */}
                    {category === 'audio' && (
                      <div className="file-block-preview-media">
                        <audio src={safeSrc} controls className="file-block-preview-audio" />
                      </div>
                    )}

                    {/* Video */}
                    {category === 'video' && (
                      <div className="file-block-preview-media">
                        <video
                          src={safeSrc}
                          controls
                          className="file-block-preview-video"
                        />
                      </div>
                    )}

                    {/* DOCX */}
                    {category === 'docx' && (
                      <div className="file-block-preview-docx">
                        {docxLoading ? (
                          <div className="file-block-preview-loading">
                            <Loader2 size={20} className="animate-spin" />
                            <span>{t('image.parsingDocx')}</span>
                          </div>
                        ) : (
                          <div
                            className="file-block-preview-docx-content"
                            dangerouslySetInnerHTML={{
                              __html: docxHtml ?? `<p>${t('image.loading')}</p>`,
                            }}
                          />
                        )}
                      </div>
                    )}

                    {/* Text */}
                    {category === 'text' && <FileTextPreview src={safeSrc} />}
                  </>
                )}
              </div>
            )}

            {/* Resize handle — at figure level so it works in BOTH card & preview mode */}
            {selected && <ResizeHandle onPointerDown={onResizeStart} />}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/* ------------------------------------------------------------------ */
/* Text preview sub-component                                         */
/* ------------------------------------------------------------------ */

/** Fetches the text content from a URL (asset or data) and renders it in a <pre>. */
function FileTextPreview({ src }: { src: string }) {
  const { t } = useI18n();
  const [text, setText] = useState<string>('');
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
        if (!cancelled) setText(t('image.cannotRead'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (loading) {
    return (
      <div className="file-block-preview-loading">
        <Loader2 size={20} className="animate-spin" />
        <span>{t('image.loading')}</span>
      </div>
    );
  }

  return <pre className="file-block-preview-text">{text}</pre>;
}
