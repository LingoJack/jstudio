const quoteCommand = {
  title: "Quote",
  description: "Capture a quote",
  icon: "\u275D",
  aliases: ["quote", "blockquote", "\u5F15\u7528"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run()
};
export {
  quoteCommand
};
