/**
 * TableSizeSelector — Notion-style grid picker for choosing table dimensions.
 *
 * Renders a hoverable N×N grid. The user drags their mouse to select rows ×
 * cols, and clicks to confirm. A label below the grid shows the current
 * selection (e.g. "3 × 3").
 *
 * Usage:
 *   mountTableSizeSelector(editor, range)
 *     → shows the grid as a tippy popup at the cursor position
 *     → on confirm, inserts a table with the chosen dimensions
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import type { Editor, Range } from '@tiptap/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum selectable grid size (rows × cols). */
const MAX_SIZE = 10;
/** Default cell size in px for the grid. */
const CELL_SIZE = 22;
/** Gap between cells in px. */
const CELL_GAP = 4;

// ---------------------------------------------------------------------------
// React component: the grid picker
// ---------------------------------------------------------------------------

interface GridPickerProps {
  onSelect: (rows: number, cols: number) => void;
  onCancel: () => void;
}

function GridPicker({ onSelect, onCancel }: GridPickerProps) {
  const [hovered, setHovered] = useState({ rows: 1, cols: 1 });

  const handleMouseMove = (r: number, c: number) => {
    setHovered({ rows: r, cols: c });
  };

  return (
    <div
      className="rounded-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editorWidget-background)] p-3 shadow-lg"
      onMouseLeave={() => onCancel()}
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
                onMouseEnter={() => handleMouseMove(r + 1, c + 1)}
                onClick={() => onSelect(r + 1, c + 1)}
                className="rounded-sm cursor-pointer transition-colors duration-75"
                style={{
                  width: `${CELL_SIZE}px`,
                  height: `${CELL_SIZE}px`,
                  backgroundColor: isSelected
                    ? 'var(--vscode-button-background)'
                    : 'var(--vscode-editor-inactiveSelectionBackground)',
                  border: isSelected
                    ? '1px solid var(--vscode-button-background)'
                    : '1px solid transparent',
                }}
              />
            );
          }),
        )}
      </div>
      <div className="mt-2 text-center text-xs text-[var(--vscode-descriptionForeground)]">
        {hovered.rows} × {hovered.cols}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public: mount the grid picker as a tippy popup
// ---------------------------------------------------------------------------

/**
 * Show the table size selector popup at the given cursor position.
 *
 * When the user confirms a size, the `/table` text range is deleted and a
 * table of the chosen dimensions is inserted.
 */
export function mountTableSizeSelector(editor: Editor, range: Range): void {
  let popup: TippyInstance | null = null;
  let reactRoot: Root | null = null;

  const cleanup = () => {
    if (popup) {
      popup.destroy();
      popup = null;
    }
    if (reactRoot) {
      reactRoot.unmount();
      reactRoot = null;
    }
  };

  const handleSelect = (rows: number, cols: number) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();
    cleanup();
  };

  const handleCancel = () => {
    cleanup();
  };

  // Create a virtual element positioned at the current cursor coordinates
  const popupEl = document.createElement('div');
  reactRoot = createRoot(popupEl);

  reactRoot.render(
    <GridPicker onSelect={handleSelect} onCancel={handleCancel} />,
  );

  // Use the editor's DOM to get cursor position for popup placement
  const { from } = range;
  const start = editor.view.coordsAtPos(from);
  const virtualElement = {
    getBoundingClientRect: () =>
      ({
        width: 0,
        height: 0,
        top: start.bottom,
        bottom: start.bottom,
        left: start.left,
        right: start.left,
      }) as DOMRect,
  };

  popup = tippy(document.body, {
    getReferenceClientRect: () => virtualElement.getBoundingClientRect(),
    appendTo: () => document.body,
    content: popupEl,
    showOnCreate: true,
    interactive: true,
    trigger: 'manual',
    placement: 'bottom-start',
    onHidden: () => cleanup(),
  });
}
