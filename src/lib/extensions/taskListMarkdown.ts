/**
 * TaskListMarkdown — adds markdown shortcut input rules for TaskList.
 *
 * ## Why this extension exists
 *
 * TipTap's stock `@tiptap/extension-list` TaskItem extension (v3.26.0)
 * registers an input rule that calls:
 *
 *   wrappingInputRule({ find: inputRegex, type: this.type })
 *
 * where `this.type` is `taskItem`. However, `taskItem` does NOT belong to the
 * `block` group — only `taskList` does. ProseMirror's `findWrappingOutside`
 * calls `parent.contentMatchAt(startIndex).findWrapping(taskItem)`, which
 * fails because the document node (content: `block+`) cannot directly contain
 * a `taskItem`. As a result, `findWrapping` returns null and the input rule
 * silently does nothing.
 *
 * ## What this extension does
 *
 * Registers an input rule that handles two scenarios:
 *
 * ### Rule 1: Direct wrap (paragraph → taskList)
 *
 * When the cursor is in a top-level paragraph (or any non-list container),
 * typing `[] `, `[ ] `, `[x] `, or `[X] ` wraps the paragraph in
 * `taskList > taskItem`.
 *
 * ### Rule 2: Bullet list conversion (- [ ] inside listItem)
 *
 * GFM syntax `- [ ]` is typed as two separate input-rule triggers:
 *
 *   1. User types `- `  → BulletList input rule fires immediately,
 *      creating `bulletList > listItem > paragraph`.
 *   2. User types `[ ] ` inside the listItem → our Rule 1 can't wrap because
 *      listItem.content is `paragraph block*` and `taskList` is not a valid
 *      child of listItem. So we detect this case and convert the entire
 *      `bulletList` into a `taskList`, and each `listItem` into a `taskItem`.
 *
 *      IMPORTANT: We must convert children FIRST (listItem → taskItem), then
 *      the parent (bulletList → taskList). If we change the parent first,
 *      ProseMirror's schema validator checks whether the new parent
 *      (taskList, content: `taskItem+`) can contain the old children
 *      (listItem) — it can't, so the step is silently rejected and the
 *      document is left in a broken state.
 */

import { InputRule, Extension } from '@tiptap/core';
import { findWrapping } from '@tiptap/pm/transform';

/**
 * Matches `[] `, `[ ] `, `[x] `, or `[X] ` at the start of a line.
 *
 * Capture group 1: the inner character (`undefined`, ` `, `x`, or `X`).
 * If it's `x` or `X`, the task item should be checked.
 */
const taskListMarkdownRegex = /^\s*\[( |x|X)?\]\s$/;

export interface TaskListMarkdownOptions {
  /** The taskList node type name to wrap with. @default 'taskList' */
  typeName: string;
}

export const TaskListMarkdown = Extension.create<TaskListMarkdownOptions>({
  name: 'taskListMarkdown',

  addOptions() {
    return {
      typeName: 'taskList',
    };
  },

  addInputRules(): InputRule[] {
    const editor = this.editor;
    const schema = editor.schema;
    const taskListType = schema.nodes[this.options.typeName];

    if (!taskListType) {
      return [];
    }

    return [
      new InputRule({
        find: taskListMarkdownRegex,
        handler: ({ state, range, match }) => {
          // 1. Delete the matched markdown text (e.g. "[] " or "[x] ").
          const tr = state.tr.delete(range.from, range.to);

          // 2. Resolve the position in the post-delete document.
          const $start = tr.doc.resolve(range.from);

          // Determine checked state from the match.
          const innerChar = match[1];
          const isChecked = innerChar === 'x' || innerChar === 'X';

          // 3. Check if we're inside a listItem (from bulletList or orderedList).
          //    This happens when the user typed `- ` first (which triggered
          //    BulletList's input rule), then typed `[ ] ` inside the listItem.
          let listItemDepth = -1;
          for (let depth = $start.depth; depth > 0; depth--) {
            if ($start.node(depth).type.name === 'listItem') {
              listItemDepth = depth;
              break;
            }
          }

          if (listItemDepth > 0) {
            // ── Rule 2: Convert bulletList → taskList ──

            const listDepth = listItemDepth - 1;
            const listNode = $start.node(listDepth);

            if (!listNode || listNode.type.name !== 'bulletList') {
              return null;
            }

            const taskItemType = schema.nodes['taskItem'];
            if (!taskItemType) {
              return null;
            }

            const listPos = $start.before(listDepth);

            // CRITICAL: Convert children (listItem → taskItem) FIRST.
            // If we change the parent to taskList first, its content model
            // requires taskItem+ children, but the children are still
            // listItem nodes, so ProseMirror rejects the step.
            const childPositions: { pos: number; checked: boolean }[] = [];

            listNode.forEach((child, offset) => {
              const childPos = listPos + 1 + offset;
              const childEnd = childPos + child.nodeSize;

              // Determine if this is the item the cursor is in.
              const cursorPos = range.from;
              const isCurrentItem =
                cursorPos >= childPos && cursorPos <= childEnd;

              childPositions.push({
                pos: childPos,
                checked: isChecked && isCurrentItem,
              });
            });

            // Apply child conversions first.
            for (const { pos, checked } of childPositions) {
              tr.setNodeMarkup(pos, taskItemType, { checked });
            }

            // Then convert the parent list type.
            tr.setNodeMarkup(listPos, taskListType, {});

            return;
          }

          // ── Rule 1: Direct wrap (paragraph → taskList > taskItem) ──
          const blockRange = $start.blockRange();

          if (!blockRange) {
            return null;
          }

          const wrapping = findWrapping(blockRange, taskListType, {});

          if (!wrapping) {
            return null;
          }

          tr.wrap(blockRange, wrapping);

          if (isChecked) {
            const mappedPos = tr.mapping.map(range.from);
            const $mapped = tr.doc.resolve(mappedPos);

            for (let depth = $mapped.depth; depth > 0; depth--) {
              const node = $mapped.node(depth);
              if (node.type.name === 'taskItem') {
                tr.setNodeMarkup($mapped.before(depth), undefined, {
                  checked: true,
                });
                break;
              }
            }
          }
        },
      }),
    ];
  },
});
