import type { Block } from "../../types";

/**
 * JStudio 视角的"文档是否为空"判定。
 *
 * 为什么不能直接用 TipTap 的 `editor.isEmpty`：TipTap 的 `isNodeEmpty`
 * 只看节点 content、不看 attrs——body 为空但 attrs 有内容的块（如带
 * 标题的空代码块）会被误判为"空节点"，进而把整篇文档判成空文档，
 * 导致空文档 placeholder 在明明有可见块时显示。这里以 Block[] 为准：
 * 任何非 text 块一律视为"有内容"，与块的内部表示（attrs vs content）
 * 完全解耦。
 *
 * 文档为空 ⟺ 没有任何块，或只有一个内容为空的 text 块。
 */
export function isDocumentEmpty(blocks: Block[]): boolean {
  if (blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const only = blocks[0];
  if (only.type !== "text") return false;
  if (typeof only.content === "string") return only.content.trim() === "";
  return only.content.every((seg) => seg.text.trim() === "");
}
