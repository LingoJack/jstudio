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
  return sections;
}
