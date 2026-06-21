import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { TldrawCanvas } from './TldrawCanvas';

export interface TldrawEditorModalProps {
  open: boolean;
  initialSnapshot: string;
  /** Called when the user closes the modal — receives the latest snapshot. */
  onSave: (snapshotJson: string) => void;
  /** Called after save completes, to actually close. */
  onClose: () => void;
}

/**
 * Full-screen modal editing window for a tldraw diagram block.
 *
 * Rendered via React Portal to `document.body` so it escapes the
 * `contentEditable` surface and tldraw's pointer/keyboard events are not
 * intercepted by ProseMirror.
 */
export function TldrawEditorModal({
  open,
  initialSnapshot,
  onSave,
  onClose,
}: TldrawEditorModalProps) {
  const latestSnapshot = useRef(initialSnapshot);
  const [mounted, setMounted] = useState(false);

  // Track mount state for portal readiness.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };
    // Capture phase so we intercept before tldraw handles Escape.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleChange = useCallback((json: string) => {
    latestSnapshot.current = json;
  }, []);

  const handleClose = useCallback(() => {
    onSave(latestSnapshot.current);
    onClose();
  }, [onSave, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="tldraw-modal-overlay" role="dialog" aria-modal="true">
      <div className="tldraw-modal-container">
        {/* Header */}
        <div className="tldraw-modal-header">
          <span className="tldraw-modal-title">画板编辑</span>
          <button
            className="tldraw-modal-close"
            onClick={handleClose}
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Full-size canvas */}
        <div className="tldraw-modal-canvas">
          <TldrawCanvas
            initialSnapshot={initialSnapshot}
            onChange={handleChange}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
