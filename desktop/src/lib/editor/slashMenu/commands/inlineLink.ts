import type { SlashCommandItem } from "../types";
import { requestInlineLinkInput } from "../../inlineLink";

/** Inline Link — turn text into a clickable hyperlink (as opposed to the block link card). */
export const inlineLinkCommand: SlashCommandItem = {
  title: "Inline Link",
  description: "Insert a clickable text link",
  icon: "URL",
  aliases: [
    "inline link",
    "text link",
    "href",
    "anchor",
    "行内链接",
    "文本链接",
    "超链接",
    "文字链接",
  ],
  command: ({ editor, range }) => {
    // Signal BEFORE mutating: the deleteRange transaction leaves an empty
    // selection, which re-evaluates the bubble menu's shouldShow immediately
    // (empty selections bypass its debounce), and shouldShow peeks this slot.
    requestInlineLinkInput(editor);
    editor.chain().focus().deleteRange(range).run();
  },
};
