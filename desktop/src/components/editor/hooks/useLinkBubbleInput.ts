/**
 * useLinkBubbleInput — controller for the inline-link URL input row inside
 * FormatBubbleMenu (see LinkBubbleInput.tsx for the presentational side).
 *
 * Owns the input state (mode/anchor/prefill), the invalid-URL flag, and the
 * editor mutations behind confirm/remove/cancel:
 *   - range mode  -> extendMarkRange('link').setLink/unsetLink
 *   - insert mode -> insertContentAt of the URL as linked text, selected
 *
 * Refs are written EAGERLY (before the React state commit) so the bubble
 * plugin's synchronous shouldShow evaluation — which can run between a
 * ProseMirror dispatch and React's re-render — always sees the current
 * input state and cannot hide a freshly opened input.
 */

import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  findLinkHrefInRange,
  hideBubbleMenu,
  isAllowedLinkHref,
  normalizeLinkUrl,
} from "../../../lib/editor/inlineLink";
import type { LinkInputMode } from "../LinkBubbleInput";

export interface LinkInputState {
  mode: LinkInputMode;
  /** Caret position (selection.head) the input is pinned to. */
  anchor: number;
  /** Existing href to prefill ('' when creating). */
  initialHref: string;
}

export function useLinkBubbleInput(
  editor: Editor,
  closeHeadingDropdown: () => void,
) {
  const [linkInput, setLinkInput] = useState<LinkInputState | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const linkInputRef = useRef<LinkInputState | null>(null);
  const cancelLinkInputRef = useRef<() => void>(() => {});
  // Wrapper of the URL input row — its parentElement is the portaled
  // `.bubble-menu` element used for the outside-mousedown check.
  const linkRowRef = useRef<HTMLDivElement>(null);
  linkInputRef.current = linkInput;

  const clearLinkInput = useCallback(() => {
    linkInputRef.current = null;
    setLinkInput(null);
    setLinkInvalid(false);
  }, []);

  const setLinkInputEager = useCallback((next: LinkInputState) => {
    linkInputRef.current = next;
    setLinkInput(next);
    setLinkInvalid(false);
  }, []);

  // Open from the button row: prefill with the first link href under the
  // selection (edit mode) or start empty (create mode).
  const openLinkInput = useCallback(() => {
    closeHeadingDropdown();
    setLinkInputEager({
      mode: "range",
      anchor: editor.state.selection.head,
      initialHref: findLinkHrefInRange(editor.state) ?? "",
    });
  }, [editor, closeHeadingDropdown, setLinkInputEager]);

  // Open at an empty caret, caused by the inline-link slash command
  // (FormatBubbleMenu's handleShow consumes the pending request).
  const openInsertInput = useCallback(
    (anchor: number) => {
      setLinkInputEager({ mode: "insert", anchor, initialHref: "" });
    },
    [setLinkInputEager],
  );

  // Apply the URL from the input. Empty input cancels (removal has its own
  // dedicated Unlink button — no accidental removals); a disallowed scheme
  // flags the input invalid and leaves the editor untouched.
  const applyLink = useCallback(
    (raw: string) => {
      const input = linkInputRef.current;
      if (!input) return;
      const href = normalizeLinkUrl(raw);
      if (href === null) {
        cancelLinkInputRef.current();
        return;
      }
      if (!isAllowedLinkHref(href)) {
        setLinkInvalid(true);
        return;
      }
      if (input.mode === "range") {
        editor.chain().extendMarkRange("link").setLink({ href }).run();
      } else {
        // Insert mode: the URL itself becomes the linked text (Notion
        // semantics), inserted and selected at the pinned caret. PM text
        // positions count UTF-16 code units, same as JS string indices.
        const pos = input.anchor;
        editor
          .chain()
          .insertContentAt(pos, [
            {
              type: "text",
              text: href,
              marks: [{ type: "link", attrs: { href } }],
            },
          ])
          .setTextSelection({ from: pos, to: pos + href.length })
          .run();
      }
      clearLinkInput();
      // Raw DOM focus (NOT chain().focus()) — same taskItem cursor-jump
      // avoidance as the mark toggles; focus must move from the input back
      // to the editor.
      editor.view.focus();
    },
    [editor, clearLinkInput],
  );

  const removeLink = useCallback(() => {
    editor.chain().extendMarkRange("link").unsetLink().run();
    clearLinkInput();
    editor.view.focus();
  }, [editor, clearLinkInput]);

  const cancelLinkInput = useCallback(() => {
    const mode = linkInputRef.current?.mode;
    clearLinkInput();
    if (mode === "insert") {
      // Insert mode has no selection to keep the bubble alive — the meta-hide
      // protocol is the only deterministic hide (no-op focus transactions are
      // ignored by the plugin's debounced updater).
      hideBubbleMenu(editor);
    } else {
      // Range mode: selection is intact; refocusing returns to the button row.
      editor.view.focus();
    }
  }, [editor, clearLinkInput]);

  // The capture-phase keydown listener is registered once per menuVisible
  // period; route it to the latest cancel via a ref.
  cancelLinkInputRef.current = cancelLinkInput;

  return {
    linkInput,
    linkInvalid,
    linkInputRef,
    linkRowRef,
    cancelLinkInputRef,
    openLinkInput,
    openInsertInput,
    applyLink,
    removeLink,
    cancelLinkInput,
    clearLinkInput,
  };
}
