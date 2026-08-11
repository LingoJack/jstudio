const heading6Command = {
  title: "Heading 6",
  description: "Smallest section heading",
  icon: "H6",
  aliases: ["heading6", "h6"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 6 }).run()
};
export {
  heading6Command
};
