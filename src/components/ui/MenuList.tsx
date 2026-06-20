import React from 'react';
 
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
    <div className="my-1 border-t border-[var(--vscode-menu-separatorBackground)]" />
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
 * The floating / dropdown container that wraps MenuItem / MenuDivider.
 *
 * When `x` / `y` are provided the menu is `position: fixed` at those
 * coordinates (right-click context menu).  When omitted it flows inline
 * (dropdown triggered by a button) — the caller positions it via the
 * surrounding relative wrapper.
 */
export function MenuList({
  x,
  y,
  className = '',
  onClick,
  children,
}: MenuListProps) {
  const isFixed = x !== undefined && y !== undefined;
  return (
    <div
      className={`z-50 min-w-[160px] py-1 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-lg text-sm ${className}`}
      style={isFixed ? { left: x, top: y } : undefined}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
