import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import CollapsibleView from "../../../components/editor/nodes/CollapsibleView";
import { blockBehaviorRegistry } from "../blockBehaviorRegistry";
const CollapsibleExtension = Node.create({
  name: "collapsible",
  group: "block",
  /** Allow one or more block-level children inside the body. */
  content: "block+",
  /**
   * Isolate the node so that backspace at the boundary of the collapsible
   * does not merge its first/last child into the surrounding document.
   */
  isolating: true,
  /** Keep the node type when its content is pasted elsewhere. */
  defining: true,
  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open") !== "false",
        renderHTML: (attrs) => ({ "data-open": String(attrs.open ?? true) })
      },
      summary: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-summary") || "",
        renderHTML: (attrs) => ({ "data-summary": attrs.summary ?? "" })
      }
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="collapsible"]'
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { "data-type": "collapsible", ...HTMLAttributes },
      0
    ];
  },
  addCommands() {
    return {
      setCollapsible: (attrs) => ({ commands }) => {
        return commands.insertContent([
          {
            type: "collapsible",
            attrs: {
              open: true,
              summary: "",
              ...attrs
            },
            content: [{ type: "paragraph" }]
          },
          {
            type: "paragraph"
          }
        ]);
      }
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleView);
  },
  addKeyboardShortcuts() {
    const nodeName = this.name;
    return {
      /**
       * Escape - exit the collapsible block, placing the cursor after it.
       *
       * Because the collapsible is `isolating`, the cursor cannot naturally
       * rest at the boundary between two adjacent collapsibles (or between a
       * collapsible and a code block). When the user presses Escape, we move
       * the cursor to the position after the collapsible. If that position is:
       *   - End of document, OR
       *   - Immediately before another isolating block (e.g. another
       *     collapsible or a code block)
       * we insert an empty paragraph there first, so the cursor has a valid
       * text selection to land in. This directly solves the "two adjacent
       * collapsibles with no way to insert content between them" problem.
       *
       * Mirrors the CodeBlock extension's Escape behavior.
       */
      Escape: () => {
        const { editor } = this;
        const { state } = editor;
        const { selection, doc } = state;
        let after = null;
        if (selection instanceof NodeSelection && selection.node.type.name === nodeName) {
          after = selection.to;
        } else {
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === nodeName) {
              after = $from.after(d);
              break;
            }
          }
        }
        if (after == null) return false;
        let needsParagraph = after >= doc.content.size;
        if (!needsParagraph) {
          const nextNode = doc.resolve(after).nodeAfter;
          if (nextNode && nextNode.type.spec.isolating) {
            needsParagraph = true;
          }
        }
        if (needsParagraph) {
          return editor.chain().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).focus().run();
        }
        return editor.chain().setTextSelection(after).focus().run();
      },
      /**
       * ArrowDown - at the end of the last child, if the collapsible is the
       * last block in the document, insert an empty paragraph below for the
       * cursor to land in.
       *
       * Otherwise, return false and let ProseMirror's default ArrowDown
       * move the cursor to the next block naturally.
       *
       * Mirrors the CodeBlock extension's ArrowDown behavior.
       */
      ArrowDown: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const $head = selection.$head;
        let collapsibleDepth = -1;
        for (let d = $head.depth; d >= 1; d--) {
          if ($head.node(d).type.name === nodeName) {
            collapsibleDepth = d;
            break;
          }
        }
        if (collapsibleDepth < 0) return false;
        const collapsibleNode = $head.node(collapsibleDepth);
        const lastChildIndex = collapsibleNode.childCount - 1;
        if ($head.index(collapsibleDepth) !== lastChildIndex) return false;
        const atBottom = view.endOfTextblock("down", state) || $head.pos === $head.end();
        if (!atBottom) return false;
        const after = $head.after(collapsibleDepth);
        if (after < state.doc.content.size) return false;
        const tr = state.tr;
        const para = state.schema.nodes.paragraph.create();
        tr.insert(after, para);
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        editor.view.dispatch(tr);
        return true;
      }
    };
  }
});
blockBehaviorRegistry.register({
  nodeType: "collapsible",
  canDelete: (editor, $head) => {
    const parent = $head.parent;
    if (parent.type.name !== "paragraph" || parent.content.size !== 0) return false;
    for (let d = $head.depth; d >= 1; d--) {
      const ancestor = $head.node(d);
      if (ancestor.type.name === "collapsible") {
        const summary = ancestor.attrs.summary ?? "";
        const hasOnlyOneEmptyChild = ancestor.childCount === 1 && ancestor.firstChild?.type.name === "paragraph" && ancestor.firstChild.content.size === 0;
        return hasOnlyOneEmptyChild && summary.trim() === "";
      }
    }
    return false;
  },
  delete: (editor, $head) => {
    for (let d = $head.depth; d >= 1; d--) {
      const ancestor = $head.node(d);
      if (ancestor.type.name === "collapsible") {
        const collapsiblePos = $head.before(d);
        editor.chain().focus().setNodeSelection(collapsiblePos).deleteSelection().run();
        return true;
      }
    }
    return false;
  }
});
var collapsibleExtension_default = CollapsibleExtension;
export {
  CollapsibleExtension,
  collapsibleExtension_default as default
};
