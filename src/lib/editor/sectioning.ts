import type { Block } from '../../types';

/** Target number of top-level blocks per section. */
export const SECTION_SIZE = 30;
/** A section is split when it grows beyond this (e.g. after inserting many
 *  blocks). Splitting keeps each ProseMirror instance small so typing stays
 *  fast. Set above SECTION_SIZE so a section isn't split the moment it's
 *  created (sections are created at exactly SECTION_SIZE). */
export const SECTION_MAX = Math.round(SECTION_SIZE * 1.6); // 48
/** Two adjacent sections are merged when their combined size is at or below
 *  this (e.g. after deleting many blocks), avoiding a proliferation of tiny
 *  sections. Kept below SECTION_SIZE so a freshly-split section (~SECTION_SIZE
 *  each) isn't immediately re-merged. */
export const SECTION_MERGE_BELOW = Math.round(SECTION_SIZE * 0.5); // 15

export interface SectionState {
  id: string;
  blocks: Block[];
  /** When set, after (re)mount this section joins the block at this index
   *  into the previous one — used to complete a cross-section Backspace
   *  merge with native ProseMirror semantics. */
  pendingMergeBoundary?: number | null;
}

export function splitIntoSections(blocks: Block[]): SectionState[] {
  if (blocks.length === 0) {
    return [{ id: 'sec-0', blocks: [] }];
  }
  const sections: SectionState[] = [];
  for (let i = 0; i < blocks.length; i += SECTION_SIZE) {
    sections.push({
      id: `sec-${i / SECTION_SIZE}`,
      blocks: blocks.slice(i, i + SECTION_SIZE),
    });
  }
  // Fold a small trailing remainder into the previous section instead of
  // leaving it as its own section. Without this, a document whose block
  // count is just over a multiple of SECTION_SIZE (e.g. 31 blocks, ending
  // in a lone trailing empty paragraph) produces a final section that is
  // its own tiny/empty ProseMirror doc. TipTap's Placeholder extension then
  // marks that section's editor as `is-editor-empty` (a doc with a single
  // empty paragraph is "empty" from that section's own point of view) and
  // renders the empty-document placeholder — even though the document as a
  // whole clearly has content in the earlier sections. Merging the small
  // tail avoids ever creating that misleading standalone-empty section.
  if (sections.length > 1) {
    const last = sections[sections.length - 1];
    if (last.blocks.length <= SECTION_MERGE_BELOW) {
      const prev = sections[sections.length - 2];
      prev.blocks = [...prev.blocks, ...last.blocks];
      sections.pop();
    }
  }
  return sections;
}
