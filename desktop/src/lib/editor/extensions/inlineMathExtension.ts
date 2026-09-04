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

import {
  Node,
  InputRule,
  nodePasteRule,
  combineTransactionSteps,
  findChildrenInRange,
  getChangedRanges,
  type JSONContent,
} from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProsemirrorNode, NodeType } from "@tiptap/pm/model";
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

/** Global variant for the paste rule (multiple spans per paste). */
export const INLINE_MATH_PASTE_RULE_RE = new RegExp(
  INLINE_MATH_SOURCE_RE.source,
  "g",
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
      /**
       * Toggle inline math on the current selection: wrap the selected
       * text as a formula (empty selection inserts an empty one), or —
       * when the selection covers an existing formula — unwrap it back
       * to its LaTeX source as plain text.
       */
      toggleInlineMath: () => ReturnType;
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
      toggleInlineMath:
        () =>
        ({ state, chain }) => {
          const { from, to, empty } = state.selection;

          // Unwrap: when the selection covers an existing formula, restore
          // its LaTeX source as plain text (bare source — toggling again
          // re-wraps it without double-dollar nesting).
          const found: { pos: number; latex: string }[] = [];
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (found.length > 0) return false;
            if (node.type.name === "inlineMath") {
              found.push({
                pos,
                latex:
                  typeof node.attrs.latex === "string" ? node.attrs.latex : "",
              });
              return false;
            }
            return true;
          });
          if (found.length > 0) {
            const { pos, latex } = found[0];
            return chain()
              .insertContentAt(pos, { type: "text", text: latex })
              .setTextSelection(pos + latex.length)
              .run();
          }

          // Wrap: the selected text becomes the LaTeX source. Empty
          // selection inserts an empty formula and selects it (the NodeView
          // auto-enters edit mode).
          const latex = empty
            ? ""
            : state.doc.textBetween(from, to, "\n", "\ufffc").trim();
          if (empty) {
            return chain().insertInlineMath().run();
          }
          if (!latex) return false;
          return chain()
            .insertContentAt(
              { from, to },
              {
                type: "inlineMath",
                attrs: { latex },
              },
            )
            .run();
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

  /* ------------------------------------------------------------------ */
  /* Paste rule - pasted text containing `$x$` converts to nodes        */
  /* ------------------------------------------------------------------ */
  /* Input rules only fire while TYPING; pasted plain text (a lone formula
     line, terminal output, another note) never reaches them, and
     PasteMarkdown deliberately parses only BLOCK-level markdown, so a
     single-line `$A \cup B$` would land as literal text. The node paste
     rule converts every math span in the pasted text.                        */

  addPasteRules() {
    return [
      nodePasteRule({
        find: INLINE_MATH_PASTE_RULE_RE,
        type: this.type,
        getAttributes: (match) => ({
          latex: (match[1] || "").trim(),
        }),
      }),
    ];
  },

  /* ------------------------------------------------------------------ */
  /* Auto-convert fallback (appendTransaction)                          */
  /* ------------------------------------------------------------------ */
  /* Safety net for the paths the two rules above cannot cover:
     - IME composition typing: ProseMirror skips input rules while
       composing, and Chinese IMEs commonly commit the whole `$...$` run
       in one composition flush (same family of gaps that motivated
       customLinkAutolink).
     - Text inserted by paths that bypass both rule plugins.
     Scans only the changed ranges of each dispatch; atom neighbours are
     mapped per-character so positions stay exact; matches inside inline
     code marks are skipped.                                                */

  addProseMirrorPlugins() {
    return [inlineMathAutoConvert({ type: this.type })];
  },
});

export default InlineMathExtension;

/* ---------------------------------------------------------------------- */
/* Auto-convert plugin                                                    */
/* ---------------------------------------------------------------------- */

const INLINE_MATH_AUTO_CONVERT_KEY = new PluginKey("inlineMathAutoConvert");

/**
 * Character map for one textblock: doc position of every character, with
 * atom children (hardBreak, existing inlineMath nodes, …) mapped to -1 and
 * represented in the scanned string by a non-matching placeholder, so
 * regex indices translate into exact doc positions and matches spanning
 * atoms are rejected.
 */
function buildCharMap(node: ProsemirrorNode, nodeStart: number) {
  let text = "";
  const positions: number[] = [];
  node.forEach((child, offset) => {
    if (child.isText && typeof child.text === "string") {
      for (let i = 0; i < child.text.length; i += 1) {
        positions.push(nodeStart + 1 + offset + i);
        text += child.text[i];
      }
    } else {
      positions.push(-1);
      text += "\ufffc";
    }
  });
  return { text, positions };
}

function inlineMathAutoConvert(options: { type: NodeType }): Plugin {
  return new Plugin({
    key: INLINE_MATH_AUTO_CONVERT_KEY,
    appendTransaction: (transactions, oldState, newState) => {
      const docChanges =
        transactions.some((tr) => tr.docChanged) &&
        !oldState.doc.eq(newState.doc);
      if (!docChanges) return null;

      const codeMarkType = newState.schema.marks.code;
      const { tr } = newState;
      let converted = false;

      const transform = combineTransactionSteps(oldState.doc, [
        ...transactions,
      ]);
      const changes = getChangedRanges(transform);
      for (const { newRange } of changes) {
        const textblocks = findChildrenInRange(
          newState.doc,
          newRange,
          (n) => n.isTextblock && n.type.name !== "codeBlock",
        );
        for (const { node, pos } of textblocks) {
          const { text, positions } = buildCharMap(node, pos);
          const regex = new RegExp(INLINE_MATH_SOURCE_RE.source, "g");
          const replacements = [];
          let match: RegExpExecArray | null;
          while ((match = regex.exec(text)) !== null) {
            const latex = (match[1] || "").trim();
            if (!latex) continue;
            const first = positions[match.index];
            const last = positions[match.index + match[0].length - 1];
            // Match spans an atom (hardBreak / existing node) — skip.
            if (first < 0 || last < 0) continue;
            if (
              codeMarkType &&
              newState.doc.rangeHasMark(first, last, codeMarkType)
            ) {
              continue;
            }
            replacements.push({ from: first, to: last + 1, latex });
          }
          // Apply right-to-left so earlier doc positions stay valid.
          for (const r of replacements.sort((a, b) => b.from - a.from)) {
            tr.replaceWith(
              r.from,
              r.to,
              options.type.create({ latex: r.latex }),
            );
            converted = true;
          }
        }
      }
      return converted ? tr : null;
    },
  });
}
