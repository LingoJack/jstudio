/**
 * PdfPreview — 基于 react-pdf (pdf.js) 的 PDF 预览组件。
 *
 * 替代之前裸 `<iframe>` 方案，提供：
 *   - 自定义 VSCode 风格工具栏（翻页 / 缩放 / 适配宽度）
 *   - Ctrl+滚轮缩放、双击适配宽度
 *   - 连续竖向滚动浏览所有页面
 *   - 加载 / 错误状态
 *
 * 用法：
 *   <PdfPreview src={dataUrl} />
 *   <PdfPreview src={dataUrl} fillContainer />  // 撑满父容器（预览窗口模式）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, type OnDocumentLoadSuccess } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  FileX,
} from 'lucide-react';

// ── Worker 配置（仅需一次） ──────────────────────────────
import { pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ── Constants ────────────────────────────────────────────
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.15;

// ── Component ────────────────────────────────────────────

export interface PdfPreviewProps {
  /** PDF 文件源，支持 data URL / blob URL / 路径。 */
  src: string;
  /** 额外 className */
  className?: string;
  /**
   * true  = 撑满父容器（用于预览新窗口）
   * false = 有固定高度（用于编辑器内联，配合 resize handle）
   */
  fillContainer?: boolean;
}

export default function PdfPreview({
  src,
  className = '',
  fillContainer = false,
}: PdfPreviewProps) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [pageWidth, setPageWidth] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Document load callbacks ────────────────────────────
  const onLoadSuccess: OnDocumentLoadSuccess = useCallback((pdf) => {
    setNumPages(pdf.numPages);
    setLoadError(null);
    // 初始适配宽度
    fitWidth();
  }, []);

  const onLoadError = useCallback((err: Error) => {
    setLoadError(err.message || '无法加载 PDF');
  }, []);

  // ── 适配宽度：计算使首页适配容器宽度的 scale ────────────
  const fitWidth = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const availW = container.clientWidth - 24; // 减去 padding
    if (availW > 0) {
      setScale(availW / 612); // 612pt = Letter 纸标准宽度
    }
  }, []);

  // ── 缩放控制 ───────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(s + SCALE_STEP, MAX_SCALE));
  }, []);
  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(s - SCALE_STEP, MIN_SCALE));
  }, []);
  const resetZoom = useCallback(() => {
    setScale(1);
  }, []);

  // ── Ctrl+滚轮缩放 ──────────────────────────────────────
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((s) => {
          const next = s - e.deltaY * 0.002;
          return Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
        });
      }
    },
    [],
  );

  // ── 渲染 ────────────────────────────────────────────────
  const rootClass = `pdf-preview-root ${fillContainer ? 'pdf-preview-fill' : ''} ${className}`;

  if (loadError) {
    return (
      <div className={rootClass}>
        <div className="pdf-preview-error">
          <FileX size={32} />
          <span>PDF 加载失败</span>
          <span className="pdf-preview-error-detail">{loadError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {/* ── Toolbar ── */}
      <div className="pdf-preview-toolbar" contentEditable={false}>
        <div className="pdf-preview-toolbar-group">
          <button
            type="button"
            className="pdf-preview-btn"
            onClick={() => scrollPage(-1)}
            title="上一页"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="pdf-preview-page-info">
            {numPages > 0 ? `${numPages} 页` : '—'}
          </span>
          <button
            type="button"
            className="pdf-preview-btn"
            onClick={() => scrollPage(1)}
            title="下一页"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="pdf-preview-toolbar-group">
          <button
            type="button"
            className="pdf-preview-btn"
            onClick={zoomOut}
            title="缩小"
            disabled={scale <= MIN_SCALE}
          >
            <ZoomOut size={15} />
          </button>
          <span className="pdf-preview-scale">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="pdf-preview-btn"
            onClick={zoomIn}
            title="放大"
            disabled={scale >= MAX_SCALE}
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            className="pdf-preview-btn"
            onClick={fitWidth}
            title="适配宽度"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Pages scroll area ── */}
      <div
        ref={containerRef}
        className="pdf-preview-pages"
        onWheel={onWheel}
        onDoubleClick={fitWidth}
      >
        <Document
          file={src}
          onLoadSuccess={onLoadSuccess}
          onLoadError={onLoadError}
          loading={
            <div className="pdf-preview-loading">
              <Loader2 size={24} className="animate-spin" />
              <span>正在加载 PDF…</span>
            </div>
          }
          error={
            <div className="pdf-preview-loading">
              <FileX size={24} />
              <span>加载失败</span>
            </div>
          }
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div key={i} className="pdf-preview-page-wrap" data-page={i + 1}>
              <Page
                pageNumber={i + 1}
                scale={scale}
                renderTextLayer
                renderAnnotationLayer
                loading={
                  <div className="pdf-preview-page-loading">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                }
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );

  // ── 翻页滚动 ───────────────────────────────────────────
  function scrollPage(direction: 1 | -1) {
    const container = scrollRef.current ?? containerRef.current;
    if (!container) return;
    const pages = container.querySelectorAll('.pdf-preview-page-wrap');
    if (!pages.length) return;

    const scrollTop = container.scrollTop;
    const containerH = container.clientHeight;

    // 找当前可见页
    let currentPage = 0;
    for (let i = 0; i < pages.length; i++) {
      const top = (pages[i] as HTMLElement).offsetTop;
      if (top >= scrollTop - containerH * 0.3) {
        currentPage = i;
        break;
      }
      currentPage = i;
    }

    const target = Math.min(Math.max(currentPage + direction, 0), pages.length - 1);
    const targetEl = pages[target] as HTMLElement;
    if (targetEl) {
      container.scrollTo({ top: targetEl.offsetTop - 8, behavior: 'smooth' });
    }
  }
}
