const numberedListCommand = {
  title: "Numbered List",
  description: "Create a list with numbering",
  icon: "1.",
  aliases: ["numbered", "ordered", "ol", "number", "\u6709\u5E8F"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run()
};
export {
  numberedListCommand
};
