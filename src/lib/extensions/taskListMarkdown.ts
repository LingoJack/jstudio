/**
 * TaskListMarkdown — adds markdown shortcut for TaskList.
 *
 * ## Why this extension exists
 *
 * TipTap's stock `@tiptap/extension-list` TaskItem extension (v3.26.0)
 * registers an input rule using `wrappingInputRule({ type: taskItem })`.
 * However, `taskItem` does NOT belong to the `block` group — only `taskList`
 * does. ProseMirror's `findWrapping` fails silently, so typing `[] `, `[ ] `,
 * `[x] ` does nothing.
 *
 * ## This approach: handleTextInput + editor command
 *
 * Instead of fighting ProseMirror's InputRule system with manual transactions,
 * we use a ProseMirror plugin with `handleTextInput` that:
 *
 *   1. Checks if the accumulated text in the current paragraph matches
 *      `[] `, `[ ] `, `[x] `, or `[X] `.
 *   2. If matched, deletes the matched range and calls
 *      `editor.chain().toggleTaskList().run()`.
 *
 * The `toggleTaskList` command (which calls `toggleList('taskList',
 * 'taskItem')`) already handles ALL scenarios correctly:
 *   - paragraph → taskList (wrapping)
 *   - bulletList → taskList (conversion)
 *   - orderedList → taskList (conversion)
 * And it correctly maps cursor position, so we don't need any manual
 * selection management.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Matches `[] `, `[ ] `, `[x] `, or `[X] ` at the start of a line.
 *
 * Capture group 1: the inner character (`undefined`, ` `, `x`, or `X`).
 * If it's `x` or `X`, the task item should be checked.
 */
const taskListMarkdownRegex = /^\s*\[( |x|X)?\]\s$/;

export interface TaskListMarkdownOptions {
  /** The taskList node type name. @default 'taskList' */
  typeName: string;
}

export const TaskListMarkdown = Extension.create<TaskListMarkdownOptions>({
  name: 'taskListMarkdown',

  addOptions() {
    return {
      typeName: 'taskList',
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('taskListMarkdown'),
        props: {
          handleTextInput(view, from, to, text) {
            const { state } = view;

            // Only interested in the space character that completes the pattern.
            if (text !== ' ') {
              return false;
            }

            const $from = state.doc.resolve(from);

            // Build the text content from the start of the textblock to
            // the current position, plus the incoming character.
            let textBefore = '';
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

            // Calculate the range to delete: from the start of the matched
            // markdown text to the current cursor position (inclusive of
            // the incoming space).
            const fullMatch = match[0];
            const matchStart = from - (fullMatch.length - 1);

            // Delete the matched text and toggle task list.
            const innerChar = match[1];
            const isChecked = innerChar === 'x' || innerChar === 'X';

            editor
              .chain()
              .deleteRange({ from: matchStart, to })
              .toggleTaskList()
              .run();

            // If [x] or [X], set the current item to checked.
            if (isChecked) {
              const { $from: $after } = editor.state.selection;
              for (let depth = $after.depth; depth > 0; depth--) {
                const node = $after.node(depth);
                if (node.type.name === 'taskItem') {
                  const pos = $after.before(depth);
                  editor
                    .chain()
                    .command(({ tr }) => {
                      const currentNode = tr.doc.nodeAt(pos);
                      if (currentNode) {
                        tr.setNodeMarkup(pos, undefined, {
                          ...currentNode.attrs,
                          checked: true,
                        });
                      }
                      return true;
                    })
                    .run();
                  break;
                }
              }
            }

            return true;
          },
        },
      }),
    ];
  },
});
