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
import { type NodeViewProps, NodeViewWrapper, type Editor } from '@tiptap/react';

import { useStore } from '../../../store/useStore';
import { storage } from '../../../lib/storage';
import { saveBytesAsAsset, genStoredName } from '../../../lib/editor/upload';
import { toDisplaySrc } from '../../../lib/content/assetUrl';
import { useNodeResize } from '../../../hooks/useNodeResize';
import { useEditorWidth } from '../../../hooks/useEditorWidth';
import { useNodeToolbarNav } from '../../../hooks/useNodeToolbarNav';
import { UploadIcon } from '../../shared/icons';
import { BlockToolbar, AlignButtonGroup } from '../../ui/BlockToolbar';
import { ResizeHandle } from '../../ui/ResizeHandle';

interface ImageNodeAttrs {
  src: string;
  alt: string | null;
  title: string | null;
  /** Legacy pixel width (kept for backward-compat migration). */
  width: number | null;
  /** Width as a percentage of the editor surface width (0-100). Preferred. */
  widthPct: number | null;
  /** Legacy pixel height (kept for backward-compat migration). */
  height: number | null;
  /** Height as a percentage of the editor surface width (0-100). Preferred. */
  heightPct: number | null;
  align: 'left' | 'center';
}

export default function ImageView({ node, selected, updateAttributes, editor }: NodeViewProps) {
  const { src, alt, title, width, widthPct, height, heightPct, align } = node.attrs as ImageNodeAttrs;

  // Resolve doc-relative asset paths (`assets/…`) to a loadable URL via the
  // asset protocol; data:/http(s): srcs pass through unchanged.
  const studioRoot = useStore((s) => s.studioRoot);
  const activeDocId = useStore((s) => s.activeDocId);
  const displaySrc = toDisplaySrc(src, studioRoot, activeDocId);

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

      const ref = await saveBytesAsAsset(bytes, mime, activeDocId, fileName);
      updateAttributes({ src: ref, alt: fileName });
    } catch {
      // silently ignore — user can click again
    } finally {
      setLoading(false);
    }
  }, [src, updateAttributes]);

  // -----------------------------------------------------------------------
  // Resize: drag the bottom-right handle (via shared useNodeResize hook)
  // -----------------------------------------------------------------------

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

  // Read natural aspect ratio at commit time so we can persist height too.
  const imgElRef = useRef<HTMLImageElement | null>(null);

  const { ref: resizeRef, displayWidth, onResizeStart } =
    useNodeResize<HTMLImageElement>({
      width: widthPx,
      updateAttributes,
      minWidth: 80,
      fallbackWidth: 300,
      maxWidth: editorWidth,
      onCommit: (finalWidth, _finalHeight) => {
        const pct =
          editorWidth > 0
            ? Math.min(100, Math.max(1, Math.round((finalWidth / editorWidth) * 100)))
            : 50;
        const img = imgElRef.current;
        const ratio =
          img && img.naturalHeight && img.naturalWidth
            ? img.naturalHeight / img.naturalWidth
            : 0;
        const newAttrs: { widthPct: number; width: null; height: null; heightPct?: number } = {
          widthPct: pct,
          width: null,
          height: null,
        };
        if (ratio > 0 && editorWidth > 0) {
          const heightPx = Math.round(finalWidth * ratio);
          newAttrs.heightPct = Math.min(100, Math.max(1, Math.round((heightPx / editorWidth) * 100)));
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
    // Derive height from heightPct for proportional scaling, otherwise auto.
    if (heightPct != null && editorWidth > 0) {
      imgStyle.height = `${Math.round((heightPct * editorWidth) / 100)}px`;
    } else {
      imgStyle.height = 'auto';
    }
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
            <BlockToolbar selected={selected}>
              <AlignButtonGroup
                nav={{ activeIndex, registerButton }}
                align={effectiveAlign}
                onAlignChange={(a) => updateAttributes({ align: a })}
              />
            </BlockToolbar>

            <img
              ref={setImgRef}
              src={displaySrc}
              alt={alt ?? ''}
              title={title ?? undefined}
              style={imgStyle}
              draggable={false}
            />

            {/* Resize handle (bottom-right corner), visible when selected */}
            {selected && <ResizeHandle onPointerDown={onResizeStart} />}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
