const imageCommand = {
  title: "Image",
  description: "Insert image placeholder",
  icon: "IMG",
  aliases: ["image", "img", "picture", "photo"],
  command: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setImage({ src: "" }).run();
  }
};
export {
  imageCommand
};
