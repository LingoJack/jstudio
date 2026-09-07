import { test } from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { fitTiptapJSON } from "./schemaFit";

// Mirrors the editor's schema: a block-level Image and nested task lists are
// what make the markdown parser's output invalid in the first place.
const schema = getSchema([
  StarterKit.configure({ codeBlock: false, link: false, trailingNode: false }),
  Image.configure({ inline: false, allowBase64: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
]);

const text = (value: string): JSONContent => ({ type: "text", text: value });

const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

/** Throws when `json` does not satisfy the schema — same check Tiptap runs. */
function assertValid(json: JSONContent): JSONContent {
  Node.fromJSON(schema, json).check();
  return json;
}

test("paragraph nested in a paragraph is lifted out as a sibling", () => {
  const fitted = fitTiptapJSON(
    doc({
      type: "paragraph",
      content: [text("下载文件（Desktop 走 shell/saveAs；Web 走 "), { type: "paragraph", content: [text("嵌套段落")] }],
    }),
    schema,
  );
  assert.deepEqual(assertValid(fitted), doc(
    { type: "paragraph", content: [text("下载文件（Desktop 走 shell/saveAs；Web 走 ")] },
    { type: "paragraph", content: [text("嵌套段落")] },
  ));
});

test("block image inside a paragraph is lifted out, not dropped", () => {
  const fitted = fitTiptapJSON(
    doc({ type: "paragraph", content: [text("图："), { type: "image", attrs: { src: "a.png" } }] }),
    schema,
  );
  assert.deepEqual(assertValid(fitted), doc(
    { type: "paragraph", content: [text("图：")] },
    { type: "image", attrs: { src: "a.png" } },
  ));
});

test("image inside a list item stays in the item, after its paragraph", () => {
  const fitted = fitTiptapJSON(
    doc({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [text("文字"), { type: "hardBreak" }, { type: "image", attrs: { src: "a.png" } }] },
          ],
        },
      ],
    }),
    schema,
  );
  assert.deepEqual(assertValid(fitted), doc({
    type: "bulletList",
    content: [
      {
        type: "listItem",
        content: [
          { type: "paragraph", content: [text("文字"), { type: "hardBreak" }] },
          { type: "image", attrs: { src: "a.png" } },
        ],
      },
    ],
  }));
});

test("heading as a list item's first child becomes a paragraph", () => {
  const fitted = fitTiptapJSON(
    doc({
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "heading", attrs: { level: 2 }, content: [text("标题")] }] },
      ],
    }),
    schema,
  );
  assert.deepEqual(assertValid(fitted), doc({
    type: "bulletList",
    content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("标题")] }] }],
  }));
});

test("a container emptied by the repairs gets a paragraph back", () => {
  const fitted = fitTiptapJSON(doc({ type: "blockquote", content: [] }), schema);
  assert.deepEqual(assertValid(fitted), doc({ type: "blockquote", content: [{ type: "paragraph" }] }));
});

test("valid content is left untouched", () => {
  const valid = doc(
    { type: "heading", attrs: { level: 1 }, content: [text("标题")] },
    { type: "paragraph", content: [text("正文"), { type: "hardBreak" }] },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [text("待办")] }] },
      ],
    },
  );
  assert.deepEqual(fitTiptapJSON(valid, schema), valid);
});
