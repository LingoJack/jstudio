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

import { useCallback, useRef, useState } from 'react';
import { type NodeViewProps, NodeViewWrapper, type Editor } from '@tiptap/react';

import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';
import { bytesToDataUrl, genStoredName } from '../lib/upload';
import { useNodeResize } from '../hooks/useNodeResize';
import { useNodeToolbarNav } from '../hooks/useNodeToolbarNav';
import { UploadIcon, AlignLeftIcon, AlignCenterIcon } from './shared/icons';

interface ImageNodeAttrs {
  src: string;
  alt: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  align: 'left' | 'center';
}

export default function ImageView({ node, selected, updateAttributes, editor }: NodeViewProps) {
  const { src, alt, title, width, height, align } = node.attrs as ImageNodeAttrs;

  // Keyboard navigation for the floating toolbar (Tab/Enter/Esc)
  const toolbarBtnCount = 2; // align-left, align-center
  const { activeIndex, registerButton } = useNodeToolbarNav(
    selected,
    (editor as Editor | null) ?? null,
    toolbarBtnCount,
  );

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
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const fileName = genStoredName('image', ext);

      const dataUrl = await bytesToDataUrl(bytes, mime, activeDocId, fileName);
      updateAttributes({ src: dataUrl, alt: fileName });
    } catch {
      // silently ignore — user can click again
    } finally {
      setLoading(false);
    }
  }, [src, updateAttributes]);

  // -----------------------------------------------------------------------
  // Resize: drag the bottom-right handle (via shared useNodeResize hook)
  // -----------------------------------------------------------------------

  // Read natural aspect ratio at commit time so we can persist height too.
  const imgElRef = useRef<HTMLImageElement | null>(null);

  const { ref: resizeRef, displayWidth, onResizeStart } =
    useNodeResize<HTMLImageElement>({
      width,
      updateAttributes,
      minWidth: 80,
      fallbackWidth: 300,
      onCommit: (finalWidth, _finalHeight) => {
        const img = imgElRef.current;
        const ratio =
          img && img.naturalHeight && img.naturalWidth
            ? img.naturalHeight / img.naturalWidth
            : 0;
        const newAttrs: { width: number; height?: number } = { width: finalWidth };
        if (ratio > 0) {
          newAttrs.height = Math.round(finalWidth * ratio);
        }
        return newAttrs;
      },
    });

  // Merge the two refs (hook's ref + our local imgElRef) onto the <img>.
  const setImgRef = useCallback((el: HTMLImageElement | null) => {
    resizeRef.current = el;
    imgElRef.current = el;
  }, []);

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
                  ref={registerButton(0)}
                  className={`image-toolbar-btn ${effectiveAlign === 'left' ? 'is-active' : ''} ${
                    activeIndex === 0 ? 'is-focused' : ''
                  }`}
                  onClick={() => updateAttributes({ align: 'left' })}
                  title="左对齐"
                >
                  <AlignLeftIcon />
                </button>
                <button
                  type="button"
                  ref={registerButton(1)}
                  className={`image-toolbar-btn ${effectiveAlign === 'center' ? 'is-active' : ''} ${
                    activeIndex === 1 ? 'is-focused' : ''
                  }`}
                  onClick={() => updateAttributes({ align: 'center' })}
                  title="居中"
                >
                  <AlignCenterIcon />
                </button>
              </div>
            )}

            <img
              ref={setImgRef}
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
