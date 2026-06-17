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
 *   - DOCX        → mammoth.js converts to HTML, rendered in a sandboxed iframe
 *   - Image       → <img>
 *   - Text (txt, md, json, csv, code, etc.) → <pre>
 *
 * A hover toolbar in the top-right corner lets the user toggle between
 * `card` and `preview` display modes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import {
  File as FileIcon,
  Eye,
  PanelsTopLeft,
  Upload,
  Loader2,
} from 'lucide-react';

import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';
import type { FileNodeAttributes } from '../lib/fileExtension';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Format bytes into a human-readable string. */
function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${i === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

/** Extract file extension from a file name. */
function getExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/** Category of a file for determining preview behaviour. */
type PreviewCategory =
  | 'html'
  | 'pdf'
  | 'docx'
  | 'image'
  | 'text'
  | 'other';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'xml', 'yaml', 'yml',
  'js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
  'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'graphql', 'toml', 'ini',
  'conf', 'config', 'env', 'log', 'diff', 'dockerfile',
]);

/** Determine the preview category from MIME type and file extension. */
function getPreviewCategory(
  fileType: string,
  fileName: string,
): PreviewCategory {
  const ext = getExtension(fileName);

  if (fileType === 'text/html' || ext === 'html' || ext === 'htm') return 'html';
  if (fileType === 'image/svg+xml' || ext === 'svg') return 'html';
  if (fileType === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  )
    return 'docx';
  if (fileType.startsWith('image/')) return 'image';
  if (
    fileType.startsWith('text/') ||
    TEXT_EXTENSIONS.has(ext) ||
    ext === 'dockerfile'
  )
    return 'text';

  return 'other';
}

/** Return the lucide icon element for a file category (used in card mode). */
function getCategoryLabel(category: PreviewCategory): string {
  switch (category) {
    case 'html':
      return 'HTML';
    case 'pdf':
      return 'PDF';
    case 'docx':
      return 'DOCX';
    case 'image':
      return 'IMAGE';
    case 'text':
      return 'TEXT';
    default:
      return 'FILE';
  }
}

