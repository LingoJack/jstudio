const tableCommand = {
  title: "Table",
  description: "Insert an editable table",
  icon: "\u229E",
  aliases: ["table", "grid", "\u77E9\u9635"],
  command: ({ editor, range }) => {
    import("../../../../components/editor/nodes/TableSizeSelector").then(({ mountTableSizeSelector }) => {
      mountTableSizeSelector(editor, range);
    });
  }
};
export {
  tableCommand
};
