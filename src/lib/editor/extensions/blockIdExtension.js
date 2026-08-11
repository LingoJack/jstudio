import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Fragment, Slice } from "@tiptap/pm/model";
function regenerateBlockIds(node) {
  let content = node.content;
  if (content.size > 0) {
    const children = [];
    content.forEach((child) => children.push(regenerateBlockIds(child)));
    content = Fragment.from(children);
  }
  const hasId = node.attrs && "id" in node.attrs && node.attrs.id != null;
  if (hasId) {
    return node.type.create(
      { ...node.attrs, id: crypto.randomUUID() },
      content,
      node.marks
    );
  }
  if (content !== node.content) {
    return node.copy(content);
  }
  return node;
}
const BlockIdExtension = Extension.create({
  name: "blockId",
  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "blockquote",
          "codeBlock",
          "image",
          "fileBlock",
          "linkBlock",
          "diagramBlock",
          "mathBlock",
          "table",
          "bulletList",
          "orderedList",
          "taskList",
          "horizontalRule",
          "collapsible"
        ],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) => {
              if (!attributes.id) return {};
              return { "data-block-id": attributes.id };
            }
          }
        }
      }
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockId"),
        // Backfill a fresh `id` on any block-level node that is missing one.
        //
        // Nodes created through the editor (slash-menu headings, Enter-created
        // paragraphs, drag-inserted blocks, …) start with `id: null` because
        // the `id` attribute's default is null and no creation path sets it.
        // The store sync (`tiptapJSONToOurBlock`) then generates a NEW uuid
        // for such nodes, so the editor's ProseMirror node (null id -> no
        // `data-block-id` in the DOM) and the store block (new uuid) drift
        // apart. The outline - which merges store + editor headings and looks
        // up the DOM by `data-block-id` - can no longer find the element, so
        // clicking the heading does nothing.
        //
        // Assigning the id HERE (inside the editor, the moment the node is
        // created) keeps the editor doc, the rendered DOM and the store all
        // referencing the SAME id, so outline jump-to-heading works for every
        // heading regardless of how it was created.
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr2) => tr2.docChanged)) return null;
          const tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (!("id" in node.attrs)) return true;
            if (node.attrs.id) return true;
            tr.setNodeMarkup(
              pos,
              void 0,
              { ...node.attrs, id: crypto.randomUUID() }
            );
            modified = true;
            return true;
          });
          if (!modified) return null;
          tr.setMeta("addToHistory", false);
          return tr;
        },
        props: {
          // When content is copied and pasted inside the same editor,
          // ProseMirror preserves every node attribute - including our
          // block id.  That leaves two DOM elements sharing the same
          // `data-block-id`, so the outline's querySelector always
          // resolves to the *first* match (the original/source node)
          // and clicking the pasted heading jumps back to the source.
          //
          // Regenerating ids on the pasted slice fixes this while
          // leaving drag-and-drop *moves* untouched (moves do not go
          // through transformPasted).
          transformPasted(slice) {
            const children = [];
            slice.content.forEach(
              (child) => children.push(regenerateBlockIds(child))
            );
            return new Slice(Fragment.from(children), slice.openStart, slice.openEnd);
          }
        }
      })
    ];
  }
});
export {
  BlockIdExtension
};
