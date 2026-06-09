//! 全局常量 — 集中管理散落各处的魔法值。

// ── Tab ────────────────────────────────────────
/** 同时打开新文件的并发上限（防误点把内存撑爆） */
export const MAX_TABS = 32

// ── 侧栏 ───────────────────────────────────────
/** 侧栏默认宽度（px） */
export const SIDEBAR_DEFAULT = 270
/** 侧栏最小宽度（px） */
export const SIDEBAR_MIN = 180
/** 侧栏最大宽度（px） */
export const SIDEBAR_MAX = 560

// ── localStorage keys ──────────────────────────
export const LS_SIDEBAR_WIDTH = 'jreader.sidebarWidth'
export const LS_SIDEBAR_COLLAPSED = 'jreader.sidebarCollapsed'
export const LS_THEME = 'jreader.theme'
export const LS_FONT_SCALE = 'jreader.fontScale'
export const LS_ACTIVITY = 'jreader.activity'
export const LS_TOC_PINNED = 'jreader.tocPinned'
