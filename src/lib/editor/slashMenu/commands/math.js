const mathCommand = {
  title: "Formula",
  description: "Insert a LaTeX math formula",
  icon: "\u2211",
  aliases: ["formula", "math", "equation", "latex", "katex", "\u516C\u5F0F", "\u6570\u5B66", "\u65B9\u7A0B", "\u516C\u5F0F\u5757"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setMathBlock().run()
};
export {
  mathCommand
};
