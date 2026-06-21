import type React from 'react';
import { ChevronRight } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────
// NavBranch / NavRow
//
// Shared navigation tree primitives used across the app:
// - `Settings.tsx` — sidebar settings nav (primary + secondary)
// - `DocumentList.tsx` — folder/document tree (primary + secondary)
// - `DocumentOutline.tsx` — heading outline (primary + secondary)
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
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors duration-150 cursor-pointer';

  // Base layout — secondary row
  const secondaryBase =
    'w-full flex items-center gap-2 pl-4 pr-3 py-1.5 -ml-px text-[13px] transition-colors duration-150 cursor-pointer border-l-2';

  // Primary active/inactive
  let primaryState: string;
  if (active) {
    primaryState = plainActive
      ? 'text-[var(--vscode-foreground)] font-medium'
      : 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium';
  } else {
    primaryState = 'text-[var(--vscode-sideBar-foreground)]';
  }

  // Secondary active/inactive
  let secondaryState: string;
  if (showLine) {
    secondaryState =
      'border-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)] font-medium';
  } else {
    secondaryState =
      'border-transparent text-[var(--vscode-descriptionForeground)]';
  }

  const cls = isPrimary
    ? `${primaryBase} ${primaryState}`
    : `${secondaryBase} ${secondaryState}`;

  return (
    <div {...rest} className={`${cls} ${className}`}>
      {icon != null && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 text-left truncate">{children}</span>
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
