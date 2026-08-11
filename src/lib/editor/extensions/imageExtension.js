import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ImageView from "../../../components/editor/nodes/ImageView";
const ImageExtension = Image.extend({
  // Allow GapCursor so users can click in the margin between two adjacent
  // image blocks to place a cursor and type to insert a paragraph.
  // The gap-cursor visual (potential "hollow dot") is handled by CSS
  // (.ProseMirror-gapcursor is display:none unless the editor is focused).
  allowGapCursor: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: ""
      },
      alt: {
        default: null
      },
      title: {
        default: null
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute("width");
          return width ? Number(width) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        }
      },
      widthPct: {
        default: null,
        parseHTML: (element) => {
          const v = element.getAttribute("data-width-pct");
          return v ? Number(v) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.widthPct == null) return {};
          return { "data-width-pct": attributes.widthPct };
        }
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = element.getAttribute("height");
          return height ? Number(height) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        }
      },
      heightPct: {
        default: null,
        parseHTML: (element) => {
          const v = element.getAttribute("data-height-pct");
          return v ? Number(v) : null;
        },
        renderHTML: (attributes) => {
          if (attributes.heightPct == null) return {};
          return { "data-height-pct": attributes.heightPct };
        }
      },
      align: {
        default: "center",
        parseHTML: (element) => {
          const align = element.getAttribute("data-align");
          if (align === "left" || align === "center") return align;
          return "center";
        },
        renderHTML: (attributes) => {
          if (!attributes.align) return {};
          return { "data-align": attributes.align };
        }
      }
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  }
});
var imageExtension_default = ImageExtension;
export {
  ImageExtension,
  imageExtension_default as default
};
