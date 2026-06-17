/**
 * Font preset definitions for the editor and UI.
 *
 * Latin (English) fonts and CJK (Chinese) fonts are defined as separate
 * preset lists. The final CSS `font-family` stack is built by combining
 * the selected Latin preset + the selected CJK preset, so that Latin
 * glyphs use the Latin font and CJK glyphs fall through to the Chinese
 * font.
 */

/** A single selectable font option. */
export interface FontPreset {
  id: string;
  /** Display name shown in the dropdown. */
  label: string;
  /**
   * CSS font-family value for this preset. For Latin presets this is
   * just the font name; for CJK presets it is the Chinese font name.
   */
  fontFamily: string;
  /** Optional preview text rendered in the font's own face. */
  preview?: string;
}

/**
 * Built-in Latin (English) font presets.
 */
export const LATIN_FONTS: FontPreset[] = [
  {
    id: 'monaco',
    label: 'Monaco',
    fontFamily: "'Monaco'",
    preview: 'AaBbCc 123',
  },
  {
    id: 'sf-mono',
    label: 'SF Mono',
    fontFamily: "'SF Mono'",
    preview: 'AaBbCc 123',
  },
  {
    id: 'menlo',
    label: 'Menlo',
    fontFamily: "'Menlo'",
    preview: 'AaBbCc 123',
  },
  {
    id: 'system',
    label: 'System Default',
    fontFamily:
      "-apple-system, BlinkMacSystemFont",
    preview: 'AaBbCc 123',
  },
  {
    id: 'helvetica',
    label: 'Helvetica Neue',
    fontFamily: "'Helvetica Neue'",
    preview: 'AaBbCc 123',
  },
  {
    id: 'times',
    label: 'Times New Roman',
    fontFamily: "'Times New Roman'",
    preview: 'AaBbCc 123',
  },
  {
    id: 'courier',
    label: 'Courier New',
    fontFamily: "'Courier New'",
    preview: 'AaBbCc 123',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    fontFamily: "'Georgia'",
    preview: 'AaBbCc 123',
  },
  {
    id: 'avenir',
    label: 'Avenir Next',
    fontFamily: "'Avenir Next'",
    preview: 'AaBbCc 123',
  },
];

/**
 * Built-in CJK (Chinese) font presets.
 *
 * Only fonts commonly available on macOS are listed. Unknown / custom
 * system fonts will simply fall through to the browser default.
 */
export const CJK_FONTS: FontPreset[] = [
  {
    id: 'pingfang',
    label: '苹方 (PingFang SC)',
    fontFamily: "'PingFang SC'",
    preview: '你好世界 汉字',
  },
  {
    id: 'songti',
    label: '宋体 (Songti SC)',
    fontFamily: "'Songti SC'",
    preview: '你好世界 汉字',
  },
  {
    id: 'heiti',
    label: '黑体 (Heiti SC)',
    fontFamily: "'Heiti SC'",
    preview: '你好世界 汉字',
  },
  {
    id: 'kaiti',
    label: '楷体 (Kaiti SC)',
    fontFamily: "'Kaiti SC'",
    preview: '你好世界 汉字',
  },
  {
    id: 'yuanti',
    label: '圆体 (Yuanti SC)',
    fontFamily: "'Yuanti SC'",
    preview: '你好世界 汉字',
  },
  {
    id: 'libian',
    label: '隶变 (Libian SC)',
    fontFamily: "'Libian SC'",
    preview: '你好世界 汉字',
  },
  {
    id: 'xingkai',
    label: '行楷 (Xingkai SC)',
    fontFamily: "'Xingkai SC'",
    preview: '你好世界 汉字',
  },
  {
    id: 'system-cjk',
    label: '系统默认',
    fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
    preview: '你好世界 汉字',
  },
];

/** Default Latin font preset id. */
export const DEFAULT_LATIN_FONT_ID = 'monaco';

/** Default CJK font preset id. */
export const DEFAULT_CJK_FONT_ID = 'pingfang';

/**
 * @deprecated Use `resolveFontFamily(latinaId, cjkFontId)` instead.
 * Kept temporarily for backward compatibility — resolves the old
 * monolithic `fontId` which encoded both Latin + CJK in one stack.
 */
export const FONT_PRESETS: FontPreset[] = LATIN_FONTS;
export const DEFAULT_FONT_ID = DEFAULT_LATIN_FONT_ID;

/**
 * Build a combined CSS `font-family` string from the selected Latin
 * and CJK preset ids. The Latin font is placed first so it takes
 * priority for Latin glyphs; the CJK font follows for Chinese
 * characters; a generic family is appended as the final fallback.
 */
export function resolveFontFamily(
  latinId: string | undefined,
  cjkId: string | undefined,
): string {
  const latin = LATIN_FONTS.find((f) => f.id === latinId);
  const cjk = CJK_FONTS.find((f) => f.id === cjkId);

  const latinFamily = latin?.fontFamily ?? LATIN_FONTS[0].fontFamily;
  const cjkFamily = cjk?.fontFamily ?? CJK_FONTS[0].fontFamily;

  // Determine generic family based on whether either font is serif.
  const isSerif =
    latinId === 'times' || latinId === 'georgia' ||
    cjkId === 'songti' || cjkId === 'kaiti';
  const generic = isSerif ? 'serif' : 'sans-serif';

  return `${latinFamily}, ${cjkFamily}, ${generic}`;
}

// ---- font size ----

/** Minimum, maximum, and default editor font size in pixels. */
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 22;
export const DEFAULT_FONT_SIZE = 14;
