/**
 * Mermaid configuration - theme variables and the initialize() config builder.
 *
 * Extracted from CodeBlockView so the (large) theme objects and the config
 * literal live in one testable, dependency-free module. The hook in
 * CodeBlockView now simply calls `mermaid.initialize(buildMermaidConfig(isDarkMode))`.
 *
 * The accent blue (#4A90D9) is shared between light / dark; only backgrounds
 * and text colours flip. The dark palette matches the VSCode-style dark theme
 * in `vscode-theme.css` (#1e1e1e bg / #d4d4d4 fg).
 */

/* ------------------------------------------------------------------ */
/* 思维导图（mindmap）配色                                             */
/* ------------------------------------------------------------------ */

/**
 * mindmap 的分支填充 / 连线色取自 cScale1..11（第 n 个分支用 cScale{n+1}），
 * 根节点填充取 git0（cScale0 兜底），文字色取 cScaleLabel1..11（根节点文字是
 * cScaleLabel0 / gitBranchLabel0）。
 *
 * base 主题缺省时这组颜色由 primaryColor 旋转色相 + darken(25%) 生成，得到
 * 一组深蓝/深紫底色，再配 #333 的缺省文字色 —— 浅色主题下深底深字不可读。
 * 这里显式给出最终色值（theme.calculate 对用户提供的 cScale 系列与 git0
 * 会原样保留，只有派生值按它们重算）。
 *
 * 分区色沿用画板自动上色同族的柔和色板（graphAutoColor / FILL_COLOR_PAIRS），
 * 相邻分支色相错开；这些键同时被 timeline / kanban 的分区配色复用，风格一致。
 * git0 同时是 gitgraph 的分支色，设为主题蓝无副作用。
 */
const MINDMAP_ROOT_FILL = "#4A90D9";
const MINDMAP_ROOT_TEXT = "#FFFFFF";
const MINDMAP_SECTION_TEXT_LIGHT = "#1F2937";
const MINDMAP_SECTION_TEXT_DARK = "#E5E7EB";

const MINDMAP_SECTION_FILLS_LIGHT = [
  "#93c5fd", // 蓝
  "#fdba74", // 橙
  "#86efac", // 绿
  "#f9a8d4", // 粉
  "#d8b4fe", // 紫
  "#7dd3fc", // 天蓝
  "#fde68a", // 琥珀
  "#fca5a5", // 红
  "#6ee7b7", // 翠绿
  "#d9f99d", // 青柠
  "#a5b4fc", // 靛蓝
];

const MINDMAP_SECTION_FILLS_DARK = [
  "#1e3a8a", // 蓝
  "#7c2d12", // 橙
  "#14532d", // 绿
  "#831843", // 粉
  "#581c87", // 紫
  "#155e75", // 天蓝
  "#713f12", // 琥珀
  "#7f1d1d", // 红
  "#064e3b", // 翠绿
  "#3f6212", // 青柠
  "#3730a3", // 靛蓝
];

/** 把分区色板展开成 themeVariables 所需的 cScale* / git0 键值。 */
function mindmapThemeVariables(sectionFills: string[], sectionText: string) {
  const vars: Record<string, string> = {
    git0: MINDMAP_ROOT_FILL,
    gitBranchLabel0: MINDMAP_ROOT_TEXT,
    cScale0: MINDMAP_ROOT_FILL,
    cScaleLabel0: MINDMAP_ROOT_TEXT,
  };
  sectionFills.forEach((fill, i) => {
    vars[`cScale${i + 1}`] = fill;
    vars[`cScaleLabel${i + 1}`] = sectionText;
  });
  return vars;
}

/**
 * Mermaid themeVariables for light mode.
 */
