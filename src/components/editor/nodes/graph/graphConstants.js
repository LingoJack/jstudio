import {
  paletteFor,
  getFontColor,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  SHAPE_ARC_SIZE,
  mindmapStyleForDepth,
  MINDMAP_ARC_SIZE,
  DEFAULT_MINDMAP_SCHEME
} from "./graphTheme";
const DEFAULT_SIZE = {
  rectangle: { w: 120, h: 60 },
  rounded: { w: 120, h: 60 },
  ellipse: { w: 120, h: 80 },
  diamond: { w: 80, h: 80 },
  text: { w: 60, h: 30 },
  actor: { w: 50, h: 150 },
  // 小人：宽度 50，高度 150（头部 50 + 生命线 100）
  "swimlane-v": { w: 200, h: 300 },
  "swimlane-h": { w: 300, h: 200 },
  lifeline: { w: 100, h: 150 },
  // 生命线：宽度 100，高度 150（头部 50 + 生命线 100）
  activation: { w: 16, h: 60 },
  note: { w: 100, h: 60 },
  database: { w: 120, h: 80 },
  topic: { w: 100, h: 36 },
  // 思维导图节点：紧凑圆角矩形
  "edge-line": { w: 100, h: 20 },
  "edge-ortho": { w: 100, h: 20 },
  "edge-dashed": { w: 100, h: 20 },
  "edge-no-arrow": { w: 100, h: 20 }
};
const SHAPE_LABEL = {
  rectangle: "\u5904\u7406",
  rounded: "\u8D77\u6B62",
  ellipse: "\u8282\u70B9",
  diamond: "\u5224\u5B9A",
  text: "\u6587\u672C",
  actor: "",
  "swimlane-v": "\u6CF3\u9053",
  "swimlane-h": "\u6CF3\u9053",
  lifeline: "",
  activation: "",
  note: "\u6CE8\u91CA",
  database: "\u6570\u636E\u5E93",
  topic: "\u4E3B\u9898",
  "edge-line": "",
  "edge-ortho": "",
  "edge-dashed": "",
  "edge-no-arrow": ""
};
function styleForShape(shape, dark, scheme = DEFAULT_MINDMAP_SCHEME) {
  const pal = paletteFor(shape, dark);
  const base = {
    fillColor: pal.fill,
    strokeColor: pal.stroke,
    strokeWidth: SHAPE_STROKE_WIDTH,
    fontSize: SHAPE_FONT_SIZE,
    fontColor: getFontColor(dark),
    // 无填充时内部可穿透点击，仅边框可选中/拖动；有填充色时自动失效。
    pointerEvents: false
  };
  switch (shape) {
    case "rounded":
      return { ...base, shape: "rectangle", rounded: true, absoluteArcSize: true, arcSize: SHAPE_ARC_SIZE };
    case "diamond":
      return { ...base, shape: "rhombus" };
    case "ellipse":
      return { ...base, shape: "ellipse" };
    case "text":
      return { shape: "text", fillColor: "none", strokeColor: "none", fontColor: getFontColor(dark), fontSize: SHAPE_FONT_SIZE };
    case "actor":
      return { ...base, shape: "umlActor", perimeter: "lifelinePerimeter" };
    case "swimlane-v":
      return { ...base, shape: "swimlane", swimlaneLine: true, startSize: 30, horizontal: false };
    case "swimlane-h":
      return { ...base, shape: "swimlane", swimlaneLine: true, startSize: 30, horizontal: true };
    case "lifeline":
      return { ...base, shape: "lifeline", perimeter: "lifelinePerimeter" };
    case "activation":
      return { ...base, shape: "umlActivation", perimeter: "activationPerimeter" };
    case "note":
      return { ...base, shape: "note" };
    case "database":
      return { ...base, shape: "database" };
    case "topic":
      return {
        shape: "rectangle",
        rounded: true,
        absoluteArcSize: true,
        arcSize: MINDMAP_ARC_SIZE,
        ...mindmapStyleForDepth(0, dark, scheme, 0),
        isTopic: 1,
        mmScheme: scheme,
        mmBranch: 0,
        mmDepth: 0
      };
    // 连线类型：统一实线 + 圆点流动（流动由 CSS 动画驱动，见 vscode-theme.css）。
    // 箭头 marker 由 ConnectorShape.setDashed(false) 渲染为实线，不受流动影响。
    case "edge-line":
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: "classic", endSize: 8 };
    case "edge-ortho":
      return { strokeColor: pal.stroke, strokeWidth: 1.5, edgeStyle: "obstacleEdgeStyle", endArrow: "classic", endSize: 8 };
    case "edge-dashed":
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: "classic", endSize: 8 };
    case "edge-no-arrow":
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: "none" };
    case "rectangle":
    default:
      return { ...base, shape: "rectangle" };
  }
}
const GRID_SIZE = 10;
const EVENT_TOLERANCE = 18;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const MIN_DRAW_SIZE = 12;
const CONNECTION_POINTS = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5]
];
export {
  CONNECTION_POINTS,
  DEFAULT_SIZE,
  EVENT_TOLERANCE,
  GRID_SIZE,
  MIN_DRAW_SIZE,
  SHAPE_LABEL,
  ZOOM_MAX,
  ZOOM_MIN,
  styleForShape
};