/* ------------------------------------------------------------------ */
/* DOCX preview via mammoth (lazy-loaded)                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a DOCX data URL to an HTML string using mammoth.js.
 *
 * mammoth is dynamically imported so it doesn't bloat the initial bundle.
 */
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
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function FileView({ node, updateAttributes }: NodeViewProps) {
  const {
    src,
    fileName,
    fileSize,
    fileType,
    displayMode,
  } = node.attrs as FileNodeAttributes;

  const [loading, setLoading] = useState(false);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);

  /* -------------------------------------------------------------- */
  /* Upload handler                                                 */
  /* -------------------------------------------------------------- */

  const handlePlaceholderClick = useCallback(async () => {
    if (src) return; // already has a file
    setLoading(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const filePath = await open({
        multiple: false,
        filters: [
          {
            name: 'Files',
            extensions: [
              'html', 'htm', 'pdf', 'docx',
              'txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml',
              'js', 'ts', 'jsx', 'tsx', 'css', 'scss',
              'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
              'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh',
              'sql', 'toml', 'ini', 'log',
              'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
            ],
          },
        ],
      });
      if (!filePath || typeof filePath !== 'string') return;

      const activeDocId = useStore.getState().activeDocId;

      // Extract original file name from the path.
      const originalName = filePath.split(/[/\\]/).pop() || 'file';
      const ext = getExtension(originalName);

      // Determine MIME type.
      const mimeMap: Record<string, string> = {
        html: 'text/html', htm: 'text/html',
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        svg: 'image/svg+xml',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
        json: 'application/json',
      };
      const mime = mimeMap[ext] || 'application/octet-stream';

      const bytes = await storage.readFileBytes(filePath);
      const sizeBytes = bytes.length;

      let dataUrl: string;
      if (activeDocId) {
        const storedName = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext || 'bin'}`;
        await storage.saveDocAsset(activeDocId, storedName, bytes);
        const base64 = await storage.readDocAssetBase64(activeDocId, storedName);
        dataUrl = `data:${mime};base64,${base64}`;
      } else {
        // Fallback: encode directly.
        const binary = String.fromCharCode(...bytes);
        const base64 = btoa(binary);
        dataUrl = `data:${mime};base64,${base64}`;
      }

      // Auto-select display mode: HTML/PDF/image/docx start in preview,
      // everything else starts as card.
      const category = getPreviewCategory(mime, originalName);
      const autoMode: 'card' | 'preview' =
        category === 'other' || category === 'text' ? 'card' : 'preview';

      updateAttributes({
        src: dataUrl,
        fileName: originalName,
        fileSize: sizeBytes,
        fileType: mime,
        displayMode: autoMode,
      });
    } catch {
      // silently ignore — user can click again
    } finally {
      setLoading(false);
    }
  }, [src, updateAttributes]);

  /* -------------------------------------------------------------- */
  /* DOCX preview: load on demand when entering preview mode        */
  /* -------------------------------------------------------------- */

  const category = useMemo(
    () => getPreviewCategory(fileType, fileName),
    [fileType, fileName],
  );

  useEffect(() => {
    if (category === 'docx' && displayMode === 'preview' && src && !docxHtml && !docxLoading) {
      setDocxLoading(true);
      docxToHtml(src)
        .then((html) => setDocxHtml(html))
        .catch(() => setDocxHtml('<p style="color:#f85149;">Failed to load DOCX</p>'))
        .finally(() => setDocxLoading(false));
    }
  }, [category, displayMode, src, docxHtml, docxLoading]);

  /* -------------------------------------------------------------- */
  /* Hover toolbar: toggle card / preview                           */
  /* -------------------------------------------------------------- */

  const canPreview = category !== 'other';
  const isPreviewMode = displayMode === 'preview' && canPreview;

  /* -------------------------------------------------------------- */
  /* Render                                                         */
  /* -------------------------------------------------------------- */

  return (
    <NodeViewWrapper className="file-block-wrapper" as="div">
      {/* Placeholder state */}
      {!src ? (
        <button
          type="button"
          className="file-block-placeholder"
          onClick={handlePlaceholderClick}
          disabled={loading}
          aria-label="点击选择文件"
        >
          <span className="file-block-placeholder-icon">
            {loading ? <Loader2 size={28} className="animate-spin" /> : <Upload size={28} />}
          </span>
          <span className="file-block-placeholder-text">
            {loading ? '加载中…' : '点击上传文件'}
          </span>
          <span className="file-block-placeholder-hint">
            支持 HTML、PDF、DOCX、图片、文本等
          </span>
        </button>
      ) : (
        /* Loaded state */
        <div className={`file-block-container ${isPreviewMode ? 'is-preview' : 'is-card'}`}>
          {/* Hover toolbar (top-right) — toggle display mode */}
          {canPreview && (
            <div className="file-block-toolbar" contentEditable={false}>
              <button
                type="button"
                className={`file-block-toolbar-btn ${!isPreviewMode ? 'is-active' : ''}`}
                onClick={() => updateAttributes({ displayMode: 'card' })}
                title="卡片模式"
              >
                <PanelsTopLeft size={15} />
              </button>
              <button
                type="button"
                className={`file-block-toolbar-btn ${isPreviewMode ? 'is-active' : ''}`}
                onClick={() => updateAttributes({ displayMode: 'preview' })}
                title="预览模式"
              >
                <Eye size={15} />
              </button>
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
                  <span className="file-block-card-type">{getCategoryLabel(category)}</span>
                  <span className="file-block-card-dot">·</span>
                  <span className="file-block-card-size">{formatFileSize(fileSize)}</span>
                </span>
              </div>
            </div>
          )}

          {/* Preview mode */}
          {isPreviewMode && (
            <div className="file-block-preview" contentEditable={false}>
              {/* HTML / SVG */}
              {(category === 'html') && (
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
                  <img src={src} alt={fileName} className="file-block-preview-image" />
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
                      dangerouslySetInnerHTML={{ __html: docxHtml ?? '<p>加载中…</p>' }}
                    />
                  )}
                </div>
              )}

              {/* Text */}
              {category === 'text' && (
                <FileTextPreview src={src} />
              )}
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

/* ------------------------------------------------------------------ */
/* Text preview sub-component                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetches the text content from a data URL and renders it in a <pre>.
 */
function FileTextPreview({ src }: { src: string }) {
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    try {
      // src is a data URL — extract the content portion.
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
