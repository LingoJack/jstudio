const shapeGroups = [
  {
    label: "\u57FA\u7840\u56FE\u5F62",
    shapes: [
      { shape: "rectangle", title: "\u77E9\u5F62" },
      { shape: "rounded", title: "\u5706\u89D2\u77E9\u5F62" },
      { shape: "ellipse", title: "\u692D\u5706" },
      { shape: "diamond", title: "\u83F1\u5F62" },
      { shape: "text", title: "\u6587\u672C" },
      { shape: "note", title: "\u6CE8\u91CA\u6846" },
      { shape: "database", title: "\u6570\u636E\u5E93" }
    ]
  },
  {
    label: "\u601D\u7EF4\u5BFC\u56FE",
    shapes: [
      { shape: "topic", title: "\u4E3B\u9898\u8282\u70B9" }
    ]
  },
  {
    label: "\u6CF3\u9053\u56FE",
    shapes: [
      { shape: "swimlane-v", title: "\u5782\u76F4\u6CF3\u9053" },
      { shape: "swimlane-h", title: "\u6C34\u5E73\u6CF3\u9053" }
    ]
  },
  {
    label: "\u65F6\u5E8F\u56FE",
    shapes: [
      { shape: "lifeline", title: "\u751F\u547D\u7EBF" },
      { shape: "actor", title: "\u89D2\u8272" }
    ]
  }
  // activation 已从工具栏移除：手绘时序图时，从 lifelineA 拖消息到 lifelineB
  // 会自动在 B 上生成 activation（可用工具栏开关关闭）。shape 定义保留（AI 生成和旧数据仍能用）。
];
const shapeTitleMap = new Map(
  shapeGroups.flatMap((g) => g.shapes.map((s) => [s.shape, s.title]))
);
export {
  shapeGroups,
  shapeTitleMap
};
