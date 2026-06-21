/**
 * PdfPreview — 基于 react-pdf (pdf.js) 的 PDF 预览组件。
 *
 * 单页模式：一次只渲染当前页，通过工具栏 / 键盘翻页。
 * 页面在容器内滚动查看，不会把所有页面平铺撑开。
 *
 * 交互：
 *   - 工具栏：上/下翻页、缩放、适配宽度
 *   - Ctrl/⌘ + 滚轮：缩放
 *   - 双击：适配宽度
 *   - 键盘 ← →：翻页（容器聚焦时）
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
/** Letter 纸标准宽度（pt），用于计算适配宽度时的 scale */
const PDF_BASE_WIDTH = 612;

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
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Document load callbacks ────────────────────────────
  const onLoadSuccess: OnDocumentLoadSuccess = useCallback((pdf) => {
    setNumPages(pdf.numPages);
    setCurrentPage(1);
    setLoadError(null);
    // 初始适配宽度
    requestAnimationFrame(fitWidth);
  }, []);

  const onLoadError = useCallback((err: Error) => {
    setLoadError(err.message || '无法加载 PDF');
  }, []);

  // ── 适配宽度：计算使页面适配容器宽度的 scale ────────────
  const fitWidth = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const availW = container.clientWidth - 24; // 减去 padding
    if (availW > 0) {
      setScale(availW / PDF_BASE_WIDTH);
    }
  }, []);

  // ── 翻页 ───────────────────────────────────────────────
  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage((prev) => {
        const next = Math.min(Math.max(page, 1), numPages || 1);
        if (next !== prev && containerRef.current) {
          containerRef.current.scrollTop = 0;
        }
        return next;
      });
    },
    [numPages],
  );

  const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
  const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);

  // ── 键盘翻页 ───────────────────────────────────────────
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        prevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextPage();
      }
    },
    [prevPage, nextPage],
  );

  // ── 缩放控制 ───────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(s + SCALE_STEP, MAX_SCALE));
  }, []);
  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(s - SCALE_STEP, MIN_SCALE));
  }, []);

  // ── Ctrl+滚轮缩放（普通滚动翻页） ──────────────────────
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
            onClick={prevPage}
            title="上一页"
            disabled={currentPage <= 1}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="pdf-preview-page-info">
            {numPages > 0 ? `${currentPage} / ${numPages}` : '—'}
          </span>
          <button
            type="button"
            className="pdf-preview-btn"
            onClick={nextPage}
            title="下一页"
            disabled={numPages > 0 && currentPage >= numPages}
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

      {/* ── Single page scroll area ── */}
      <div
        ref={containerRef}
        className="pdf-preview-pages"
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onDoubleClick={fitWidth}
        tabIndex={0}
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
          <div className="pdf-preview-page-wrap">
            <Page
              key={currentPage}
              pageNumber={currentPage}
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
        </Document>
      </div>
    </div>
  );
}
