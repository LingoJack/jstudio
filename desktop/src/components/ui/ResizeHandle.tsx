/**
 * ResizeHandle — the blue circular drag handle at the bottom-right corner
 * of resizable block nodes (image, file, diagram, link).
 *
 * Extracted from ImageView / FileView / DiagramBlockView / LinkView, where
 * each component rendered an identical `<div className="xxx-resize-handle">`.
 *
 * CSS: `.block-resize-handle` (defined in vscode-theme.css).
 */

import React from 'react';

interface ResizeHandleProps {
  /** Pointer-down handler from `useNodeResize().onResizeStart`. */
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  /** Optional double-click handler (e.g. reset to default size). */
  onDoubleClick?: () => void;
  /** Optional extra class names (e.g. for a context-specific position override). */
  className?: string;
  /** Optional tooltip text. */
  title?: string;
}

/** Bottom-right circular resize affordance. */
export function ResizeHandle({
  onPointerDown,
  onDoubleClick,
  className,
  title,
}: ResizeHandleProps) {
  return (
    <div
      className={['block-resize-handle', className].filter(Boolean).join(' ')}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      contentEditable={false}
      title={title}
    />
  );
}
