import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
const taskListMarkdownRegex = /^\s*\[( |x|X)?\]\s$/;
const TaskListMarkdown = Extension.create({
  name: "taskListMarkdown",
  addOptions() {
    return {
      typeName: "taskList"
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("taskListMarkdown"),
        props: {
          handleTextInput(view, from, to, text) {
            const { state } = view;
            if (text !== " ") {
              return false;
            }
            const $from = state.doc.resolve(from);
            let textBefore = "";
            $from.parent.nodesBetween(0, $from.parentOffset, (node) => {
              if (node.isText) {
                textBefore += node.text;
              }
              return true;
            });
            textBefore += text;
            const match = textBefore.match(taskListMarkdownRegex);
            if (!match) {
              return false;
            }
            const fullMatch = match[0];
            const matchStart = from - (fullMatch.length - 1);
            const innerChar = match[1];
            const isChecked = innerChar === "x" || innerChar === "X";
            editor.chain().deleteRange({ from: matchStart, to }).toggleTaskList().run();
            if (isChecked) {
              const { $from: $after } = editor.state.selection;
              for (let depth = $after.depth; depth > 0; depth--) {
                const node = $after.node(depth);
                if (node.type.name === "taskItem") {
                  const pos = $after.before(depth);
                  editor.chain().command(({ tr }) => {
                    const currentNode = tr.doc.nodeAt(pos);
                    if (currentNode) {
                      tr.setNodeMarkup(pos, void 0, {
                        ...currentNode.attrs,
                        checked: true
                      });
                    }
                    return true;
                  }).run();
                  break;
                }
              }
            }
            return true;
          }
        }
      })
    ];
  }
});
export {
  TaskListMarkdown
};
