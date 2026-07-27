import type React from 'react';
import { ChevronRight } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────
// NavBranch / NavRow
//
// Shared navigation tree primitives used across the app:
// - `Settings.tsx` — sidebar settings nav (primary + secondary)
// - `DocumentSidebar.tsx` — folder/document tree (primary + secondary)
// - `SectionOutline.tsx` — heading outline (primary + secondary)
//
// NavRow supports two visual modes:
//  - classic (default): hover bg + indicator bar
//  - clean (`noHover` + `plain` NavBranch): flat, rounded, no guides
// ──────────────────────────────────────────────────────────────────

interface NavBranchProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remove the vertical guide-line border for a cleaner, flatter look. */
  plain?: boolean;
  children: React.ReactNode;
}

/**
 * Vertical branch container.
 *
 * Default: thin gray guide line (`border-l`).
 * `plain`: no border – hierarchy is conveyed purely by indentation.
 */
export function NavBranch({ children, className = '', style, plain = false, ...rest }: NavBranchProps) {
  return (
    <div
      {...rest}
      style={style}
      className={`${plain ? '' : 'border-l border-[var(--vscode-widget-border)]'} space-y-0.5 ${className}`}
    >
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────

interface NavRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> {
  level?: 'primary' | 'secondary';
  active?: boolean;
  highlighted?: boolean;
  plainActive?: boolean;
  /** Batch-selection highlight (distinct from active/current document). */
  selected?: boolean;
  icon?: React.ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  /** Disable the default hover background – uses a subtle text-color
   *  brightening instead, giving a cleaner / flatter list look. */
  noHover?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Navigation row used across the app.
 *
 * Two visual modes controlled by `noHover`:
 *  - Classic (default, Settings / SectionOutline): hover background,
 *    left-border indicator on secondary, active-indicator bar.
 *  - Clean (`noHover`, DocumentSidebar): no hover background (subtle
 *    text brightening), rounded backgrounds on both levels, no
 *    indicator bar - a flatter, unified look.
 */
export function NavRow({
  level = 'primary',
  active = false,
  highlighted = false,
  plainActive = false,
  selected = false,
  icon,
  expandable = false,
  expanded = false,
  noHover = false,
  className = '',
  children,
  ...rest
}: NavRowProps) {
  const isPrimary = level === 'primary';
  // The indicator bar is only shown in the "classic" mode (Settings /
  // SectionOutline).  In the clean `noHover` mode used by DocumentSidebar
  // the background highlight alone signals the active row.
  const showIndicator = !noHover && (active || highlighted);

  // ── Base layout ───────────────────────────────────────────
  // `relative` is needed for the active-indicator bar (absolute positioned).

  const primaryBase =
    'w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-150 cursor-pointer rounded-md relative';

  // In `noHover` (clean) mode the secondary row drops the left-border
  // indicator in favour of the same rounded background used by primary
  // rows, giving a unified look.
  const secondaryBase = noHover
    ? 'w-full flex items-center gap-2 pl-4 pr-3 py-1.5 text-sm transition-colors duration-150 cursor-pointer rounded-md relative'
    : 'w-full flex items-center gap-2 pl-4 pr-3 py-1.5 -ml-px text-sm transition-colors duration-150 cursor-pointer border-l-2 relative';

  // Primary active/inactive
  let primaryState: string;
  if (highlighted) {
    primaryState =
      'bg-[var(--vscode-list-activeSelectionBackground)] ring-1 ring-inset ring-[var(--vscode-focusBorder)] text-[var(--vscode-list-activeSelectionForeground)] font-medium';
  } else if (active) {
    primaryState =
      'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)] font-medium';
  } else if (selected) {
    primaryState = 'bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]';
  } else {
    primaryState = noHover
      ? 'text-[var(--vscode-sideBar-foreground)] hover:text-[var(--vscode-foreground)]'
      : 'text-[var(--vscode-sideBar-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]';
  }

  // Secondary active/inactive
  let secondaryState: string;
  if (highlighted) {
    secondaryState =
      'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)] font-medium';
  } else if (active) {
    secondaryState =
      'border-transparent bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)] font-medium';
  } else if (selected) {
    secondaryState =
      'border-transparent bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]';
  } else {
    secondaryState = noHover
      ? 'border-transparent text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
      : 'border-transparent text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]';
  }

  const cls = isPrimary
    ? `${primaryBase} ${primaryState}`
    : `${secondaryBase} ${secondaryState}`;

  // Plain text/number: keep truncate on the wrapper itself so ellipsis works.
  // Complex children (multiple elements expecting flex layout): use a flex
  // container so that inner flex utilities (flex-1, shrink-0, …) take effect.
  const isPlainText = typeof children === 'string' || typeof children === 'number';

  return (
    <div {...rest} className={`${cls} ${className}`}>
      {showIndicator && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--vscode-list-activeSelectionForeground)] opacity-90" />
      )}
      {icon != null && <span className="shrink-0">{icon}</span>}
      {isPlainText ? (
        <span className="flex-1 text-left truncate">{children}</span>
      ) : (
        <span className="flex-1 flex items-center gap-2 min-w-0 text-left overflow-hidden">
          {children}
        </span>
      )}
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
