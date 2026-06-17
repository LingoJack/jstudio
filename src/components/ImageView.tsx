/**
 * ImageView — React NodeView for the Image node.
 *
 * Two visual states:
 *   1. Placeholder (no src): dashed-border box with an upload prompt.
 *      Clicking it opens the Tauri file dialog to pick an image.
 *   2. Loaded (has src): shows the <img> with a solid border. When the node
 *      is selected, a floating toolbar (align toggle) and a resize handle
 *      (bottom-right corner) appear.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';

import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';

interface ImageNodeAttrs {
  src: string;
  alt: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  align: 'left' | 'center';
}

type ImageViewProps = NodeViewProps;

/** Upload icon (inline SVG so we don't need an extra asset). */
function UploadIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

/** Align-left icon */
function AlignLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  );
}

/** Align-center icon */
function AlignCenterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

export default function ImageView({ node, selected, updateAttributes }: ImageViewProps) {
  const { src, alt, title, width, height, align } = node.attrs as ImageNodeAttrs;

  // -----------------------------------------------------------------------
  // Placeholder state: click to pick an image file
  // -----------------------------------------------------------------------

  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePlaceholderClick = useCallback(async () => {
    if (src) return; // already has an image
    setLoading(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }],
      });
      if (!filePath || typeof filePath !== 'string') return;

      const activeDocId = useStore.getState().activeDocId;
      const bytes = await storage.readFileBytes(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

      let dataUrl: string;
      if (activeDocId) {
        await storage.saveDocAsset(activeDocId, fileName, bytes);
        const base64 = await storage.readDocAssetBase64(activeDocId, fileName);
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        dataUrl = `data:${mime};base64,${base64}`;
      } else {
        const binary = String.fromCharCode(...bytes);
        const base64 = btoa(binary);
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        dataUrl = `data:${mime};base64,${base64}`;
      }
      updateAttributes({ src: dataUrl, alt: fileName });
    } catch {
      // silently ignore — user can click again
    } finally {
      setLoading(false);
    }
  }, [src, updateAttributes]);

  // -----------------------------------------------------------------------
  // Resize: drag the bottom-right handle
  // -----------------------------------------------------------------------

  const imgRef = useRef<HTMLImageElement>(null);
  const resizingRef = useRef(false);
  const [displayWidth, setDisplayWidth] = useState<number | null>(width ?? null);

  // Keep local display width in sync when the node attr changes externally
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
      const startWidth = displayWidth ?? imgRef.current?.offsetWidth ?? 300;
      const ratio =
        imgRef.current && imgRef.current.naturalHeight && imgRef.current.naturalWidth
          ? imgRef.current.naturalHeight / imgRef.current.naturalWidth
          : 0;

      resizingRef.current = true;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(80, startWidth + delta);
        setDisplayWidth(newWidth);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        resizingRef.current = false;
        // Commit to node attrs
        const finalWidth = displayWidthRef.current ?? startWidth;
        const newAttrs: { width: number; height?: number } = { width: finalWidth };
        if (ratio > 0) {
          newAttrs.height = Math.round(finalWidth * ratio);
        }
        updateAttributes(newAttrs);
      };

      // Use a ref so onUp always reads the latest value
      displayWidthRef.current = displayWidth ?? startWidth;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [displayWidth, updateAttributes],
  );

  // Ref mirror for the pointer-up handler to read the latest width
  const displayWidthRef = useRef<number | null>(displayWidth);
  displayWidthRef.current = displayWidth;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const effectiveAlign = align ?? 'center';
  const imgStyle: React.CSSProperties = {};
  if (displayWidth) {
    imgStyle.width = `${displayWidth}px`;
    imgStyle.height = 'auto';
  }

  return (
    <NodeViewWrapper
      className="image-node-wrapper"
      data-align={effectiveAlign}
      as="div"
    >
      <div className="image-node-container" ref={containerRef}>
        {/* Placeholder state */}
        {!src ? (
          <button
            type="button"
            className="image-node-placeholder"
            onClick={handlePlaceholderClick}
            disabled={loading}
            aria-label="点击选择图片"
          >
            <span className="image-node-placeholder-icon">
              <UploadIcon />
            </span>
            <span className="image-node-placeholder-text">
              {loading ? '加载中…' : '点击选择图片'}
            </span>
          </button>
        ) : (
          /* Loaded state */
          <div className={`image-node-figure ${selected ? 'is-selected' : ''}`}>
            {/* Floating toolbar when selected */}
            {selected && (
              <div className="image-toolbar" contentEditable={false}>
                <button
                  type="button"
                  className={`image-toolbar-btn ${effectiveAlign === 'left' ? 'is-active' : ''}`}
                  onClick={() => updateAttributes({ align: 'left' })}
                  title="左对齐"
                >
                  <AlignLeftIcon />
                </button>
                <button
                  type="button"
                  className={`image-toolbar-btn ${effectiveAlign === 'center' ? 'is-active' : ''}`}
                  onClick={() => updateAttributes({ align: 'center' })}
                  title="居中"
                >
                  <AlignCenterIcon />
                </button>
              </div>
            )}

            <img
              ref={imgRef}
              src={src}
              alt={alt ?? ''}
              title={title ?? undefined}
              style={imgStyle}
              draggable={false}
            />

            {/* Resize handle (bottom-right corner), visible when selected */}
            {selected && (
              <div
                className="image-resize-handle"
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
