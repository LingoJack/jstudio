import React from 'react';
import { useEffect, useRef, useState } from 'react';
 
/**
 * Reusable VS Code-style menu primitives.
 *
 * Extracted from DocumentContextMenu / TerminalTabContextMenu, which had
 * identical styling duplicated via copy-paste.  All floating menus and
 * dropdown menus in the app should use these components so that visual
 * consistency is guaranteed by construction, not by convention.
 *
 * CSS variables used (all defined in vscode-theme.css):
 *   --vscode-menu-background
 *   --vscode-menu-foreground
 *   --vscode-menu-border
 *   --vscode-menu-hoverBackground
 *   --vscode-menu-separatorBackground
 *   --vscode-errorForeground   (for danger items)
 */

// ── MenuItem ──────────────────────────────────────────────

interface MenuItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style — `danger` renders the item in errorForeground. */
  variant?: 'default' | 'danger';
  /** Optional icon node shown before the label. */
  icon?: React.ReactNode;
}

const MENU_ITEM_BASE =
  'w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer text-sm';

const MENU_ITEM_VARIANT: Record<NonNullable<MenuItemProps['variant']>, string> = {
  default:
    'text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-hoverBackground)]',
  danger:
    'text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-menu-hoverBackground)]',
};

/** A single clickable row inside a menu. */
export function MenuItem({
  variant = 'default',
  icon,
  className = '',
  children,
  ...props
}: MenuItemProps) {
  return (
    <button
      type="button"
      className={`${MENU_ITEM_BASE} ${MENU_ITEM_VARIANT[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="w-4 h-4 flex items-center justify-center opacity-70">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

// ── MenuDivider ───────────────────────────────────────────

/** A thin separator line between menu groups. */
export function MenuDivider() {
  return (
    <div className="my-1 border-t border-[var(--vscode-menu-separatorBackground)] opacity-60" />
  );
}

// ── MenuList ──────────────────────────────────────────────

interface MenuListProps {
  /** Screen coordinates (fixed positioning) — omit for inline (relative) dropdowns. */
  x?: number;
  y?: number;
  /** Extra class names to merge into the container. */
  className?: string;
  /** Click handler on the container (use for stopPropagation). */
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

/**
 * Compute the clamped position so the menu never overflows the viewport.
 *
 * After the menu DOM is mounted we measure its actual width/height, then
 * shift it left/up as needed so it always fits within the window.
 */
function useClampedPosition(x: number, y: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reposition = () => {
      const { width, height } = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({
        left: Math.min(x, vw - width - 8),
        top: Math.min(y, vh - height - 8),
      });
    };

    // Measure right after mount (one tick for layout).
    reposition();

    // Keep the menu on-screen whenever the viewport changes.
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [x, y]);

  return { ref, pos };
}

/**
 * The floating / dropdown container that wraps MenuItem / MenuDivider.
 *
 * When `x` / `y` are provided the menu is `position: fixed` at those
 * coordinates (right-click context menu). The position is automatically
 * clamped so the menu never overflows the window edge, and re-clamped
 * on `resize` so it stays fully visible at any window size.
 *
 * When `x` / `y` are omitted it flows inline (dropdown triggered by a
 * button) — the caller positions it via the surrounding relative wrapper.
 */
export function MenuList({
  x,
  y,
  className = '',
  onClick,
  children,
}: MenuListProps) {
  const isFixed = x !== undefined && y !== undefined;
  const { ref, pos } = useClampedPosition(x ?? 0, y ?? 0);

  return (
    <div
      ref={ref}
      className={`z-dropdown min-w-menu py-1 rounded-lg border border-[var(--vscode-menu-border, var(--vscode-widget-border))] bg-[var(--vscode-menu-background)] shadow-lg text-sm ${isFixed ? 'fixed' : ''} ${className}`}
      style={isFixed ? { left: pos.left, top: pos.top } : undefined}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
