/**
 * Font preset definitions for the editor and UI.
 *
 * Each preset provides a CSS `font-family` stack. The stacks are designed
 * so that Latin text uses the named English font while CJK text falls
 * through to 苹方 (PingFang SC) or an appropriate Chinese counterpart.
 */
export interface FontPreset {
  id: string;
  label: string;
  /** Full CSS font-family value. */
  fontFamily: string;
}

/**
 * Built-in font presets shown in Settings › General › Font.
 *
 * The default ('monaco') matches the user's request:
 *   English → Monaco, Chinese → 苹方 (PingFang SC).
 */
export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'monaco',
    label: 'Monaco',
    fontFamily: "'Monaco', 'PingFang SC', sans-serif",
  },
  {
    id: 'sf-mono',
    label: 'SF Mono',
    fontFamily: "'SF Mono', 'PingFang SC', sans-serif",
  },
  {
    id: 'menlo',
    label: 'Menlo',
    fontFamily: "'Menlo', 'PingFang SC', sans-serif",
  },
  {
    id: 'system',
    label: '系统默认',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
  },
  {
    id: 'helvetica',
    label: 'Helvetica',
    fontFamily: "'Helvetica Neue', 'PingFang SC', sans-serif",
  },
  {
    id: 'times',
    label: 'Times New Roman',
    fontFamily: "'Times New Roman', 'Songti SC', serif",
  },
  {
    id: 'courier',
    label: 'Courier New',
    fontFamily: "'Courier New', 'PingFang SC', monospace",
  },
];

/** Default font preset id. */
export const DEFAULT_FONT_ID = 'monaco';

/** Resolve a preset id to its CSS font-family string. Falls back to default. */
export function resolveFontFamily(id: string | undefined): string {
  const preset = FONT_PRESETS.find((f) => f.id === id);
  return preset?.fontFamily ?? FONT_PRESETS[0].fontFamily;
}

// ---- font size ----

/** Minimum, maximum, and default editor font size in pixels. */
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 22;
export const DEFAULT_FONT_SIZE = 14;
