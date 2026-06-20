import type React from 'react';

// ──────────────────────────────────────────────────────────────────
// NavBranch / NavLeaf
//
// Shared visual pattern for collapsible tree navigation, used by:
//   • Settings sidebar (section → sub-items)
//   • DocumentList sidebar (folder → documents / sub-folders)
//
// The pattern:
//   <NavBranch>            ← draws a thin gray guide line on the left
//     <NavLeaf active>     ← -ml-px border-l-2 overlaps the gray line
//       row content
//     </NavLeaf>
//     <NavLeaf>            ← border-transparent, gray line shows through
//       row content
//     </NavLeaf>
//   </NavBranch>
//
// This produces a continuous gray line with a green segment that
// "lights up" on the active/highlighted row — exactly like VS Code's
// sidebar tree indentation guide.
// ──────────────────────────────────────────────────────────────────

interface NavBranchProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Vertical branch container — draws a thin gray guide line
 * (`--vscode-widget-border`) on the left edge.
 *
 * Place `NavLeaf` children inside. Each leaf's `-ml-px border-l-2`
 * sits exactly on top of this line.
 */
export function NavBranch({ children, className = '', style }: NavBranchProps) {
  return (
    <div
      style={style}
      className={`border-l border-[var(--vscode-widget-border)] space-y-0.5 ${className}`}
    >
      {children}
    </div>
  );
}

interface NavLeafProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  /** Show the green focus line (e.g. active selection). */
  active?: boolean;
  /** Show the green focus line (e.g. drop target, flash). */
  highlighted?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * A row inside a `NavBranch`.
 *
 * Uses `-ml-px border-l-2` so the 2px border overlaps the branch's 1px
 * gray line precisely. When `active` or `highlighted`, the border becomes
 * `--vscode-focusBorder` (green); otherwise transparent and the gray
 * guide line shows through.
 *
 * All standard `<div>` props (onClick, onPointerDown, style, data-*, …)
 * are forwarded via `...rest`.
 */
export function NavLeaf({
  active = false,
  highlighted = false,
  className = '',
  children,
  ...rest
}: NavLeafProps) {
  const showLine = active || highlighted;
  return (
    <div
      {...rest}
      className={`-ml-px border-l-2 transition-colors duration-150 ${
        showLine
          ? 'border-[var(--vscode-focusBorder)]'
          : 'border-transparent'
      } ${className}`}
    >
      {children}
    </div>
  );
}
