/**
 * InlineMathExtension - inline atom node for LaTeX formulas rendered with
 * KaTeX (inline mode), in contrast to the block-level mathBlock ($$...$$).
 *
 * Storage: the JStudio rich-text segment model carries it as
 * `{ text: <latex>, annotations: { inlineMath: true } }` — the segment text
 * IS the LaTeX source (see tiptapAdapter/richText.ts). This keeps the
 * Block[] contract a pure extension of the existing annotation set, which
 * the miniprogram reader can degrade gracefully on (monospace latex text).
 *
 * Markdown integration (via @tiptap/markdown, inline-level tokenizer):
 *   - Parsing:  `$...$` inline spans become inlineMath nodes. The match
 *     rejects `$$` (block math), `$ 5` (space after opener) and `$10$`
 *     closing-adjacent digits (currency heuristic, same family as KaTeX's
 *     auto-render delimiters).
 *   - Rendering: the node serialises back to `$...$`.
 *
 * Keyboard: typing `$x$` creates the node via an input rule. The slash
 * menu ("Inline Formula") inserts an empty node and selects it; the
 * NodeView auto-enters edit mode for empty latex (mirrors MathBlockView).
 */

import { Node, InputRule, type JSONContent } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import InlineMathView from "../../../components/editor/nodes/InlineMathView";

/**
 * One regex source for everything that recognises inline math in text:
 * the input rule (anchored at the caret by the caller) and the markdown
 * inline tokenizer. Guards:
 *   - opening `$` must not be escaped, followed by whitespace or `$$`;
 *   - closing `$` must not sit right after whitespace (kills "$5 和 $10"
 *     style currency pairs — leftmost match fails, the real formula later
 *     in the string wins), nor be followed by `$$` or a digit.
 */
export const INLINE_MATH_SOURCE_RE =
  /(?<!\\)\$(?!\s|\$)((?:\\.|[^$\n])+?)(?<!\s)\$(?!\$|\d)/;

/** Anchored variant for the typing input rule (matches at the caret). */
export const INLINE_MATH_INPUT_RULE_RE = new RegExp(
  String.raw`(?<!\\)\$(?!\s|\$)((?:\\.|[^$\n])+?)(?<!\s)\$(?!\$|\d)$`,
);

export interface InlineMathNodeAttributes {
  latex: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    inlineMath: {
      /** Insert an inline math formula at the current selection. */
      insertInlineMath: (
        attrs?: Partial<InlineMathNodeAttributes>,
      ) => ReturnType;
    };
  }
}

export const InlineMathExtension = Node.create({
  name: "inlineMath",

  group: "inline",

  inline: true,

  atom: true,

  // Keep the node out of text-mark contexts: an inline formula carries no
  // marks and must not be merged with adjacent text.
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-latex") || "",
        renderHTML: (attrs) => {
          if (!attrs.latex) return {};
          return { "data-latex": attrs.latex };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", { "data-type": "inline-math", ...HTMLAttributes }];
  },

  /* ------------------------------------------------------------------ */
  /* Markdown integration (inline-level, via @tiptap/markdown)          */
  /* ------------------------------------------------------------------ */

  markdownTokenizer: {
    name: "inlineMath",
    level: "inline" as const,
    start(src: string) {
      return src.indexOf("$");
    },
    tokenize(src: string) {
      const match = INLINE_MATH_SOURCE_RE.exec(src);
      if (match && match.index === 0) {
        return {
          type: "inlineMath",
          raw: match[0],
          text: match[1],
          tokens: [],
        };
      }
      return undefined;
    },
  },

  parseMarkdown(token): JSONContent {
    const latex = (token.text || "").trim();
    return {
      type: "inlineMath",
      attrs: { latex },
    };
  },

  renderMarkdown(node: JSONContent) {
    const latex = (node.attrs?.latex ?? "").trim();
    return `$${latex}$`;
  },

  /* ------------------------------------------------------------------ */
  /* Commands & NodeView                                                */
  /* ------------------------------------------------------------------ */

  addCommands() {
    return {
      insertInlineMath:
        (attrs) =>
        ({ chain }) => {
          return (
            chain()
              .insertContent({
                type: "inlineMath",
                attrs: { latex: "", ...attrs },
              })
              // Select the inserted atom so the NodeView sees the selection
              // and auto-enters edit mode for the empty latex.
              .selectNodeBackward()
              .run()
          );
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView);
  },

  /* ------------------------------------------------------------------ */
  /* Input rule - typing `$x$` creates an inline math node              */
  /* ------------------------------------------------------------------ */

  addInputRules() {
    return [
      new InputRule({
        find: INLINE_MATH_INPUT_RULE_RE,
        handler: ({ state, range, match }) => {
          const latex = (match[1] || "").trim();
          if (!latex) return;
          const { tr } = state;
          tr.replaceWith(
            range.from,
            range.to,
            state.schema.nodes.inlineMath.create({ latex }),
          );
        },
      }),
    ];
  },
});

export default InlineMathExtension;
