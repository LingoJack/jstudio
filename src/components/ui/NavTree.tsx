import type React from 'react';
import { ChevronRight } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────
// NavBranch / NavRow
//
// Shared navigation tree components used by:
//   • Settings sidebar (section → sub-items)
//   • DocumentList sidebar (folder → documents / sub-folders)
//   • DocumentOutline panel (heading hierarchy)
//
// Visual pattern (mirrors VS Code's indentation guides):
//
//   <NavBranch>                 ← 1px gray guide line (widget-border)
//     <NavRow level="secondary" active>
//       row content             ← 2px green line overlaps the gray line
//     </NavRow>
//     <NavRow level="secondary">
//       row content             ← transparent border, gray line shows through
//     </NavRow>
//   </NavBranch>
// ──────────────────────────────────────────────────────────────────

interface NavBranchProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Vertical branch container — draws a thin gray guide line
 * (`--vscode-widget-border`) on the left edge.
 *
 * Place `NavRow` children inside. Each secondary-level row's
 * `-ml-px border-l-2` sits exactly on top of this line.
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

// ──────────────────────────────────────────────────────────────────

interface NavRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  /**
   * Visual weight:
   * - `'primary'`   — 14px text, `py-2.5 gap-3 px-3` (top-level items)
   * - `'secondary'` — 13px text, `py-1.5 gap-2 pl-4 pr-3` (nested items)
   */
  level?: 'primary' | 'secondary';
  /**
   * Show the 2px left focus line.
   *
   * Set to `true` for rows inside a `NavBranch` (the line overlaps the
   * branch's gray guide). Also set `true` for standalone rows that need
   * a line indicator (e.g. folder drop-target highlight).
   */
  lined?: boolean;
  /** Active selection — green line + selection background. */
  active?: boolean;
  /** Transient highlight — green line only (e.g. drop target, flash). */
  highlighted?: boolean;
  /**
   * When `true` and `active`, skip the background fill and only bold
   * the text. Used for expandable primary items (per Settings pattern).
   */
  plainActive?: boolean;
  /** Optional icon element (caller sizes it, e.g. `w-5 h-5 opacity-70`). */
  icon?: React.ReactNode;
  /** Show an expand/collapse chevron on the right. */
  expandable?: boolean;
  /** Chevron rotation state (only relevant when `expandable`). */
  expanded?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * A single navigation row with consistent styling across the app.
 *
 * Encapsulates layout (padding, gap, text size), state (active /
 * highlighted / hover), the optional left focus line, icon slot, and
 * expand chevron — so callers never need to repeat class names.
 *
 * All standard `<div>` props are forwarded via `...rest`.
 */
export function NavRow({
  level = 'primary',
  lined = false,
  active = false,
  highlighted = false,
  plainActive = false,
  icon,
  expandable = false,
  expanded = false,
  className = '',
  children,
  ...rest
}: NavRowProps) {
  const isPrimary = level === 'primary';
  const showLine = (active || highlighted) && lined;

  return (
    <div
      {...rest}
      className={[
        'flex items-center rounded-md transition-colors duration-150 cursor-pointer',
        // ── Layout by level ──
        isPrimary
          ? 'gap-3 px-3 py-2.5 text-sm'
          : 'gap-2 pl-4 pr-3 py-1.5 text-[13px]',
        // ── Left focus line (only when lined) ──
        lined
          ? '-ml-px border-l-2 ' + (showLine
            ? 'border-[var(--vscode-focusBorder)]'
            : 'border-transparent')
          : '',
        // ── State ──
        active
          ? plainActive
            ? 'text-[var(--vscode-foreground)] font-medium'
            : 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
          : isPrimary
            ? 'text-[var(--vscode-sideBar-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
            : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]',
        className,
      ].filter(Boolean).join(' ')}
    >
      {icon != null && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 min-w-0 truncate text-left">{children}</span>
      {expandable && (
        <ChevronRight
          className={`w-3.5 h-3.5 opacity-50 transition-transform duration-200 shrink-0 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      )}
    </div>
  );
}
