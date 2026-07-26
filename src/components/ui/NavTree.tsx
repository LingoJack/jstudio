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
// All three consumers share the exact same visual spec via NavRow /
// NavBranch, so there is a single place to update styles.
// ──────────────────────────────────────────────────────────────────

interface NavBranchProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Vertical branch container — thin gray guide line.
 *
 * Exact copy of Settings.tsx:
 *   className="border-l border-[var(--vscode-widget-border)] space-y-0.5"
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
  level?: 'primary' | 'secondary';
  active?: boolean;
  highlighted?: boolean;
  plainActive?: boolean;
  /** Batch-selection highlight (distinct from active/current document). */
  selected?: boolean;
  icon?: React.ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Navigation row — exact visual clone of Settings.tsx hand-written styles.
 *
 * Primary level (copied from Settings main row):
 *   "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm
 *    transition-colors duration-150 cursor-pointer"
 *
 * Secondary level (copied from Settings sub-item):
 *   "w-full flex items-center gap-2 pl-4 pr-3 py-1.5 -ml-px text-[13px]
 *    transition-colors duration-150 cursor-pointer border-l-2"
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
  className = '',
  children,
  ...rest
}: NavRowProps) {
  const isPrimary = level === 'primary';
  const showLine = active || highlighted;

  // ── Classes copied verbatim from Settings.tsx ──────────────

  // Base layout — primary row
  const primaryBase =
    'w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-150 cursor-pointer rounded-md';

  // Base layout — secondary row
  const secondaryBase =
    'w-full flex items-center gap-2 pl-4 pr-3 py-1.5 -ml-px text-sm transition-colors duration-150 cursor-pointer border-l-2';

  // Primary active/inactive
  let primaryState: string;
  if (highlighted) {
    primaryState =
      'bg-[var(--vscode-list-activeSelectionBackground)] ring-1 ring-inset ring-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)]';
  } else if (active) {
    primaryState =
      'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium';
  } else if (selected) {
    primaryState = 'bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]';
  } else {
    primaryState = 'text-[var(--vscode-sideBar-foreground)]';
  }

  // Secondary active/inactive
  let secondaryState: string;
  if (highlighted) {
    secondaryState =
      'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium';
  } else if (showLine) {
    secondaryState =
      'border-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)] font-medium';
  } else if (selected) {
    secondaryState =
      'border-transparent bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]';
  } else {
    secondaryState =
      'border-transparent text-[var(--vscode-descriptionForeground)]';
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
