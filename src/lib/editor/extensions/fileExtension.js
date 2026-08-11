import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import FileView from "../../../components/editor/nodes/FileView";
const FileExtension = Node.create({
  name: "fileBlock",
  group: "block",
  atom: true,
  // Allow GapCursor so users can click in the margin between two adjacent
  // file blocks to place a cursor and type to insert a paragraph.
  allowGapCursor: true,
  draggable: false,
  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-src") || "",
        renderHTML: (attrs) => {
          if (!attrs.src) return {};
          return { "data-src": attrs.src };
        }
      },
      fileName: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-file-name") || "",
        renderHTML: (attrs) => {
          if (!attrs.fileName) return {};
          return { "data-file-name": attrs.fileName };
        }
      },
      fileSize: {
        default: 0,
        parseHTML: (el) => {
          const s = el.getAttribute("data-file-size");
          return s ? Number(s) : 0;
        },
        renderHTML: (attrs) => {
          if (!attrs.fileSize) return {};
          return { "data-file-size": attrs.fileSize };
        }
      },
      fileType: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-file-type") || "",
        renderHTML: (attrs) => {
          if (!attrs.fileType) return {};
          return { "data-file-type": attrs.fileType };
        }
      },
      displayMode: {
        default: "card",
        parseHTML: (el) => {
          const m = el.getAttribute("data-display-mode");
          return m === "preview" ? "preview" : "card";
        },
        renderHTML: (attrs) => ({
          "data-display-mode": attrs.displayMode ?? "card"
        })
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
      }
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-block"]'
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { "data-type": "file-block", ...HTMLAttributes }
    ];
  },
  addCommands() {
    return {
      setFile: (attrs) => ({ commands }) => {
        return commands.insertContent([
          {
            type: "fileBlock",
            attrs: {
              src: "",
              fileName: "",
              fileSize: 0,
              fileType: "",
              displayMode: "card",
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
    return ReactNodeViewRenderer(FileView);
  }
});
var fileExtension_default = FileExtension;
export {
  FileExtension,
  fileExtension_default as default
};
