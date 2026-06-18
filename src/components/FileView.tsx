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
 *   - HTML / SVG  → sandboxed <iframe>
 *   - PDF         → <iframe> (browser native PDF viewer)
 *   - DOCX        → mammoth.js converts to HTML, rendered in a container
 *   - Image       → <img>
 *   - Text (txt, md, json, csv, code, etc.) → <pre>
 *
 * Selection model:
 *   - When NOT selected, a transparent overlay sits above <iframe> previews
 *     so the user can click to select the node (iframes eat mouse events).
 *   - When selected, the overlay disappears so the user can interact with
 *     the preview content. A floating toolbar (top-right) and resize handle
 *     (bottom-right) appear, matching ImageView's UX.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { File as FileIcon, Eye, PanelsTopLeft, Loader2 } from 'lucide-react';

import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';
import {
  formatFileSize,
  getExtension,
  getMimeType,
  getPreviewCategory,
  getCategoryLabel,
  type PreviewCategory,
} from '../lib/fileUtils';
import { bytesToDataUrl, genStoredName } from '../lib/upload';
import { UploadIcon, AlignLeftIcon, AlignCenterIcon } from './shared/icons';
import type { FileNodeAttributes } from '../lib/fileExtension';

/* ------------------------------------------------------------------ */
/* DOCX preview via mammoth (lazy-loaded)                            */
/* ------------------------------------------------------------------ */

/** Convert a DOCX data URL to an HTML string using mammoth.js. */
async function docxToHtml(dataUrl: string): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser');
  const base64 = dataUrl.split(',')[1] ?? '';
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const arrayBuffer = bytes.buffer;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value || '<p style="color:#999;">Empty document</p>';
}

/* ------------------------------------------------------------------ */
/* Extension filters for the Tauri dialog                             */
/* ------------------------------------------------------------------ */

