import { test } from "node:test";
import assert from "node:assert/strict";
import type { Editor } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  findLinkHrefInRange,
  isAllowedLinkHref,
  normalizeLinkUrl,
  peekInlineLinkRequest,
  requestInlineLinkInput,
  takeInlineLinkRequest,
} from "./inlineLink";

// ── normalizeLinkUrl ──

test("normalizeLinkUrl trims and prefixes https:// when no scheme", () => {
  assert.equal(normalizeLinkUrl("  github.com/x  "), "https://github.com/x");
});

test("normalizeLinkUrl keeps existing schemes as-is", () => {
  assert.equal(normalizeLinkUrl("https://a.b"), "https://a.b");
  assert.equal(normalizeLinkUrl("http://a.b"), "http://a.b");
  assert.equal(normalizeLinkUrl("mailto:x@y.z"), "mailto:x@y.z");
});

test("normalizeLinkUrl returns null for empty input", () => {
  assert.equal(normalizeLinkUrl(""), null);
  assert.equal(normalizeLinkUrl("   "), null);
});

// ── isAllowedLinkHref ──

test("isAllowedLinkHref accepts tiptap allowlist schemes", () => {
  assert.equal(isAllowedLinkHref("https://a.b"), true);
  assert.equal(isAllowedLinkHref("http://a.b"), true);
  assert.equal(isAllowedLinkHref("mailto:x@y.z"), true);
  assert.equal(isAllowedLinkHref("tel:+123"), true);
});

test("isAllowedLinkHref rejects dangerous schemes", () => {
  assert.equal(isAllowedLinkHref("javascript:alert(1)"), false);
  assert.equal(isAllowedLinkHref("data:text/html,x"), false);
  assert.equal(isAllowedLinkHref("file:///etc/passwd"), false);
});

// ── request slot ──

test("request slot: peek is non-consuming and identity-keyed", () => {
  const editorA = { id: "a" } as unknown as Editor;
  const editorB = { id: "b" } as unknown as Editor;

  requestInlineLinkInput(editorA);

  assert.equal(peekInlineLinkRequest(editorA), true);
  assert.equal(peekInlineLinkRequest(editorA), true, "peek must not consume");
  assert.equal(
    peekInlineLinkRequest(editorB),
    false,
    "other editor must not match",
  );

  assert.equal(
    takeInlineLinkRequest(editorB),
    false,
    "take by other editor consumes nothing",
  );
  assert.equal(
    peekInlineLinkRequest(editorA),
    true,
    "failed take must not clear the slot",
  );
});

test("request slot: take consumes exactly once", () => {
  const editorA = { id: "a2" } as unknown as Editor;

  requestInlineLinkInput(editorA);
  assert.equal(takeInlineLinkRequest(editorA), true);
  assert.equal(takeInlineLinkRequest(editorA), false, "second take must fail");
  assert.equal(
    peekInlineLinkRequest(editorA),
    false,
    "slot empty after consume",
  );

  assert.equal(
    takeInlineLinkRequest(editorA),
    false,
    "take with no request returns false",
  );
});

// ── findLinkHrefInRange ──

test("findLinkHrefInRange returns the first link href in the selection", () => {
  const schema = new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: { group: "block", content: "text*" },
      text: { inline: true },
    },
    marks: {
      link: {
        attrs: { href: { default: "" } },
        toDOM: () => ["a", { href: "" }, 0],
        parseDOM: [{ tag: "a[href]" }],
      },
    },
  });

  const linkMark = schema.mark("link", { href: "https://x.example" });
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("plain "),
      schema.text("linked", [linkMark]),
    ]),
  ]);
  const state = EditorState.create({ doc });

  // Selection over plain text only (positions 1-6) -> null.
  const plainState = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 1, 5)),
  );
  assert.equal(findLinkHrefInRange(plainState), null);

  // Selection over the linked word (positions 7-13) -> href.
  const linkedState = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 7, 13)),
  );
  assert.equal(findLinkHrefInRange(linkedState), "https://x.example");
});
