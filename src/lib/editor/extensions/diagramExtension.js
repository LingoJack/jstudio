import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import DiagramBlockView from "../../../components/editor/nodes/DiagramBlockView";
const DiagramExtension = Node.create({
  name: "diagramBlock",
  group: "block",
  atom: true,
  // Allow GapCursor so users can click in the margin between two adjacent
  // diagram blocks to place a cursor and type to insert a paragraph.
  allowGapCursor: true,
  draggable: false,
  addAttributes() {
    return {
      snapshot: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-snapshot") || "",
        renderHTML: (attrs) => {
          if (!attrs.snapshot) return {};
          return { "data-snapshot": attrs.snapshot };
        }
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute("data-width");
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { "data-width": attrs.width };
        }
      },
      widthPct: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-width-pct");
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => {
          if (attrs.widthPct == null) return {};
          return { "data-width-pct": attrs.widthPct };
        }
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const h = el.getAttribute("data-height");
          return h ? Number(h) : null;
        },
        renderHTML: (attrs) => {
          if (!attrs.height) return {};
          return { "data-height": attrs.height };
        }
      },
      heightPct: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-height-pct");
          return v ? Number(v) : null;
        },
        renderHTML: (attrs) => {
          if (attrs.heightPct == null) return {};
          return { "data-height-pct": attrs.heightPct };
        }
      },
      align: {
        default: "center",
        parseHTML: (el) => {
          const align = el.getAttribute("data-align");
          if (align === "left" || align === "center") return align;
          return "center";
        },
        renderHTML: (attrs) => {
          if (!attrs.align) return {};
          return { "data-align": attrs.align };
        }
      },
      mindmapScheme: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-mindmap-scheme");
          if (v === "neon" || v === "mono") return v;
          return null;
        },
        renderHTML: (attrs) => {
          if (!attrs.mindmapScheme) return {};
          return { "data-mindmap-scheme": attrs.mindmapScheme };
        }
      }
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="diagram-block"]'
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { "data-type": "diagram-block", ...HTMLAttributes }
    ];
  },
  addCommands() {
    return {
      setDiagram: (attrs) => ({ commands }) => {
        return commands.insertContent([
          {
            type: "diagramBlock",
            attrs: {
              snapshot: "",
              width: null,
              height: null,
              align: "center",
              ...attrs
            }
          },
          {
            type: "paragraph"
          }
        ]);
      }
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(DiagramBlockView);
  }
});
var diagramExtension_default = DiagramExtension;
export {
  DiagramExtension,
  diagramExtension_default as default
};
