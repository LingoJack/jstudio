const heading5Command = {
  title: "Heading 5",
  description: "Minor section heading",
  icon: "H5",
  aliases: ["heading5", "h5"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 5 }).run()
};
export {
  heading5Command
};
