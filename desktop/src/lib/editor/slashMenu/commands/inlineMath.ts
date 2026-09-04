import type { SlashCommandItem } from "../types";

/** Inline Formula - insert an inline LaTeX math formula ($...$). */
export const inlineMathCommand: SlashCommandItem = {
  title: "Inline Formula",
  description: "Insert an inline LaTeX formula",
  icon: "$",
  aliases: [
    "inline formula",
    "inline math",
    "latex inline",
    "行内公式",
    "内联公式",
    "行内数学",
  ],
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).insertInlineMath().run(),
};
