/**
 * Data adapter — bidirectional conversion between our `Block[]` format
 * (Notion-like rich-text segments) and TipTap's `JSONContent[]` format
 * (ProseMirror-based document JSON).
 *
 * This is the single source of truth for format translation. Neither the
 * editor nor the store ever needs to know about the other's internal
 * representation.
 *
 * Mapping summary:
 *
 *   OUR BLOCK TYPES              →   TIPTAP NODE TYPES
 *   ─────────────────────────────────────────────────────────
 *   text                         →   paragraph
 *   heading-1/2/3/4/5/6                →   heading (attrs.level = 1/2/3/4/5/6)
 *   quote                        →   blockquote
 *   code                         →   codeBlock
 *   image                        →   image
 *   file                         →   fileBlock
 *   table                        →   table
 *   bullet-list                  →   bulletList
 *   ordered-list                 →   orderedList
 *   todo-list                    →   taskList
 *   divider                      →   horizontalRule
 *   collapsible                  →   collapsible
 *   diagram                      →   diagramBlock
 *
 *   OUR RICHTEXT ANNOTATIONS     →   TIPTAP MARKS
 *   ─────────────────────────────────────────────────────────
 *   bold                         →   bold
 *   italic                       →   italic
 *   underline                    →   underline
 *   strikethrough                →   strike
 *   code                         →   code
 *   color (≠ 'default')          →   textStyle (attrs.color)
 *   href                         →   link (attrs.href)
 *
 * Module structure:
 *   richText.ts  — RichText[] ↔ TipTap inline JSONContent[]
 *   blocks.ts    — Block ↔ TipTap node JSONContent (main conversion)
 *   table.ts     — TableData ↔ TipTap table JSON
 *   list.ts      — ListItemData[] ↔ TipTap bulletList/orderedList JSON
 *   todo.ts      — TodoItemData[] ↔ TipTap taskList JSON
 */

// RichText ↔ TipTap inline conversion
export { richTextToTiptapInline, tiptapInlineToRichText } from './richText';

// Block ↔ TipTap node conversion (main public API)
export {
  ourBlockToTiptapJSON,
  ourBlocksToTiptapJSON,
  tiptapJSONToOurBlock,
  tiptapJSONToOurBlocks,
  stripTrailingEmptyParagraph,
} from './blocks';

// Table conversion (exported for advanced use; typically accessed via blocks.ts)
export { tableDataToTiptap, tiptapToTableData } from './table';

// List conversion (exported for advanced use)
export {
  listItemToTiptap,
  tiptapToListItems,
  legacyFlatListToItems,
  listItemsToFlat,
} from './list';

// Todo conversion (exported for advanced use)
export { todoItemToTiptap, tiptapToTodoItems } from './todo';