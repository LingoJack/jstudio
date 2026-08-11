const SHAPE_PALETTE_LIGHT = {
  rectangle: { fill: "none", stroke: "#374151" },
  // 中性灰描边
  rounded: { fill: "none", stroke: "#374151" },
  ellipse: { fill: "none", stroke: "#374151" },
  diamond: { fill: "none", stroke: "#374151" },
  text: { fill: "none", stroke: "none" },
  actor: { fill: "none", stroke: "#374151" },
  "swimlane-v": { fill: "none", stroke: "#374151" },
  "swimlane-h": { fill: "none", stroke: "#374151" },
  lifeline: { fill: "none", stroke: "#374151" },
  activation: { fill: "#F3F4F6", stroke: "#374151" },
  note: { fill: "none", stroke: "#374151" },
  database: { fill: "none", stroke: "#374151" },
  topic: { fill: "#E0E7FF", stroke: "#6366F1" },
  // 思维导图根节点默认：浅靛蓝填充
  "edge-line": { fill: "none", stroke: "#0052D9" },
  "edge-ortho": { fill: "none", stroke: "#0052D9" },
  "edge-dashed": { fill: "none", stroke: "#0052D9" },
  "edge-no-arrow": { fill: "none", stroke: "#0052D9" }
};
const SHAPE_PALETTE_DARK = {
  rectangle: { fill: "none", stroke: "#9CA3AF" },
  rounded: { fill: "none", stroke: "#9CA3AF" },
  ellipse: { fill: "none", stroke: "#9CA3AF" },
  diamond: { fill: "none", stroke: "#9CA3AF" },
  text: { fill: "none", stroke: "none" },
  actor: { fill: "none", stroke: "#9CA3AF" },
  "swimlane-v": { fill: "none", stroke: "#9CA3AF" },
  "swimlane-h": { fill: "none", stroke: "#9CA3AF" },
  lifeline: { fill: "none", stroke: "#9CA3AF" },
  activation: { fill: "#374151", stroke: "#9CA3AF" },
  note: { fill: "none", stroke: "#9CA3AF" },
  database: { fill: "none", stroke: "#9CA3AF" },
  topic: { fill: "#3730A3", stroke: "#818CF8" },
  // 思维导图根节点默认：暗色靛蓝填充
  "edge-line": { fill: "none", stroke: "#07C160" },
  "edge-ortho": { fill: "none", stroke: "#07C160" },
  "edge-dashed": { fill: "none", stroke: "#07C160" },
  "edge-no-arrow": { fill: "none", stroke: "#07C160" }
};
const FONT_LIGHT = "#374151";
const FONT_DARK = "#E5E7EB";
const FILL_COLOR_PAIRS = [
  { light: "#fef3c7", dark: "#713f12", label: "\u6D45\u9EC4" },
  { light: "#dbeafe", dark: "#1e3a8a", label: "\u6D45\u84DD" },
  { light: "#dcfce7", dark: "#14532d", label: "\u6D45\u7EFF" },
  { light: "#fce7f3", dark: "#831843", label: "\u6D45\u7C89" },
  { light: "#f3e8ff", dark: "#581c87", label: "\u6D45\u7D2B" },
  { light: "#fed7aa", dark: "#7c2d12", label: "\u6D45\u6A59" },
  { light: "#e5e7eb", dark: "#4b5563", label: "\u6D45\u7070" },
  { light: "#ffffff", dark: "#1f2937", label: "\u767D\u8272" },
  { light: "#fde68a", dark: "#92400e", label: "\u9EC4" },
  { light: "#93c5fd", dark: "#1d4ed8", label: "\u84DD" },
  { light: "#86efac", dark: "#15803d", label: "\u7EFF" },
  { light: "#f9a8d4", dark: "#be185d", label: "\u7C89" },
  // 内部色（不在取色器中展示）：activation 活动块的默认填充，同样跟随主题。
  { light: "#f3f4f6", dark: "#374151", label: "" }
];
function fillPresetsFor(dark) {
  return FILL_COLOR_PAIRS.filter((p) => p.label).map((p) => ({
    value: dark ? p.dark : p.light,
    label: p.label
  }));
}
const fillLookup = /* @__PURE__ */ new Map();
for (const p of FILL_COLOR_PAIRS) {
  fillLookup.set(p.light.toLowerCase(), p);
  fillLookup.set(p.dark.toLowerCase(), p);
}
function mapFillColor(color, dark) {
  if (!color || color === "none") return color;
  const pair = fillLookup.get(color.toLowerCase());
  if (!pair) return color;
  const target = dark ? pair.dark : pair.light;
  return target;
}
function relativeLuminance(hex) {
  const m = hex.replace(/^#/, "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (full.length !== 6) return null;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
const FONT_ON_DARK_FILL = "#F9FAFB";
const FONT_ON_LIGHT_FILL = "#1F2937";
function fontColorFor(fill, dark) {
  if (!fill || fill === "none") return getFontColor(dark);
  const lum = relativeLuminance(fill);
  if (lum === null) return getFontColor(dark);
  return lum > 0.5 ? FONT_ON_LIGHT_FILL : FONT_ON_DARK_FILL;
}
const EDGE_LIGHT = "#0052D9";
const EDGE_DARK = "#07C160";
function readThemeAccentColor(dark) {
  if (typeof window !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--vscode-focusBorder").trim();
    if (v) return v;
  }
  return dark ? EDGE_DARK : EDGE_LIGHT;
}
function readThemeEdgeColor(dark) {
  if (typeof window !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--vscode-diagram-edge").trim();
    if (v) return v;
  }
  return readThemeAccentColor(dark);
}
function lightenHex(hex, amount) {
  const m = hex.replace(/^#/, "");
  if (m.length !== 6) return hex;
  const r = Number.parseInt(m.slice(0, 2), 16);
  const g = Number.parseInt(m.slice(2, 4), 16);
  const b = Number.parseInt(m.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return hex;
  const mix = (v) => Math.min(255, Math.round(v + (255 - v) * amount)).toString(16).padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}
const SHAPE_STROKE_WIDTH = 1.5;
const SHAPE_FONT_SIZE = 13;
const SHAPE_ARC_SIZE = 12;
const DEFAULT_MINDMAP_SCHEME = "neon";
const NEON_ROOT = {
  dark: { fill: "#0D1117", stroke: "#22D3EE", text: "#22D3EE" },
  light: { fill: "#FFFFFF", stroke: "#0891B2", text: "#0E7490" }
};
const NEON_BRANCH_COLORS = [
  {
    name: "purple",
    dark: { stroke: "#A78BFA", text: "#C4B5FD" },
    light: { stroke: "#8B5CF6", text: "#6D28D9" }
  },
  {
    name: "emerald",
    dark: { stroke: "#34D399", text: "#6EE7B7" },
    light: { stroke: "#10B981", text: "#047857" }
  },
  {
    name: "amber",
    dark: { stroke: "#FBBF24", text: "#FDE68A" },
    light: { stroke: "#F59E0B", text: "#B45309" }
  }
];
const NEON_FILL = { dark: "#0D1117", light: "#FFFFFF" };
const MONO_ROOT = {
  dark: { fill: "#FAFAFA", stroke: "none", text: "#18181B" },
  light: { fill: "#18181B", stroke: "none", text: "#FFFFFF" }
};
const MONO_BRANCH = {
  dark: { fill: "#18181B", stroke: "#FAFAFA", text: "#FAFAFA" },
  light: { fill: "#FFFFFF", stroke: "#18181B", text: "#18181B" }
};
const MONO_LEAF = {
  dark: { fill: "#18181B", stroke: "#52525B", text: "#A1A1AA" },
  light: { fill: "#FFFFFF", stroke: "#D4D4D8", text: "#71717A" }
};
const MONO_EDGE = {
  dark: { branch: "#FAFAFA", leaf: "#52525B" },
  light: { branch: "#18181B", leaf: "#D4D4D8" }
};
const MINDMAP_ARC_SIZE = 18;
const LEGACY_MINDMAP_ROOT_LIGHT = { fill: "#E0E7FF", stroke: "#6366F1", font: "#312E81" };
const LEGACY_MINDMAP_ROOT_DARK = { fill: "#3730A3", stroke: "#818CF8", font: "#E0E7FF" };
const LEGACY_MINDMAP_ROOT_FONT_SIZE = 15;
const LEGACY_MINDMAP_BRANCH_LIGHT = { fill: "#EEF2FF", stroke: "#A5B4FC", font: "#4338CA" };
const LEGACY_MINDMAP_BRANCH_DARK = { fill: "#312E81", stroke: "#6366F1", font: "#C7D2FE" };
const LEGACY_MINDMAP_LEAF_LIGHT = { fill: "#F5F7FF", stroke: "#C7D2FE", font: "#6366F1" };
const LEGACY_MINDMAP_LEAF_DARK = { fill: "#1E1B4B", stroke: "#4F46E5", font: "#A5B4FC" };
const LEGACY_MINDMAP_FILL_TO_DEPTH = {
  "#e0e7ff": 0,
  "#3730a3": 0,
  "#eef2ff": 1,
  "#312e81": 1,
  "#f5f7ff": 2,
  "#1e1b4b": 2
};
function mindmapStyleForDepth(depth, dark, scheme = DEFAULT_MINDMAP_SCHEME, branchIndex = 0) {
  if (scheme === "neon") {
    const fill = dark ? NEON_FILL.dark : NEON_FILL.light;
    if (depth <= 0) {
      const p2 = dark ? NEON_ROOT.dark : NEON_ROOT.light;
      return {
        fillColor: p2.fill,
        strokeColor: p2.stroke,
        fontColor: p2.text,
        strokeWidth: 2,
        fontSize: 15,
        fontStyle: 1
        // bold
      };
    }
    const branch = NEON_BRANCH_COLORS[branchIndex % NEON_BRANCH_COLORS.length];
    const bc = dark ? branch.dark : branch.light;
    if (depth === 1) {
      return {
        fillColor: fill,
        strokeColor: bc.stroke,
        fontColor: bc.stroke,
        strokeWidth: 1.5,
        fontSize: SHAPE_FONT_SIZE,
        fontStyle: 1
        // bold（分支字号小但加粗，对标 SVG）
      };
    }
    return {
      fillColor: fill,
      strokeColor: bc.stroke,
      fontColor: bc.text,
      strokeWidth: 1,
      fontSize: SHAPE_FONT_SIZE,
      fontStyle: 0
    };
  }
  if (depth <= 0) {
    const p2 = dark ? MONO_ROOT.dark : MONO_ROOT.light;
    return {
      fillColor: p2.fill,
      strokeColor: p2.stroke,
      fontColor: p2.text,
      strokeWidth: 0,
      fontSize: 15,
      fontStyle: 1
      // bold
    };
  }
  if (depth === 1) {
    const p2 = dark ? MONO_BRANCH.dark : MONO_BRANCH.light;
    return {
      fillColor: p2.fill,
      strokeColor: p2.stroke,
      fontColor: p2.text,
      strokeWidth: 1.5,
      fontSize: SHAPE_FONT_SIZE,
      fontStyle: 1
      // bold
    };
  }
  const p = dark ? MONO_LEAF.dark : MONO_LEAF.light;
  return {
    fillColor: p.fill,
    strokeColor: p.stroke,
    fontColor: p.text,
    strokeWidth: 1,
    fontSize: SHAPE_FONT_SIZE,
    fontStyle: 0
  };
}
function mindmapEdgeStrokeColor(scheme, dark, depth, branchIndex = 0) {
  if (scheme === "neon") {
    const branch = NEON_BRANCH_COLORS[branchIndex % NEON_BRANCH_COLORS.length];
    return (dark ? branch.dark : branch.light).stroke;
  }
  const ec = dark ? MONO_EDGE.dark : MONO_EDGE.light;
  return depth <= 1 ? ec.branch : ec.leaf;
}
function mindmapEdgeStrokeWidth(scheme, depth) {
  if (scheme === "neon") {
    return depth <= 1 ? 2.5 : 1;
  }
  return 1.5;
}
function legacyMindmapStyleForDepth(depth, dark) {
  if (depth <= 0) {
    const p2 = dark ? LEGACY_MINDMAP_ROOT_DARK : LEGACY_MINDMAP_ROOT_LIGHT;
    return {
      fillColor: p2.fill,
      strokeColor: p2.stroke,
      fontColor: p2.font,
      strokeWidth: 1.5,
      fontSize: LEGACY_MINDMAP_ROOT_FONT_SIZE,
      fontStyle: 1
    };
  }
  if (depth === 1) {
    const p2 = dark ? LEGACY_MINDMAP_BRANCH_DARK : LEGACY_MINDMAP_BRANCH_LIGHT;
    return {
      fillColor: p2.fill,
      strokeColor: p2.stroke,
      fontColor: p2.font,
      strokeWidth: 1,
      fontSize: SHAPE_FONT_SIZE,
      fontStyle: 0
    };
  }
  const p = dark ? LEGACY_MINDMAP_LEAF_DARK : LEGACY_MINDMAP_LEAF_LIGHT;
  return {
    fillColor: p.fill,
    strokeColor: p.stroke,
    fontColor: p.font,
    strokeWidth: 0.5,
    fontSize: SHAPE_FONT_SIZE,
    fontStyle: 0
  };
}
function mindmapMetaFromStyle(style) {
  if (!style) return null;
  const rawScheme = style.mmScheme;
  if (rawScheme !== "neon" && rawScheme !== "mono") return null;
  const depth = typeof style.mmDepth === "number" ? style.mmDepth : 0;
  const branchIndex = typeof style.mmBranch === "number" ? style.mmBranch : 0;
  return { scheme: rawScheme, depth, branchIndex };
}
function mindmapDepthFromFill(fill) {
  if (!fill || fill === "none") return null;
  const key = fill.toLowerCase();
  return key in LEGACY_MINDMAP_FILL_TO_DEPTH ? LEGACY_MINDMAP_FILL_TO_DEPTH[key] : null;
}
const ARROW_END_SIZE = 3;
const SELECTION_STROKE_WIDTH = 2;
const SELECTION_DASHED = false;
const HANDLE_SIZE = 6;
const CONNECTION_POINT_SIZE = 10;
function paletteFor(shape, dark) {
  const pal = (dark ? SHAPE_PALETTE_DARK : SHAPE_PALETTE_LIGHT)[shape];
  if (shape === "edge-line" || shape === "edge-ortho" || shape === "edge-dashed" || shape === "edge-no-arrow") {
    return { fill: pal.fill, stroke: readThemeEdgeColor(dark) };
  }
  return pal;
}
function getSelectionColor(dark) {
  return readThemeAccentColor(dark);
}
function getHandleFillColor(dark) {
  return readThemeAccentColor(dark);
}
function getHandleStrokeColor(dark) {
  return readThemeAccentColor(dark);
}
function getConnectionPointColor(dark) {
  return readThemeAccentColor(dark);
}
function readEditorBackground(dark) {
  if (typeof window !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--vscode-editor-background").trim();
    if (v) return v;
  }
  return dark ? "#1e1e1e" : "#ffffff";
}
function getLabelBackgroundColor(dark) {
  return readEditorBackground(dark);
}
function getEdgeColor(dark) {
  return readThemeEdgeColor(dark);
}
function getEdgeDotColor(dark) {
  return lightenHex(readThemeEdgeColor(dark), 0.4);
}
function getFontColor(dark) {
  return dark ? FONT_DARK : FONT_LIGHT;
}
function createConnectionPointSVG(dark, size = CONNECTION_POINT_SIZE) {
  const color = getConnectionPointColor(dark);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="none"/>
  </svg>`;
  const base64 = btoa(
    encodeURIComponent(svg).replace(
      /%([0-9A-F]{2})/g,
      (_match, p1) => String.fromCharCode(Number.parseInt(p1, 16))
    )
  );
  return `data:image/svg+xml;base64,${base64}`;
}
function createLifelineConnectionPointSVG(dark) {
  const size = 2;
  const color = readThemeEdgeColor(dark);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}" fill-opacity="0.3" stroke="none"/>
  </svg>`;
  const base64 = btoa(
    encodeURIComponent(svg).replace(
      /%([0-9A-F]{2})/g,
      (_match, p1) => String.fromCharCode(Number.parseInt(p1, 16))
    )
  );
  return `data:image/svg+xml;base64,${base64}`;
}
export {
  ARROW_END_SIZE,
  CONNECTION_POINT_SIZE,
  DEFAULT_MINDMAP_SCHEME,
  EDGE_DARK,
  EDGE_LIGHT,
  FONT_DARK,
  FONT_LIGHT,
  HANDLE_SIZE,
  MINDMAP_ARC_SIZE,
  SELECTION_DASHED,
  SELECTION_STROKE_WIDTH,
  SHAPE_ARC_SIZE,
  SHAPE_FONT_SIZE,
  SHAPE_PALETTE_DARK,
  SHAPE_PALETTE_LIGHT,
  SHAPE_STROKE_WIDTH,
  createConnectionPointSVG,
  createLifelineConnectionPointSVG,
  fillPresetsFor,
  fontColorFor,
  getConnectionPointColor,
  getEdgeColor,
  getEdgeDotColor,
  getFontColor,
  getHandleFillColor,
  getHandleStrokeColor,
  getLabelBackgroundColor,
  getSelectionColor,
  legacyMindmapStyleForDepth,
  mapFillColor,
  mindmapDepthFromFill,
  mindmapEdgeStrokeColor,
  mindmapEdgeStrokeWidth,
  mindmapMetaFromStyle,
  mindmapStyleForDepth,
  paletteFor
};
