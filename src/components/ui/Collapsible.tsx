/**
 * Collapsible — public reusable collapsible/fold container.
 *
 * Extracted from HelpSection's inline `CollapsibleSection` so that both the
 * settings help page and the editor's collapsible block share the exact same
 * visual language (rounded border + hoverable header + animated chevron).
 *
 * For plain React usage (settings page etc.) use the `Collapsible` component.
 * For TipTap NodeView usage (where you must wrap with `NodeViewWrapper` /
 * `NodeViewContent`), import the exported class constants instead.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────
// Shared class-name constants
// ──────────────────────────────────────────────────────────────────

/**
 * Outer wrapper: rounded border container.
 * Use on the outermost element of a collapsible region.
 */
export const COLLAPSIBLE_WRAPPER_CLASS =
  'rounded-lg border border-[var(--vscode-widget-border)] overflow-hidden';

/**
 * Header row: hoverable, full-width.
 * Transparent by default (matches code-block-header), light tint on hover.
 * Pair with a ChevronDown icon that rotates when `open`.
 */
export const COLLAPSIBLE_HEADER_CLASS =
  'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer';

/**
 * Body container: padded content area shown when expanded.
 */
export const COLLAPSIBLE_BODY_CLASS = 'px-4 py-3';

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

interface CollapsibleProps {
  /** Whether the body is currently expanded. */
  open?: boolean;
  /** Called when the header is clicked. If omitted, the component manages its own state. */
  onToggle?: () => void;
  /** Default expansion state when used uncontrolled. */
  defaultOpen?: boolean;
  /** Header content rendered after the chevron. */
  header: ReactNode;
  /** Collapsible body content. */
  children: ReactNode;
  /** Optional extra class on the outer wrapper. */
  className?: string;
}

/**
 * A self-contained collapsible card.
 *
 * Controlled usage (editor block):
 * ```tsx
 * <Collapsible open={open} onToggle={() => setOpen(!open)} header={...}>
 *   ...
 * </Collapsible>
 * ```
 *
 * Uncontrolled usage (settings page):
 * ```tsx
 * <Collapsible defaultOpen header={...}>
 *   ...
 * </Collapsible>
 * ```
 */
export function Collapsible({
  open: controlledOpen,
  onToggle,
  defaultOpen = false,
  header,
  children,
  className = '',
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? internalOpen;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalOpen((prev) => !prev);
    }
  };

  return (
    <div className={`${COLLAPSIBLE_WRAPPER_CLASS} ${className}`.trim()}>
      <button
        type="button"
        onClick={handleToggle}
        className={COLLAPSIBLE_HEADER_CLASS}
      >
        <ChevronDown
          className={`w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
        <span className="flex-1">{header}</span>
      </button>
      {isOpen && <div className={COLLAPSIBLE_BODY_CLASS}>{children}</div>}
    </div>
  );
}

export default Collapsible;
