const fileCommand = {
  title: "File",
  description: "Upload a file attachment",
  icon: "FILE",
  aliases: ["file", "attachment", "upload", "doc", "pdf", "document"],
  command: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setFile().run();
  }
};
export {
  fileCommand
};
