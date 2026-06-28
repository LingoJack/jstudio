/**
 * BlockToolbar — unified floating toolbar primitives for NodeView blocks.
 *
 * Before this extraction, ImageView / FileView / DiagramBlockView / LinkView
 * each hand-wrote an identical `<div className="xxx-toolbar">` with identical
 * align-left / align-center buttons, dividers, and per-button `is-active` /
 * `is-focused` class wiring.  The CSS had 4 near-identical copies too.
 *
 * These components guarantee visual consistency by construction.
 *
 * CSS variables used (all defined in vscode-theme.css):
 *   --vscode-menu-background
 *   --vscode-menu-border
 *   --vscode-editorWidget-border
 *   --vscode-toolbar-hoverBackground
 *   --vscode-list-activeSelectionBackground
 *   --vscode-list-activeSelectionForeground
 *   --vscode-focusBorder
 *   --vscode-widget-border
 */

import React from 'react';
import { AlignLeftIcon, AlignCenterIcon } from '../shared/icons';
import type { NodeToolbarNav } from '../editor/hooks/useNodeToolbarNav';

// ── BlockToolbar (container) ──────────────────────────────

interface BlockToolbarProps {
  /** When true the toolbar renders; when false it returns null. */
  selected: boolean;
  children: React.ReactNode;
}

/**
 * Floating toolbar container, positioned at top-center of the block.
 * Renders nothing unless `selected` is true.
 */
export function BlockToolbar({ selected, children }: BlockToolbarProps) {
  if (!selected) return null;
  return (
    <div className="block-toolbar" contentEditable={false}>
      {children}
    </div>
  );
}

// ── BlockToolbarButton ────────────────────────────────────

interface BlockToolbarButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'ref'> {
  /** Navigation state from useNodeToolbarNav (only activeIndex + registerButton are used). */
  nav: Pick<NodeToolbarNav, 'activeIndex' | 'registerButton'>;
  /** This button's position in the toolbar's tab order (0-based). */
  index: number;
  /** Whether the button represents the currently-active option (e.g. current align). */
  active?: boolean;
}

/**
 * A single toolbar button.  Automatically wires `registerButton(index)` and
 * appends `is-active` / `is-focused` classes based on nav state.
 */
export function BlockToolbarButton({
  nav,
  index,
  active = false,
  className = '',
  children,
  ...props
}: BlockToolbarButtonProps) {
  const focused = nav.activeIndex === index;
  return (
    <button
      type="button"
      ref={nav.registerButton(index)}
      className={[
        'block-toolbar-btn',
        active ? 'is-active' : '',
        focused ? 'is-focused' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}

// ── BlockToolbarDivider ───────────────────────────────────

/** A thin vertical separator between toolbar button groups. */
export function BlockToolbarDivider() {
  return <span className="block-toolbar-divider" />;
}

// ── AlignButtonGroup (preset) ─────────────────────────────

interface AlignButtonGroupProps {
  /** Navigation state from useNodeToolbarNav (only activeIndex + registerButton are used). */
  nav: Pick<NodeToolbarNav, 'activeIndex' | 'registerButton'>;
  /** Current alignment value ('left' | 'center'). */
  align: string;
  /** Callback when the user picks a new alignment. */
  onAlignChange: (align: 'left' | 'center') => void;
  /** Index of the first align button (default 0).  Increment if preceding buttons exist. */
  startIndex?: number;
}

/**
 * Preset pair of align-left + align-center buttons used by every block toolbar.
 * Consumes nav indices `[startIndex, startIndex + 1]`.
 */
export function AlignButtonGroup({
  nav,
  align,
  onAlignChange,
  startIndex = 0,
}: AlignButtonGroupProps) {
  return (
    <>
      <BlockToolbarButton
        nav={nav}
        index={startIndex}
        active={align === 'left'}
        title="Align left"
        onClick={() => onAlignChange('left')}
      >
        <AlignLeftIcon />
      </BlockToolbarButton>
      <BlockToolbarButton
        nav={nav}
        index={startIndex + 1}
        active={align === 'center'}
        title="Align center"
        onClick={() => onAlignChange('center')}
      >
        <AlignCenterIcon />
      </BlockToolbarButton>
    </>
  );
}