export const MERMAID_THEME_LIGHT = {
  ...mindmapThemeVariables(
    MINDMAP_SECTION_FILLS_LIGHT,
    MINDMAP_SECTION_TEXT_LIGHT,
  ),
  primaryColor: "#4A90D9",
  primaryTextColor: "#333",
  primaryBorderColor: "#2B5F8E",
  lineColor: "#5A5A5A",
  secondaryColor: "#E8F4FD",
  tertiaryColor: "#F5F5F5",
  background: "#FFFFFF",
  mainBkg: "#FFFFFF",
  nodeBorder: "#4A90D9",
  clusterBkg: "#F0F4F8",
  clusterBorder: "#4A90D9",
  titleColor: "#333",
  edgeLabelBackground: "#FFFFFF",
  actorBkg: "#E8F4FD",
  actorBorder: "#4A90D9",
  actorTextColor: "#333",
  actorLineColor: "#5A5A5A",
  signalColor: "#4A90D9",
  signalTextColor: "#333",
  labelBoxBkg: "#E8F4FD",
  labelBoxBorderColor: "#4A90D9",
  labelTextColor: "#333",
  loopTextColor: "#333",
  noteBorderColor: "#4A90D9",
  noteBkgColor: "#FFF9E6",
  noteTextColor: "#333",
  activationBorderColor: "#4A90D9",
  activationBkgColor: "#E8F4FD",
  sequenceNumberColor: "#FFFFFF",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/**
 * Mermaid themeVariables for dark mode.
 */
export const MERMAID_THEME_DARK = {
  ...mindmapThemeVariables(
    MINDMAP_SECTION_FILLS_DARK,
    MINDMAP_SECTION_TEXT_DARK,
  ),
  primaryColor: "#4A90D9",
  primaryTextColor: "#d4d4d4",
  primaryBorderColor: "#5B9FE0",
  lineColor: "#9aa0a6",
  secondaryColor: "#1e3a5f",
  tertiaryColor: "#2d2d30",
  background: "#1e1e1e",
  mainBkg: "#1e1e1e",
  nodeBorder: "#4A90D9",
  clusterBkg: "#252526",
  clusterBorder: "#4A90D9",
  titleColor: "#d4d4d4",
  edgeLabelBackground: "#1e1e1e",
  actorBkg: "#1e3a5f",
  actorBorder: "#4A90D9",
  actorTextColor: "#d4d4d4",
  actorLineColor: "#9aa0a6",
  signalColor: "#4A90D9",
  signalTextColor: "#d4d4d4",
  labelBoxBkg: "#1e3a5f",
  labelBoxBorderColor: "#4A90D9",
  labelTextColor: "#d4d4d4",
  loopTextColor: "#d4d4d4",
  noteBorderColor: "#4A90D9",
  noteBkgColor: "#3d3520",
  noteTextColor: "#d4d4d4",
  activationBorderColor: "#4A90D9",
  activationBkgColor: "#1e3a5f",
  sequenceNumberColor: "#FFFFFF",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/**
 * Build the configuration object passed to `mermaid.initialize()`.
 *
 * Re-runs when the app toggles dark mode so the global mermaid config picks
 * up the new themeVariables before the render effect regenerates the SVG.
 */
export function buildMermaidConfig(isDarkMode: boolean) {
  return {
    startOnLoad: false,
    securityLevel: "loose", // Allow click events in diagrams
    theme: "base", // Use base theme for customization
    themeVariables: isDarkMode ? MERMAID_THEME_DARK : MERMAID_THEME_LIGHT,
    flowchart: {
      useMaxWidth: false, // Generate fixed-size SVG for proper scaling
      htmlLabels: true,
      curve: "basis", // Smooth curved lines
      padding: 15,
      nodeSpacing: 50,
      rankSpacing: 50,
      diagramPadding: 8,
    },
    sequence: {
      useMaxWidth: false, // Generate fixed-size SVG for proper scaling
      diagramMarginX: 8,
      diagramMarginY: 8,
      actorMargin: 50,
      width: 150,
      height: 65,
      boxMargin: 10,
      boxTextMargin: 5,
      noteMargin: 10,
      messageMargin: 35,
      mirrorActors: false,
      bottomMarginAdj: 1,
    },
    gantt: {
      useMaxWidth: false,
      leftPadding: 75,
      gridLineStartPadding: 35,
      barHeight: 20,
      barGap: 4,
      topPadding: 50,
      titleTopMargin: 25,
    },
    class: {
      useMaxWidth: false,
    },
    state: {
      useMaxWidth: false,
    },
    pie: {
      useMaxWidth: false,
    },
  };
}
