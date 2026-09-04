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
    id: 'maple-mono-cn',
    label: 'Maple Mono CN（内置）',
    fontFamily: "'Maple Mono CN'",
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
    id: 'maple-mono-cn',
    label: 'Maple Mono CN（内置等宽中文）',
    fontFamily: "'Maple Mono CN'",
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
  {
    id: 'sarasa-mono',
    label: '更纱黑体等宽 (Sarasa Mono SC)',
    fontFamily:
      "'Sarasa Mono SC', 'Sarasa Mono CL', 'Sarasa Mono J', 'Noto Sans Mono CJK SC', 'Source Han Mono SC', 'Osaka-Mono', 'PingFang SC'",
    preview: '你好世界 汉字',
  },
  {
    id: 'noto-mono-cjk',
    label: '思源等宽黑体 (Noto Sans Mono CJK SC)',
    fontFamily:
      "'Noto Sans Mono CJK SC', 'Source Han Mono SC', 'Source Han Mono', 'Sarasa Mono SC', 'Osaka-Mono', 'PingFang SC'",
    preview: '你好世界 汉字',
  },
  {
    id: 'osaka-mono',
    label: '大阪等宽 (Osaka-Mono)',
    fontFamily: "'Osaka-Mono', 'Osaka', 'PingFang SC'",
    preview: '你好世界 汉字',
  },
];

// ---- system fonts ----

/**
 * Id prefix for a font picked from the machine's installed fonts rather
 * than from the built-in presets. The remainder is the raw family name,
 * e.g. `system:Maple Mono`.
 */
export const SYSTEM_FONT_PREFIX = 'system:';

/** Wrap a font family name in quotes so it is safe inside a CSS stack. */
function quoteFamily(family: string): string {
  return `'${family.replace(/'/g, "\\'")}'`;
}

/** Build a `FontPreset` for one of the machine's installed font families. */
export function toSystemFontPreset(family: string): FontPreset {
  return {
    id: `${SYSTEM_FONT_PREFIX}${family}`,
    label: family,
    fontFamily: quoteFamily(family),
    preview: 'AaBbCc 你好',
  };
}

/**
 * Resolve one half of the font stack: either a built-in preset id or a
 * `system:<family>` id produced by the settings font picker.
 */
function resolveFontId(
  id: string | undefined,
  presets: FontPreset[],
  fallback: FontPreset = presets[0],
): string {
  if (!id) return fallback.fontFamily;
  if (id.startsWith(SYSTEM_FONT_PREFIX)) {
    return quoteFamily(id.slice(SYSTEM_FONT_PREFIX.length));
  }
  return (presets.find((f) => f.id === id) ?? fallback).fontFamily;
}

/** Default Latin font preset id. */
export const DEFAULT_LATIN_FONT_ID = 'monaco';

/** Default CJK font preset id. */
export const DEFAULT_CJK_FONT_ID = 'pingfang';

/**
 * Build a combined CSS `font-family` string from the selected Latin
 * and CJK preset ids. The Latin font is placed first so it takes
 * priority for Latin glyphs; the CJK font follows for Chinese
 * characters; a generic family is appended as the final fallback.
 *
 * Both ids accept `system:<family>` ids from the settings font picker.
 */
export function resolveFontFamily(
  latinId: string | undefined,
  cjkId: string | undefined,
): string {
  const latinFamily = resolveFontId(latinId, LATIN_FONTS);
  const cjkFamily = resolveFontId(cjkId, CJK_FONTS);

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
export const DEFAULT_FONT_SIZE = 16;

// ---- editor line height ----

/**
 * Editor line height (line spacing) — controls the CSS `line-height`
 * of `.ProseMirror` and therefore the spacing between text lines
 * within a paragraph as well as between paragraphs.
 *
 * 1.5 = compact, 1.7 = default, 2.0 = relaxed.
 */
export const MIN_LINE_HEIGHT = 1.4;
export const MAX_LINE_HEIGHT = 2.2;
export const DEFAULT_LINE_HEIGHT = 1.7;

// ---- monospace fonts (for terminal) ----

/**
 * Monospace fonts suitable for the terminal.
 * These are truly monospaced with good box-drawing / emoji metrics.
 */
export const MONOSPACE_FONTS: FontPreset[] = [
  {
    id: 'monaco',
    label: 'Monaco',
    fontFamily: "'Monaco'",
    preview: 'AaBbCc 123',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    fontFamily: "'JetBrains Mono'",
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
    id: 'fira-code',
    label: 'Fira Code',
    fontFamily: "'Fira Code'",
    preview: 'AaBbCc 123',
  },
];

/** Default terminal monospace font id. */
export const DEFAULT_MONOSPACE_FONT_ID = 'monaco';

/**
 * All fonts selectable for the terminal: the curated monospace presets
 * first, then every editor (Latin + CJK) preset not already present.
 * Deduped by id, keeping the first occurrence (the monospace label).
 */
export const TERMINAL_FONTS: FontPreset[] = (() => {
  const seen = new Set<string>();
  const out: FontPreset[] = [];
  for (const font of [...MONOSPACE_FONTS, ...LATIN_FONTS, ...CJK_FONTS]) {
    if (seen.has(font.id)) continue;
    seen.add(font.id);
    out.push(font);
  }
  return out;
})();

/**
 * Resolve a terminal font id to its CSS font-family string. Accepts any
 * editor preset id, monospace preset id, or system font id
 * (`system:<family>`).
 */
export function resolveMonospaceFont(id: string | undefined): string {
  return resolveFontId(id, TERMINAL_FONTS) ?? MONOSPACE_FONTS[0].fontFamily;
}
