const dividerCommand = {
  title: "Divider",
  description: "Visual separator between blocks",
  icon: "\u2014",
  aliases: ["divider", "separator", "horizontal", "hr", "\u5206\u5272\u7EBF", "\u5206\u9694\u7EBF"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run()
};
export {
  dividerCommand
};
