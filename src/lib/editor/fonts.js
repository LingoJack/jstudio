const LATIN_FONTS = [
  {
    id: "monaco",
    label: "Monaco",
    fontFamily: "'Monaco'",
    preview: "AaBbCc 123"
  },
  {
    id: "sf-mono",
    label: "SF Mono",
    fontFamily: "'SF Mono'",
    preview: "AaBbCc 123"
  },
  {
    id: "menlo",
    label: "Menlo",
    fontFamily: "'Menlo'",
    preview: "AaBbCc 123"
  },
  {
    id: "system",
    label: "System Default",
    fontFamily: "-apple-system, BlinkMacSystemFont",
    preview: "AaBbCc 123"
  },
  {
    id: "helvetica",
    label: "Helvetica Neue",
    fontFamily: "'Helvetica Neue'",
    preview: "AaBbCc 123"
  },
  {
    id: "times",
    label: "Times New Roman",
    fontFamily: "'Times New Roman'",
    preview: "AaBbCc 123"
  },
  {
    id: "courier",
    label: "Courier New",
    fontFamily: "'Courier New'",
    preview: "AaBbCc 123"
  },
  {
    id: "georgia",
    label: "Georgia",
    fontFamily: "'Georgia'",
    preview: "AaBbCc 123"
  },
  {
    id: "avenir",
    label: "Avenir Next",
    fontFamily: "'Avenir Next'",
    preview: "AaBbCc 123"
  }
];
const CJK_FONTS = [
  {
    id: "pingfang",
    label: "\u82F9\u65B9 (PingFang SC)",
    fontFamily: "'PingFang SC'",
    preview: "\u4F60\u597D\u4E16\u754C \u6C49\u5B57"
  },
  {
    id: "songti",
    label: "\u5B8B\u4F53 (Songti SC)",
    fontFamily: "'Songti SC'",
    preview: "\u4F60\u597D\u4E16\u754C \u6C49\u5B57"
  },
  {
    id: "heiti",
    label: "\u9ED1\u4F53 (Heiti SC)",
    fontFamily: "'Heiti SC'",
    preview: "\u4F60\u597D\u4E16\u754C \u6C49\u5B57"
  },
  {
    id: "kaiti",
    label: "\u6977\u4F53 (Kaiti SC)",
    fontFamily: "'Kaiti SC'",
    preview: "\u4F60\u597D\u4E16\u754C \u6C49\u5B57"
  },
  {
    id: "yuanti",
    label: "\u5706\u4F53 (Yuanti SC)",
    fontFamily: "'Yuanti SC'",
    preview: "\u4F60\u597D\u4E16\u754C \u6C49\u5B57"
  },
  {
    id: "libian",
    label: "\u96B6\u53D8 (Libian SC)",
    fontFamily: "'Libian SC'",
    preview: "\u4F60\u597D\u4E16\u754C \u6C49\u5B57"
  },
  {
    id: "xingkai",
    label: "\u884C\u6977 (Xingkai SC)",
    fontFamily: "'Xingkai SC'",
    preview: "\u4F60\u597D\u4E16\u754C \u6C49\u5B57"
  },
  {
    id: "system-cjk",
    label: "\u7CFB\u7EDF\u9ED8\u8BA4",
    fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
    preview: "\u4F60\u597D\u4E16\u754C \u6C49\u5B57"
  }
];
const DEFAULT_LATIN_FONT_ID = "monaco";
const DEFAULT_CJK_FONT_ID = "pingfang";
function resolveFontFamily(latinId, cjkId) {
  const latin = LATIN_FONTS.find((f) => f.id === latinId);
  const cjk = CJK_FONTS.find((f) => f.id === cjkId);
  const latinFamily = latin?.fontFamily ?? LATIN_FONTS[0].fontFamily;
  const cjkFamily = cjk?.fontFamily ?? CJK_FONTS[0].fontFamily;
  const isSerif = latinId === "times" || latinId === "georgia" || cjkId === "songti" || cjkId === "kaiti";
  const generic = isSerif ? "serif" : "sans-serif";
  return `${latinFamily}, ${cjkFamily}, ${generic}`;
}
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 22;
const DEFAULT_FONT_SIZE = 16;
const MIN_LINE_HEIGHT = 1.4;
const MAX_LINE_HEIGHT = 2.2;
const DEFAULT_LINE_HEIGHT = 1.7;
const MONOSPACE_FONTS = [
  {
    id: "monaco",
    label: "Monaco",
    fontFamily: "'Monaco'",
    preview: "AaBbCc 123"
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    fontFamily: "'JetBrains Mono'",
    preview: "AaBbCc 123"
  },
  {
    id: "sf-mono",
    label: "SF Mono",
    fontFamily: "'SF Mono'",
    preview: "AaBbCc 123"
  },
  {
    id: "menlo",
    label: "Menlo",
    fontFamily: "'Menlo'",
    preview: "AaBbCc 123"
  },
  {
    id: "fira-code",
    label: "Fira Code",
    fontFamily: "'Fira Code'",
    preview: "AaBbCc 123"
  }
];
const DEFAULT_MONOSPACE_FONT_ID = "monaco";
function resolveMonospaceFont(id) {
  const font = MONOSPACE_FONTS.find((f) => f.id === id);
  return font?.fontFamily ?? MONOSPACE_FONTS[0].fontFamily;
}
export {
  CJK_FONTS,
  DEFAULT_CJK_FONT_ID,
  DEFAULT_FONT_SIZE,
  DEFAULT_LATIN_FONT_ID,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_MONOSPACE_FONT_ID,
  LATIN_FONTS,
  MAX_FONT_SIZE,
  MAX_LINE_HEIGHT,
  MIN_FONT_SIZE,
  MIN_LINE_HEIGHT,
  MONOSPACE_FONTS,
  resolveFontFamily,
  resolveMonospaceFont
};
