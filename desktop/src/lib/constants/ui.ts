/**
 * UI Constants — single source of truth for z-index, dimensions, timing.
 *
 * All hardcoded magic numbers in CSS/Tailwind classes should reference
 * these constants. This makes the UI consistent and easier to adjust.
 *
 * Usage in Tailwind:
 *   - z-index: Use predefined z-* classes (z-modal, z-popover, z-toolbar)
 *   - widths: Use CSS variables or inline styles with constants
 *   - timing: Use predefined duration-* classes where possible
 */

// ── Z-Index Hierarchy ───────────────────────────────────────────────
// Following a strict stacking order prevents z-index wars.
// Higher values = closer to user. Each layer has a 10-unit buffer.

export const Z_INDEX = {
  /** Base layer (normal content) */
  BASE: 0,
  /** Dropdowns, menus (above content but below modals) */
  DROPDOWN: 50,
  /** Fixed toolbars, headers (TitleBar, ActivityBar) */
  TOOLBAR: 50,
  /** Popovers, floating panels (above dropdowns) */
  POPOVER: 70,
  /** Modals, dialogs (above everything except notifications) */
  MODAL: 100,
  /** Toast notifications (topmost, always visible) */
  TOAST: 110,
} as const;

// ── Dimensions ───────────────────────────────────────────────────────

/** Sidebar and panel widths */
export const SIDEBAR = {
  /** Activity bar width (leftmost icon strip) */
  ACTIVITY_BAR: 48,
  /** Document list / terminal sidebar default width */
  LIST: 240,
  /** Tab width in sidebar */
  TAB_DOCUMENT: 140,
  /** Tab width in terminal sidebar */
  TAB_TERMINAL: 120,
} as const;

/** Modal and dialog dimensions */
export const MODAL = {
  /** Command palette width */
  COMMAND_PALETTE: 640,
  /** Command palette window width (slightly wider) */
  COMMAND_PALETTE_WINDOW: 680,
  /** Trash dialog width */
  TRASH_DIALOG: 480,
} as const;

/** Menu dimensions */
export const MENU = {
  /** Minimum width for dropdown menus */
  MIN_WIDTH: 160,
  /** Context menu minimum width */
  CONTEXT_MIN_WIDTH: 140,
  /** Context menu maximum width */
  CONTEXT_MAX_WIDTH: 340,
} as const;

/** Link preview dimensions */
export const LINK_PREVIEW = {
  /** Minimum width for link embed cards */
  MIN_WIDTH: 240,
  /** Fallback width when actual width is unknown */
  FALLBACK_WIDTH: 480,
} as const;

/** Code block dimensions */
export const CODE_BLOCK = {
  /** Minimum width */
  MIN_WIDTH: 240,
} as const;

// ── Font Sizes ───────────────────────────────────────────────────────
// Tailwind uses rem, but we track px values for reference.

export const FONT_SIZE = {
  /** Tiny text (badges, labels) — Tailwind: text-[10px] */
  TINY: 10,
  /** Small text — Tailwind: text-[11px] */
  SMALL: 11,
  /** Body text — Tailwind: text-[13px] (slightly larger than default 12px) */
  BODY: 13,
  /** Default text — Tailwind: text-sm (12px / 0.75rem) */
  DEFAULT: 12,
} as const;

// ── Timing (Animation Durations) ─────────────────────────────────────
// Tailwind duration-* classes use milliseconds.

export const DURATION = {
  /** Fast transitions (hover states) — Tailwind: duration-75 */
  FAST: 75,
  /** Normal transitions (color changes) — Tailwind: duration-100 */
  NORMAL: 100,
  /** Medium transitions (expansion, slide) — Tailwind: duration-150 */
  MEDIUM: 150,
  /** Slow transitions (modal open/close) — Tailwind: duration-200 */
  SLOW: 200,
} as const;

// ── Spacing ──────────────────────────────────────────────────────────

export const SPACING = {
  /** Gap between panes in terminal split view */
  PANE_GAP: 1,
  /** Padding for drag ghost offset */
  DRAG_OFFSET: 4,
} as const;

// ── Shadows ──────────────────────────────────────────────────────────

/** Shadow presets for consistent depth perception */
export const SHADOW = {
  /** Light shadow for dropdowns */
  LIGHT: '0 4px 16px rgba(0,0,0,0.25)',
  /** Medium shadow for panels */
  MEDIUM: '0 8px 24px -8px rgba(0,0,0,0.35)',
  /** Heavy shadow for modals */
  HEAVY: '0 20px 70px -12px rgba(0,0,0,0.55), 0 8px 24px -8px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.06)',
  /** Command palette shadow */
  COMMAND_PALETTE: '0 24px 80px -12px rgba(0,0,0,0.5), 0 8px 24px -8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)',
} as const;

// ── CSS Variable Helper ──────────────────────────────────────────────
/**
 * Generate Tailwind z-index class from Z_INDEX constant.
 * Usage: className={zIndexClass(Z_INDEX.MODAL)}
 */
export function zIndexClass(z: number): string {
  return `z-[${z}]`;
}

/**
 * Generate inline width style.
 * Usage: style={{ width: widthPx(MODAL.COMMAND_PALETTE) }}
 */
export function widthPx(w: number): string {
  return `${w}px`;
}

/**
 * Generate CSS min-width expression with viewport fallback.
 * Usage: style={{ width: widthWithVw(MODAL.COMMAND_PALETTE, 90) }}
 */
export function widthWithVw(w: number, vwPercent: number): string {
  return `min(${w}px, ${vwPercent}vw)`;
}