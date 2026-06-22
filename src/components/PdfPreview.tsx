/**
 * PdfPreview — 基于 react-pdf (pdf.js) 的 PDF 预览组件。
 *
 * 单页窗口 + 连续滚动模式：
 *   - 框体高度固定为「一页 + 工具栏」，只露出一页内容
 *   - 所有页面在滚动区域内垂直连续排列
 *   - 鼠标滚轮自然滚动浏览全部页面
 *
 * 交互：
 *   - 工具栏：上/下翻页（跳转到对应页）、缩放、适配宽度
 *   - Ctrl/⌘ + 滚轮：缩放
 *   - 双击：适配宽度
 *   - 滚动时自动高亮当前可视页面
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import type { DocumentProps } from 'react-pdf';
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
/** 页面间距（px） */
const PAGE_GAP = 8;
/** 滚动区域上下 padding 之和（px） */
const PADDING_Y = 24;

// ── Component ────────────────────────────────────────────

export interface PdfPreviewProps {
  /** PDF 文件源，支持 data URL / blob URL / 路径。 */
  src: string;
  /** 额外 className */
  className?: string;
  /**
   * true  = 撑满父容器（用于预览新窗口）
   * false = 固定为一页高度（用于编辑器内联）
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
  /** 第一页渲染后的高度（px），用于将滚动区域固定为一页高 */
  const [pageHeight, setPageHeight] = useState(0);
  /** 用户是否正在程序化滚动（期间不自动修正 currentPage） */
  const isScrollingProgrammatically = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  /** 每页 DOM 元素的引用，用于滚动定位和可视页检测 */
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Document load callbacks ────────────────────────────
  const onLoadSuccess: NonNullable<DocumentProps['onLoadSuccess']> = useCallback((pdf) => {
    setNumPages(pdf.numPages);
    setCurrentPage(1);
    setLoadError(null);
    pageRefs.current = new Array(pdf.numPages).fill(null);
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
    const availW = container.clientWidth - PADDING_Y; // 减去左右 padding
    if (availW > 0) {
      setScale(availW / PDF_BASE_WIDTH);
    }
  }, []);

  // ── 第一页渲染成功：记录页面高度，固定滚动区域为一页 ────
  const onPageRenderSuccess = useCallback(
    (params: { width: number; height: number }) => {
      // 始终用第一页的高度来决定窗口大小
      // （缩放变化时也会触发，使窗口始终适配一页）
      setPageHeight(params.height);
    },
    [],
  );

  // ── 跳转到指定页（平滑滚动到该页顶部） ──────────────────
  const goToPage = useCallback(
    (page: number) => {
      const target = Math.min(Math.max(page, 1), numPages || 1);
      if (target === currentPage) return;
      const el = pageRefs.current[target - 1];
      if (el && containerRef.current) {
        isScrollingProgrammatically.current = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setCurrentPage(target);
        window.setTimeout(() => {
          isScrollingProgrammatically.current = false;
        }, 400);
      } else {
        setCurrentPage(target);
      }
    },
    [numPages, currentPage],
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

  // ── Ctrl+滚轮缩放（普通滚动浏览内容） ──────────────────
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((s) => {
          const next = s - e.deltaY * 0.002;
          return Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
        });
      }
      // 非 Ctrl 时：不拦截，让浏览器自然滚动
    },
    [],
  );

  // ── 滚动时自动检测当前可视页面 ──────────────────────────
  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current) return;
    const container = containerRef.current;
    if (!container || numPages === 0) return;

    const scrollTop = container.scrollTop;
    const containerTop = scrollTop + container.offsetTop;
    let bestPage = 1;
    let bestDist = Infinity;

    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      const dist = Math.abs(el.offsetTop - containerTop);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = i + 1;
      }
    }

    if (bestPage !== currentPage) {
      setCurrentPage(bestPage);
    }
  }, [numPages, currentPage]);

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

  // 生成页码数组 1..numPages
  const pageNumbers = numPages > 0 ? Array.from({ length: numPages }, (_, i) => i + 1) : [];

  /**
   * 滚动区域高度：
   *   - fillContainer 模式：不设固定高度，用 flex: 1 撑满
   *   - 内联模式：固定为「一页高度 + padding」，只露出一页
   */
  const pagesStyle: React.CSSProperties = fillContainer
    ? {}
    : pageHeight
      ? { height: `${pageHeight + PADDING_Y}px` }
      : { minHeight: '400px' };

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

      {/* ── Continuous scroll area — all pages rendered vertically ── */}
      <div
        ref={containerRef}
        className="pdf-preview-pages"
        style={pagesStyle}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onScroll={handleScroll}
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
          {pageNumbers.length > 0 ? (
            pageNumbers.map((pageNum) => (
              <div
                key={pageNum}
                ref={(el) => {
                  pageRefs.current[pageNum - 1] = el;
                }}
                className={`pdf-preview-page-wrap ${
                  pageNum === currentPage ? 'is-current' : ''
                }`}
              >
                <Page
                  pageNumber={pageNum}
                  scale={scale}
                  renderTextLayer
                  renderAnnotationLayer
                  onRenderSuccess={pageNum === 1 ? onPageRenderSuccess : undefined}
                  loading={
                    <div className="pdf-preview-page-loading">
                      <Loader2 size={18} className="animate-spin" />
                    </div>
                  }
                />
              </div>
            ))
          ) : (
            <div className="pdf-preview-loading">
              <Loader2 size={24} className="animate-spin" />
              <span>正在加载 PDF…</span>
            </div>
          )}
        </Document>
      </div>
    </div>
  );
}
