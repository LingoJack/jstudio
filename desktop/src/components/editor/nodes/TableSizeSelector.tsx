/**
 * TableSizeSelector — Notion-style grid picker for choosing table dimensions.
 *
 * Renders a fixed-position popup with a hoverable N×N grid. The user drags
 * their mouse across cells to select rows × cols, clicks to confirm, or
 * clicks outside / presses Escape to cancel.
 *
 * Unlike the previous tippy-based version, this uses a simple fixed overlay
 * with pointer-events transparency so it never closes prematurely.
 */

import { useState, useEffect, useCallback } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor, Range } from '@tiptap/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SIZE = 8;
const CELL_SIZE = 24;
const CELL_GAP = 3;

// ---------------------------------------------------------------------------
// React component: the grid picker
// ---------------------------------------------------------------------------

interface GridPickerProps {
  anchorX: number;
  anchorY: number;
  onSelect: (rows: number, cols: number, withHeader: boolean) => void;
  onCancel: () => void;
}

function GridPicker({ anchorX, anchorY, onSelect, onCancel }: GridPickerProps) {
  const [hovered, setHovered] = useState({ rows: 1, cols: 1 });
  const [withHeader, setWithHeader] = useState(true);

  // Click outside or Escape to cancel
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    // Full-screen transparent backdrop — click anywhere to close.
    <div
      className="fixed inset-0 z-[9999]"
      onClick={onCancel}
    >
      {/* The actual grid card, positioned at the cursor anchor */}
      <div
        className="absolute rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] p-3 shadow-xl"
        style={{
          left: `${anchorX}px`,
          top: `${anchorY + 8}px`,
          // Prevent the backdrop's onClick from firing when clicking the card
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="grid select-none"
          style={{
            gridTemplateColumns: `repeat(${MAX_SIZE}, ${CELL_SIZE}px)`,
            gap: `${CELL_GAP}px`,
          }}
        >
          {Array.from({ length: MAX_SIZE }, (_, r) =>
            Array.from({ length: MAX_SIZE }, (_, c) => {
              const isSelected = r < hovered.rows && c < hovered.cols;
              return (
                <div
                  key={`${r}-${c}`}
                  onMouseEnter={() => setHovered({ rows: r + 1, cols: c + 1 })}
                  onClick={() => onSelect(r + 1, c + 1, withHeader)}
                  className="cursor-pointer rounded-[3px] transition-colors duration-50"
                  style={{
                    width: `${CELL_SIZE}px`,
                    height: `${CELL_SIZE}px`,
                    backgroundColor: isSelected
                      ? 'var(--vscode-button-background)'
                      : 'var(--vscode-editor-inactiveSelectionBackground)',
                  }}
                />
              );
            }),
          )}
        </div>
        <div className="mt-2 text-center text-xs text-[var(--vscode-descriptionForeground)]">
          {hovered.rows} × {hovered.cols}
        </div>
        {/* Toggle: include header row or not */}
        <label
          className="mt-2 flex cursor-pointer select-none items-center justify-center gap-1.5 text-xs text-[var(--vscode-descriptionForeground)]"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={withHeader}
            onChange={(e) => setWithHeader(e.target.checked)}
            style={{ accentColor: 'var(--vscode-button-background)' }}
            className="h-3 w-3 cursor-pointer"
          />
          包含表头
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public: mount the grid picker as a portal
// ---------------------------------------------------------------------------

let activeRoot: Root | null = null;
let activeEl: HTMLDivElement | null = null;

/**
 * Show the table size selector popup at the given cursor position.
 */
export function mountTableSizeSelector(editor: Editor, range: Range): void {
  // Clean up any existing instance
  unmountTableSizeSelector();

  const { from } = range;
  const coords = editor.view.coordsAtPos(from);

  const handleSelect = (rows: number, cols: number, withHeader: boolean) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertTable({ rows, cols, withHeaderRow: withHeader })
      .run();
    unmountTableSizeSelector();
  };

  const handleCancel = () => {
    // Restore editor focus so the user's `/table` text is still there
    editor.chain().focus().run();
    unmountTableSizeSelector();
  };

  activeEl = document.createElement('div');
  document.body.appendChild(activeEl);
  activeRoot = createRoot(activeEl);
  activeRoot.render(
    <GridPicker
      anchorX={coords.left}
      anchorY={coords.bottom}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />,
  );
}

/**
 * Remove the table size selector popup if it exists.
 */
export function unmountTableSizeSelector(): void {
  if (activeRoot) {
    activeRoot.unmount();
    activeRoot = null;
  }
  if (activeEl) {
    activeEl.remove();
    activeEl = null;
  }
}
