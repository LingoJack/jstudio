const Z_INDEX = {
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
  TOAST: 110
};
const SIDEBAR = {
  /** Activity bar width (leftmost icon strip) */
  ACTIVITY_BAR: 48,
  /** Document list / terminal sidebar default width */
  LIST: 240,
  /** Tab width in sidebar */
  TAB_DOCUMENT: 140,
  /** Tab width in terminal sidebar */
  TAB_TERMINAL: 120
};
const MODAL = {
  /** Command palette width */
  COMMAND_PALETTE: 640,
  /** Command palette window width (slightly wider) */
  COMMAND_PALETTE_WINDOW: 680,
  /** Trash dialog width */
  TRASH_DIALOG: 480
};
const MENU = {
  /** Minimum width for dropdown menus */
  MIN_WIDTH: 160,
  /** Context menu minimum width */
  CONTEXT_MIN_WIDTH: 140,
  /** Context menu maximum width */
  CONTEXT_MAX_WIDTH: 340
};
const LINK_PREVIEW = {
  /** Minimum width for link embed cards */
  MIN_WIDTH: 240,
  /** Fallback width when actual width is unknown */
  FALLBACK_WIDTH: 480
};
const CODE_BLOCK = {
  /** Minimum width */
  MIN_WIDTH: 240
};
const FONT_SIZE = {
  /** Tiny text (badges, labels) — Tailwind: text-[10px] */
  TINY: 10,
  /** Small text — Tailwind: text-[11px] */
  SMALL: 11,
  /** Body text — Tailwind: text-[13px] (slightly larger than default 12px) */
  BODY: 13,
  /** Default text — Tailwind: text-sm (12px / 0.75rem) */
  DEFAULT: 12
};
const DURATION = {
  /** Fast transitions (hover states) — Tailwind: duration-75 */
  FAST: 75,
  /** Normal transitions (color changes) — Tailwind: duration-100 */
  NORMAL: 100,
  /** Medium transitions (expansion, slide) — Tailwind: duration-150 */
  MEDIUM: 150,
  /** Slow transitions (modal open/close) — Tailwind: duration-200 */
  SLOW: 200
};
const SPACING = {
  /** Gap between panes in terminal split view */
  PANE_GAP: 1,
  /** Padding for drag ghost offset */
  DRAG_OFFSET: 4
};
const SHADOW = {
  /** Light shadow for dropdowns */
  LIGHT: "0 4px 16px rgba(0,0,0,0.25)",
  /** Medium shadow for panels */
  MEDIUM: "0 8px 24px -8px rgba(0,0,0,0.35)",
  /** Heavy shadow for modals */
  HEAVY: "0 20px 70px -12px rgba(0,0,0,0.55), 0 8px 24px -8px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.06)",
  /** Command palette shadow */
  COMMAND_PALETTE: "0 24px 80px -12px rgba(0,0,0,0.5), 0 8px 24px -8px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)"
};
function zIndexClass(z) {
  return `z-[${z}]`;
}
function widthPx(w) {
  return `${w}px`;
}
function widthWithVw(w, vwPercent) {
  return `min(${w}px, ${vwPercent}vw)`;
}
export {
  CODE_BLOCK,
  DURATION,
  FONT_SIZE,
  LINK_PREVIEW,
  MENU,
  MODAL,
  SHADOW,
  SIDEBAR,
  SPACING,
  Z_INDEX,
  widthPx,
  widthWithVw,
  zIndexClass
};
