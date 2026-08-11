const diagramCommand = {
  title: "Diagram",
  description: "Draw architecture, flow, or requirement diagrams",
  icon: "\u25A6",
  aliases: ["diagram", "draw", "\u753B\u677F", "\u67B6\u6784\u56FE", "\u6D41\u7A0B\u56FE", "\u9700\u6C42\u56FE", "\u767D\u677F"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setDiagram().run()
};
export {
  diagramCommand
};