const FILE_EXTENSIONS = [
  'html', 'htm', 'pdf', 'docx',
  'txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml',
  'js', 'ts', 'jsx', 'tsx', 'css', 'scss',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh',
  'sql', 'toml', 'ini', 'log',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
];

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function FileView({
  node,
  selected,
  updateAttributes,
}: NodeViewProps) {
  const { src, fileName, fileSize, fileType, displayMode, width, align } =
    node.attrs as FileNodeAttributes;

  const effectiveAlign = (align ?? 'center') as 'left' | 'center';

  const [loading, setLoading] = useState(false);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);

  const category = useMemo(
    () => getPreviewCategory(fileType, fileName),
    [fileType, fileName],
  );

  const canPreview = category !== 'other';
  const isPreviewMode = displayMode === 'preview' && canPreview;

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

      const activeDocId = useStore.getState().activeDocId;
      const originalName = filePath.split(/[/\\]/).pop() || 'file';
      const ext = getExtension(originalName);
      const mime = getMimeType(ext);

      const bytes = await storage.readFileBytes(filePath);
      const sizeBytes = bytes.length;
      const storedName = genStoredName('file', ext);
      const dataUrl = await bytesToDataUrl(bytes, mime, activeDocId, storedName);

      // Auto-select initial display mode.
      const autoMode: 'card' | 'preview' =
        category === 'other' || category === 'text' ? 'card' : 'preview';
      const actualCategory = getPreviewCategory(mime, originalName);
      const autoModeFinal: 'card' | 'preview' =
        actualCategory === 'other' || actualCategory === 'text'
          ? 'card'
          : 'preview';

      updateAttributes({
        src: dataUrl,
        fileName: originalName,
        fileSize: sizeBytes,
        fileType: mime,
        displayMode: autoModeFinal,
        width: null,
      });
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, updateAttributes]);

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
      docxToHtml(src)
        .then((html) => setDocxHtml(html))
        .catch(() =>
          setDocxHtml('<p style="color:#f85149;">Failed to load DOCX</p>'),
        )
        .finally(() => setDocxLoading(false));
    }
  }, [category, isPreviewMode, src, docxHtml, docxLoading]);

  /* -------------------------------------------------------------- */
  /* Resize: drag the bottom-right handle                           */
  /* -------------------------------------------------------------- */

  const containerRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);
  const [displayWidth, setDisplayWidth] = useState<number | null>(width ?? null);
  const displayWidthRef = useRef<number | null>(displayWidth);
  displayWidthRef.current = displayWidth;

  // Keep local display width in sync when the node attr changes externally.
  useEffect(() => {
    if (!resizingRef.current) {
      setDisplayWidth(width ?? null);
    }
  }, [width]);

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth =
        displayWidth ?? figureRef.current?.offsetWidth ?? 400;

      /* upper bound: editor surface visible width (minus a small margin) */
      const editorSurface = figureRef.current?.closest(
        '.ProseMirror'
      ) as HTMLElement | null;
      const maxWidth =
        (editorSurface?.clientWidth ?? window.innerWidth) - 24;

      resizingRef.current = true;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.min(
          Math.max(200, startWidth + delta),
          maxWidth
        );
        setDisplayWidth(newWidth);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        resizingRef.current = false;
        const finalWidth = displayWidthRef.current ?? startWidth;
        updateAttributes({ width: finalWidth });
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [displayWidth, updateAttributes],
  );

  /* -------------------------------------------------------------- */
  /* Inline styles driven by displayWidth                           */
  /* -------------------------------------------------------------- */

  const figureStyle: React.CSSProperties = {};
  if (displayWidth) {
    figureStyle.width = `${displayWidth}px`;
  } else {
    figureStyle.width = '400px';
  }

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
            aria-label="点击选择文件"
          >
            <span className="image-node-placeholder-icon">
              {loading ? (
                <Loader2 size={28} className="animate-spin" />
              ) : (
                <UploadIcon />
              )}
            </span>
            <span className="image-node-placeholder-text">
              {loading ? '加载中…' : '点击上传文件'}
            </span>
          </button>
        ) : (
          /* Loaded state */
          <div
            ref={figureRef}
            className={`file-block-figure ${selected ? 'is-selected' : ''} ${
              isPreviewMode ? 'is-preview' : 'is-card'
            }`}
            style={figureStyle}
          >
            {/* Floating toolbar (top-right) — visible when selected */}
            {selected && (
              <div className="file-block-toolbar" contentEditable={false}>
                <button
                  type="button"
                  className={`file-block-toolbar-btn ${
                    effectiveAlign === 'left' ? 'is-active' : ''
                  }`}
                  onClick={() => updateAttributes({ align: 'left' })}
                  title="左对齐"
                >
                  <AlignLeftIcon />
                </button>
                <button
                  type="button"
                  className={`file-block-toolbar-btn ${
                    effectiveAlign === 'center' ? 'is-active' : ''
                  }`}
                  onClick={() => updateAttributes({ align: 'center' })}
                  title="居中"
                >
                  <AlignCenterIcon />
                </button>
                {canPreview && (
                  <>
                    <span className="file-block-toolbar-divider" />
                    <button
                      type="button"
                      className="file-block-toolbar-btn"
                      onClick={() =>
                        updateAttributes({
                          displayMode: isPreviewMode ? 'card' : 'preview',
                        })
                      }
                      title={isPreviewMode ? '切换到卡片模式' : '切换到预览模式'}
                    >
                      {isPreviewMode ? <PanelsTopLeft size={15} /> : <Eye size={15} />}
                    </button>
                  </>
                )}
              </div>
            )}

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
              <div className="file-block-preview" contentEditable={false}>
                {/* Transparent overlay when NOT selected — lets the user
                    click to select the node even over an <iframe>. */}
                {!selected && (
                  <div className="file-block-preview-overlay" />
                )}

                {/* HTML / SVG */}
                {category === 'html' && (
                  <iframe
                    src={src}
                    className="file-block-preview-frame"
                    sandbox="allow-same-origin"
                    title={fileName}
                  />
                )}

                {/* PDF */}
                {category === 'pdf' && (
                  <iframe
                    src={src}
                    className="file-block-preview-frame"
                    title={fileName}
                  />
                )}

                {/* Image */}
                {category === 'image' && (
                  <div className="file-block-preview-image-wrap">
                    <img
                      src={src}
                      alt={fileName}
                      className="file-block-preview-image"
                    />
                  </div>
                )}

                {/* DOCX */}
                {category === 'docx' && (
                  <div className="file-block-preview-docx">
                    {docxLoading ? (
                      <div className="file-block-preview-loading">
                        <Loader2 size={20} className="animate-spin" />
                        <span>正在解析 DOCX…</span>
                      </div>
                    ) : (
                      <div
                        className="file-block-preview-docx-content"
                        dangerouslySetInnerHTML={{
                          __html: docxHtml ?? '<p>加载中…</p>',
                        }}
                      />
                    )}
                  </div>
                )}

                {/* Text */}
                {category === 'text' && <FileTextPreview src={src} />}
              </div>
            )}

            {/* Resize handle — at figure level so it works in BOTH card & preview mode */}
            {selected && (
              <div
                className="file-block-resize-handle"
                onPointerDown={onResizeStart}
                contentEditable={false}
              />
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/* ------------------------------------------------------------------ */
/* Text preview sub-component                                         */
/* ------------------------------------------------------------------ */

/** Fetches the text content from a data URL and renders it in a <pre>. */
function FileTextPreview({ src }: { src: string }) {
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    try {
      const commaIdx = src.indexOf(',');
      const header = src.substring(5, commaIdx); // strip "data:"
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
      <div className="file-block-preview-loading">
        <Loader2 size={20} className="animate-spin" />
        <span>加载中…</span>
      </div>
    );
  }

  return <pre className="file-block-preview-text">{text}</pre>;
}
