import type React from 'react';

// ──────────────────────────────────────────────────────────────────
// NavBranch / NavLeaf
//
// Shared visual pattern for collapsible tree navigation, used by:
//   • Settings sidebar (section → sub-items)
//   • DocumentList sidebar (folder → documents / sub-folders)
//   • DocumentOutline panel (heading hierarchy)
//
// The pattern (mirrors VS Code's indentation guides):
//
//   <NavBranch>            ← 1px gray guide line (widget-border)
//     <NavLeaf active>     ← 2px green line overlaps the gray line
//       row content
//     </NavLeaf>
//     <NavLeaf>            ← transparent border, gray line shows through
//       row content
//     </NavLeaf>
//   </NavBranch>
//
// Because every leaf's `-ml-px border-l-2` sits on the exact same
// x-coordinate as the branch's `border-l`, the green segment is
// perfectly straight and continuous.
// ──────────────────────────────────────────────────────────────────

interface NavBranchProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Vertical branch container — draws a thin gray guide line
 * (`--vscode-widget-border`) on the left edge.
 *
 * Place `NavLeaf` children inside. Each leaf's `-ml-px border-l-2`
 * sits exactly on top of this line.
 *
 * Accepts all standard `<div>` props (onClick, data-*, style, …).
 */
export function NavBranch({ children, className = '', style, ...rest }: NavBranchProps) {
  return (
    <div
      {...rest}
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
